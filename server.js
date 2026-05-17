const express    = require('express');
const mysql      = require('mysql2');
const cors       = require('cors');
const bodyParser = require('body-parser');
const jwt        = require('jsonwebtoken');
const path       = require('path');

const app = express();
const JWT_SECRET = 'sree-electricals-jwt-secret-2024';

app.use(cors());
app.use(bodyParser.json());

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
    if (err) console.error('❌ DB connection failed:', err.message);
    else     { console.log('✅ Connected to MySQL'); conn.release(); }
  });
}, 3000);

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────────────
// All HTML pages served freely — auth enforced client-side via localStorage JWT.
// Only /api calls are protected here.
function requireLogin(req, res, next) {
  const token = req.headers['authorization'];
  if (!token) return res.status(401).json({ error: 'Not logged in' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
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

// ─── STATIC FILES ────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname)));

// ─── CLEAN URLS (no .html needed) ────────────────────────────────────
const pageMap = {
  '/':                   'login.html',
  '/login':              'login.html',
  '/dashboard':          'dashboard.html',
  '/billing':            'billing.html',
  '/elite-dashboard':    'elite-dashboard.html',
  '/elite-billing':      'elite-billing.html',
  '/elite-history':      'elite-history.html',
  '/customer-history':   'customer-history.html',
};
Object.entries(pageMap).forEach(([route, file]) => {
  app.get(route, (req, res) =>
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
app.post('/logout', (req, res) => res.json({ success: true }));

// ─── NEXT BILL NUMBER ────────────────────────────────────────────────
// Sequential per calendar day: BILL-YYYYMMDD-1, -2, -3 …
// Atomic upsert ensures no duplicates under concurrent requests.
app.get('/next-bill-no', requireLogin, (req, res) => {
  const today   = new Date();
  const dateStr = today.getFullYear().toString() +
    (today.getMonth()+1).toString().padStart(2,'0') +
    today.getDate().toString().padStart(2,'0');

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

// ─── PRODUCTS (Elite Dashboard — searches elite_products table) ──────
// Table schema: elite_products(id, product_name, company, price)
// GET /products?search=bulb
app.get('/products', requireLogin, (req, res) => {
  const { search } = req.query;
  let sql    = 'SELECT id, product_name, company, price FROM elite_products WHERE 1=1';
  const params = [];
  if (search) {
    sql += ' AND (product_name LIKE ? OR company LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY product_name LIMIT 50';
  db.query(sql, params, (err, results) => {
    if (err) { console.error('Products error:', err.message); return res.status(500).json({ error: 'DB error' }); }
    res.json(results);
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
  sql += ' ORDER BY bill_datetime DESC';

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
