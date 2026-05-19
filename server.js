const express    = require('express');
const mysql      = require('mysql2');
const cors       = require('cors');
const bodyParser = require('body-parser');
const jwt        = require('jsonwebtoken');
const path       = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const JWT_SECRET = 'sree-electricals-jwt-secret-2024';

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

// ─── DATABASE POOL ───────────────────────────────────────────────────
// Pool handles idle-timeout reconnects automatically (no more ECONNRESET)
const db = mysql.createPool({
  host:               process.env.DB_HOST     || 'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com',
  port:               process.env.DB_PORT     || 3306,
  user:               process.env.DB_USER     || 'utkpn8wzxl290hqx',
  password:           process.env.DB_PASSWORD || 'i6AZV2A3QoiqjQT9i3QI',
  database:           process.env.DB_NAME     || 'bgkwzqnaueygs0sltdxg',
  waitForConnections: true,
  connectionLimit:    3,
  queueLimit:         0,
  enableKeepAlive:    true,
  keepAliveInitialDelay: 0
});

setTimeout(() => {
  db.getConnection((err, conn) => {
    if (err) { console.error('❌ DB connection failed:', err.message); return; }
    console.log('✅ Connected to MySQL');
    // Check all required tables exist and log any missing ones
    const required = ['users', 'settings', 'elite_products', 'bill_counter', 'bill_history'];
    required.forEach(tbl => {
      conn.query(`SELECT 1 FROM ${tbl} LIMIT 1`, (e) => {
        if (e) console.error(`⚠️  Table MISSING or error: ${tbl} — ${e.message}`);
        else   console.log(`   ✔ Table OK: ${tbl}`);
      });
    });
    conn.release();
  });
}, 3000);


// ─── AUTO-CLEANUP: delete bill_history rows older than 2 years ───────
// Runs once 10 s after startup (DB pool ready), then every 24 hours.
function purgeOldBills() {
  db.query(
    `DELETE FROM bill_history WHERE created_at < DATE_SUB(NOW(), INTERVAL 2 YEAR)`,
    (err, result) => {
      if (err) {
        console.error("\u26a0\ufe0f  Auto-purge error:", err.message);
      } else {
        const n = result.affectedRows;
        if (n > 0) console.log(`\uD83D\uDDD1\uFE0F  Auto-purge: removed ${n} bill(s) older than 2 years`);
        else        console.log("\uD83D\uDDD1\uFE0F  Auto-purge: no bills older than 2 years");
      }
    }
  );
}
setTimeout(() => {
  purgeOldBills();
  setInterval(purgeOldBills, 24 * 60 * 60 * 1000);
}, 10000);
// ─── AUTH MIDDLEWARE (API) ───────────────────────────────────────────
// Protects API routes — checks Authorization header OR cookie.
function requireLogin(req, res, next) {
  const token = req.headers['authorization'] || (req.cookies && req.cookies.authToken);
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ─── AUTH MIDDLEWARE (HTML PAGES) ────────────────────────────────────
// Protects HTML pages — checks httpOnly cookie. Redirects to /login if missing.
function requirePage(req, res, next) {
  const token = req.cookies && req.cookies.authToken;
  if (!token) return res.redirect('/login');
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.clearCookie('authToken');
    return res.redirect('/login');
  }
}

// ─── TOKEN VERIFY ────────────────────────────────────────────────────
// Called by login.html to check if existing token is valid before redirecting.
app.get('/verify-token', (req, res) => {
  const token = req.headers['authorization'];
  if (!token) return res.json({ valid: false });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ valid: true, username: decoded.username, billingType: decoded.billingType });
  } catch {
    res.json({ valid: false });
  }
});

// ─── STATIC FILES (public assets only — no HTML pages) ─────────────
// Serve only css/js/fonts etc. HTML pages are protected by requirePage below.
app.use(express.static(path.join(__dirname), {
  index: false,
  extensions: [] // don't auto-serve .html files
}));

// ─── PUBLIC PAGES (no auth needed) ───────────────────────────────────
// Always serve the login page for / and /login — NEVER auto-redirect to dashboard.
// The client (login.html) is responsible for checking token validity via /verify-token
// and redirecting if appropriate. Doing it server-side here would bypass the login UI.
app.get('/',      (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// ─── PROTECTED PAGES (server-side cookie auth) ───────────────────────
const protectedPages = {
  '/dashboard':       'dashboard.html',
  '/billing':         'billing.html',
  '/elite-dashboard': 'elite-dashboard.html',
  '/elite-billing':   'elite-billing.html',
  '/elite-history':   'elite-history.html',
  '/customer-history':'customer-history.html',
};
Object.entries(protectedPages).forEach(([route, file]) => {
  app.get(route, requirePage, (req, res) =>
    res.sendFile(path.join(__dirname, file))
  );
});

// Block direct .html access for protected pages
const blockedHtml = [
  'elite-dashboard.html','elite-billing.html','elite-history.html',
  'dashboard.html','billing.html','customer-history.html'
];
blockedHtml.forEach(file => {
  app.get('/' + file, requirePage, (req, res) =>
    res.sendFile(path.join(__dirname, file))
  );
});

// ─── LOGIN ───────────────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password, billingType } = req.body;
  if (!username || !password)
    return res.status(400).json({ success: false, message: 'Missing credentials' });

  db.query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, results) => {
      if (err) { console.error('Login DB error:', err.message); return res.status(500).json({ success: false }); }
      if (results.length > 0) {
        const token = jwt.sign(
          { username, billingType: billingType || 'billing' },
          JWT_SECRET,
          { expiresIn: '8h' }
        );
        // Set secure httpOnly cookie for page-level auth
        res.cookie('authToken', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'strict',
          maxAge: 8 * 60 * 60 * 1000 // 8 hours
        });
        res.json({ success: true, token, username, billingType: billingType || 'billing' });
      } else {
        res.json({ success: false, message: 'Invalid credentials' });
      }
    }
  );
});

// ─── WHO AM I ────────────────────────────────────────────────────────
app.get('/me', requireLogin, (req, res) => {
  res.json({ username: req.user.username, billingType: req.user.billingType });
});

// ─── LOGOUT ──────────────────────────────────────────────────────────
app.post('/logout', (req, res) => {
  res.clearCookie('authToken');
  res.json({ success: true });
});

// ─── NEXT BILL NUMBER ────────────────────────────────────────────────
// Sequential per calendar day: BILL-YYYYMMDD-1, -2, -3 …
// Atomic upsert ensures no duplicates under concurrent requests.
app.get('/next-bill-no', requireLogin, (req, res) => {
  const ist     = new Date(Date.now() + 5.5 * 60 * 60 * 1000); // shift UTC → IST
  const dateStr = ist.getUTCFullYear().toString() +
    (ist.getUTCMonth()+1).toString().padStart(2,'0') +
    ist.getUTCDate().toString().padStart(2,'0');

  db.query(
    `INSERT INTO bill_counter (bill_date, counter) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE counter = counter + 1`,
    [dateStr],
    (err) => {
      if (err) { console.error('Counter error:', err.message); return res.status(500).json({ error: 'Counter error' }); }
      db.query(
        'SELECT counter FROM bill_counter WHERE bill_date = ?',
        [dateStr],
        (err, rows) => {
          if (err || rows.length === 0) return res.status(500).json({ error: 'Fetch error' });
          res.json({ billNo: `BILL-${dateStr}-${rows[0].counter}` });
        }
      );
    }
  );
});

// ─── PRODUCTS ────────────────────────────────────────────────────────
// Table: products (id, section, product, brand, spec, unit, price, warranty, guarantee)
// GET /products?search=bulb&section=Lighting
app.get('/products', requireLogin, (req, res) => {
  const { search, section } = req.query;
  let sql = `SELECT id, section, product AS product_name, brand AS company,
                    price, warranty, guarantee
             FROM products WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (product LIKE ? OR brand LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  if (section && section !== 'All') {
    sql += ' AND section = ?';
    params.push(section);
  }
  sql += ' ORDER BY product LIMIT 100';
  db.query(sql, params, (err, results) => {
    if (err) { console.error('Products error:', err.message); return res.status(500).json({ error: 'DB error' }); }
    res.json(results);
  });
});

// GET /sections — all distinct product sections for filter chips
app.get('/sections', requireLogin, (req, res) => {
  db.query('SELECT DISTINCT section FROM products ORDER BY section', (err, results) => {
    if (err) { console.error('Sections error:', err.message); return res.status(500).json({ error: 'DB error' }); }
    res.json(results.map(r => r.section));
  });
});

// ─── ELITE PRODUCTS ──────────────────────────────────────────────────
// Table: elite_products (id, product_name, company, price)
// GET /elite-products?search=bulb
app.get('/elite-products', requireLogin, (req, res) => {
  const { search } = req.query;
  let sql = 'SELECT id, product_name, company, price FROM elite_products WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (product_name LIKE ? OR company LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  sql += ' ORDER BY product_name LIMIT 100';
  db.query(sql, params, (err, results) => {
    if (err) { console.error('Elite products error:', err.message); return res.status(500).json({ error: 'DB error' }); }
    res.json(results);
  });
});

// GET /elite-ping — health check for elite dashboard DB status
app.get('/elite-ping', requireLogin, (req, res) => {
  db.query('SELECT COUNT(*) AS cnt FROM elite_products', (err, results) => {
    if (err) { console.error('Elite ping error:', err.message); return res.status(500).json({ error: 'DB error' }); }
    res.json({ ok: true, count: results[0].cnt });
  });
});

// ─── BILL HISTORY (Elite Billing — save & retrieve) ──────────────────

// POST /save-bill — save a completed bill to history
app.post('/save-bill', requireLogin, (req, res) => {
  const { billNo, customerName, customerPhone, items, grandTotal, dateTime } = req.body;
  if (!billNo || !customerName)
    return res.status(400).json({ error: 'billNo and customerName are required' });

  db.query(
    `INSERT INTO bill_history
      (bill_no, customer_name, customer_phone, items_json, grand_total, bill_datetime)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [billNo, customerName, customerPhone || null, JSON.stringify(items), grandTotal, dateTime],
    (err) => {
      if (err) { console.error('Save bill error:', err.message); return res.status(500).json({ error: 'DB error' }); }
      res.json({ success: true });
    }
  );
});

// GET /bill-history?phone=9876543210 OR ?name=Seeni
app.get('/bill-history', requireLogin, (req, res) => {
  const { phone, name } = req.query;
  if (!phone && !name)
    return res.status(400).json({ error: 'Provide phone or name' });

  let sql = 'SELECT * FROM bill_history WHERE 1=1';
  const params = [];
  if (phone) { sql += ' AND customer_phone = ?'; params.push(phone); }
  if (name)  { sql += ' AND customer_name LIKE ?'; params.push(`%${name}%`); }
  sql += ' ORDER BY created_at DESC'; // sort by real timestamp, not string field

  db.query(sql, params, (err, results) => {
    if (err) { console.error('Bill history error:', err.message); return res.status(500).json({ error: 'DB error' }); }
    res.json(results);
  });
});

// GET /bill-history/:billNo — single bill preview
app.get('/bill-history/:billNo', requireLogin, (req, res) => {
  db.query('SELECT * FROM bill_history WHERE bill_no = ?', [req.params.billNo], (err, results) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (results.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(results[0]);
  });
});

// ─── GST ─────────────────────────────────────────────────────────────
app.get('/gst', requireLogin, (req, res) => {
  db.query('SELECT gst_value FROM settings LIMIT 1', (err, results) => {
    if (err || results.length === 0) return res.json({ gst: 0 });
    res.json({ gst: results[0].gst_value });
  });
});

// ─── START ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
