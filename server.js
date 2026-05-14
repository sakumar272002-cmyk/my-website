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

// ─── DATABASE POOL (handles idle-timeout reconnects automatically) ───
const db = mysql.createPool({
  host:               process.env.DB_HOST     || 'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com',
  port:               process.env.DB_PORT     || 3306,
  user:               process.env.DB_USER     || 'utkpn8wzxl290hqx',
  password:           process.env.DB_PASSWORD || 'i6AZV2A3QoiqjQT9i3QI',
  database:           process.env.DB_NAME     || 'bgkwzqnaueygs0sltdxg',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0
});

db.getConnection((err, conn) => {
  if (err) console.error('❌ DB connection failed:', err.message);
  else     { console.log('✅ Connected to MySQL'); conn.release(); }
});

// ─── API AUTH MIDDLEWARE ─────────────────────────────────────────────
// Protects only /api/* routes. HTML pages are served freely —
// auth is 100% client-side via localStorage JWT.
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

// ─── TOKEN VERIFY ENDPOINT ──────────────────────────────────────────
// login.html calls GET /verify-token with Authorization header to check
// if a stored token is still valid BEFORE deciding to redirect to dashboard.
// This prevents the case where an expired token causes an infinite loop.
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

// ─── STATIC FILES ───────────────────────────────────────────────────
// All HTML, CSS, JS served freely. No server-side page guards.
// Auth enforced per-page in client JS (see each .html file's IIFE guard).
app.use(express.static(path.join(__dirname)));

// ─── CLEAN URLS (no .html required) ─────────────────────────────────
// Fixes: copy-pasting /dashboard in new tab → used to 404, now works.
const pageMap = {
  '/login':            'login.html',
  '/dashboard':        'dashboard.html',
  '/billing':          'billing.html',
  '/customer-history': 'customer-history.html',
};
Object.entries(pageMap).forEach(([route, file]) => {
  app.get(route, (req, res) =>
    res.sendFile(path.join(__dirname, file))
  );
});

// Root → always login.html — user must login every time
app.get('/', (req, res) =>
  res.sendFile(path.join(__dirname, 'login.html'))
);

// ─── LOGIN ──────────────────────────────────────────────────────────
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
        res.json({ success: true, token, username });
      } else {
        res.json({ success: false, message: 'Invalid credentials' });
      }
    }
  );
});

// ─── WHO AM I ───────────────────────────────────────────────────────
app.get('/me', requireLogin, (req, res) => {
  res.json({ username: req.user.username, billingType: req.user.billingType });
});

// ─── LOGOUT ─────────────────────────────────────────────────────────
app.post('/logout', (req, res) => res.json({ success: true }));

// ─── NEXT BILL NUMBER ───────────────────────────────────────────────
// Sequential per calendar day: BILL-YYYYMMDD-1, -2, -3 …
// Atomic upsert ensures no duplicates even under concurrent requests.
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

// ─── PRODUCTS ───────────────────────────────────────────────────────
app.get('/products', requireLogin, (req, res) => {
  const { search, category } = req.query;
  let sql = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  if (search)   { sql += ' AND (name LIKE ? OR company LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }
  if (category) { sql += ' AND category = ?'; params.push(category); }
  sql += ' ORDER BY name LIMIT 50';
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(results);
  });
});

app.get('/categories', requireLogin, (req, res) => {
  db.query('SELECT DISTINCT category FROM products ORDER BY category', (err, results) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(results.map(r => r.category));
  });
});

// ─── BILL HISTORY (Elite billing only) ──────────────────────────────
app.post('/save-bill', requireLogin, (req, res) => {
  const { billNo, customerName, customerPhone, items, grandTotal, dateTime } = req.body;
  db.query(
    `INSERT INTO bill_history
      (bill_no, customer_name, customer_phone, items_json, grand_total, bill_datetime, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [billNo, customerName, customerPhone || null, JSON.stringify(items), grandTotal, dateTime, req.user.username],
    (err) => {
      if (err) { console.error('Save bill error:', err.message); return res.status(500).json({ error: 'DB error' }); }
      res.json({ success: true });
    }
  );
});

app.get('/bill-history', requireLogin, (req, res) => {
  const { phone, name } = req.query;
  let sql = 'SELECT * FROM bill_history WHERE 1=1';
  const params = [];
  if (phone) { sql += ' AND customer_phone = ?'; params.push(phone); }
  if (name)  { sql += ' AND customer_name LIKE ?'; params.push(`%${name}%`); }
  sql += ' ORDER BY bill_datetime DESC';
  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    res.json(results);
  });
});

app.get('/bill-history/:billNo', requireLogin, (req, res) => {
  db.query('SELECT * FROM bill_history WHERE bill_no = ?', [req.params.billNo], (err, results) => {
    if (err) return res.status(500).json({ error: 'DB error' });
    if (results.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(results[0]);
  });
});

// ─── DB SCHEMA INIT ─────────────────────────────────────────────────
function initDB() {
  const tables = [
    `CREATE TABLE IF NOT EXISTS users (
       id       INT AUTO_INCREMENT PRIMARY KEY,
       username VARCHAR(100) NOT NULL UNIQUE,
       password VARCHAR(255) NOT NULL
     )`,
    `CREATE TABLE IF NOT EXISTS products (
       id        INT AUTO_INCREMENT PRIMARY KEY,
       name      VARCHAR(255) NOT NULL,
       company   VARCHAR(255),
       category  VARCHAR(100),
       price     DECIMAL(10,2) DEFAULT 0,
       warranty  INT DEFAULT 0,
       guarantee INT DEFAULT 0
     )`,
    `CREATE TABLE IF NOT EXISTS bill_history (
       id             INT AUTO_INCREMENT PRIMARY KEY,
       bill_no        VARCHAR(50)  NOT NULL,
       customer_name  VARCHAR(255),
       customer_phone VARCHAR(15),
       items_json     TEXT,
       grand_total    DECIMAL(10,2),
       bill_datetime  VARCHAR(50),
       created_by     VARCHAR(100),
       created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
       INDEX idx_phone (customer_phone),
       INDEX idx_name  (customer_name)
     )`,
    `CREATE TABLE IF NOT EXISTS bill_counter (
       bill_date VARCHAR(8) PRIMARY KEY,
       counter   INT NOT NULL DEFAULT 0
     )`,
  ];
  tables.forEach(sql => db.query(sql, err => { if (err) console.error('Schema init:', err.message); }));
}
initDB();

// ─── START ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server at http://localhost:${PORT}`));
