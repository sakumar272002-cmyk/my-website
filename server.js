const express     = require('express');
const mysql       = require('mysql2');
const cors        = require('cors');
const bodyParser  = require('body-parser');
const jwt         = require('jsonwebtoken');
const path        = require('path');

const app = express();
const JWT_SECRET = 'sree-electricals-jwt-secret-2024';

app.use(cors());
app.use(bodyParser.json());

// ─── DATABASE ────────────────────────────────────────────────
const db = mysql.createConnection({
  host:     process.env.DB_HOST     || 'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'utkpn8wzxl290hqx',
  password: process.env.DB_PASSWORD || 'i6AZV2A3QoiqjQT9i3QI',
  database: process.env.DB_NAME     || 'bgkwzqnaueygs0sltdxg'
});

db.connect((err) => {
  if (err) { console.error('❌ Database connection failed:', err.message); }
  else      { console.log('✅ Connected to MySQL database'); }
});

// ─── AUTH MIDDLEWARE (API routes) ────────────────────────────
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

// ─── HTML PAGE GUARD ─────────────────────────────────────────
// Checks JWT from ?token= query param BEFORE serving any protected HTML.
// express.static is blocked for .html files (see below) so this is the
// only way to reach dashboard.html / billing.html etc.
function requireLoginPage(req, res, next) {
  const token = req.query.token;
  if (!token) return res.redirect('/login.html');
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.redirect('/login.html');
  }
}

// ─── STATIC ASSETS (non-HTML only) ───────────────────────────
// Block all .html files from being served as static files.
// This forces every HTML page request through the explicit routes below.
app.use((req, res, next) => {
  if (req.path.endsWith('.html')) {
    // Don't serve .html via static — fall through to named routes
    return next();
  }
  express.static(path.join(__dirname))(req, res, next);
});

// ─── PUBLIC PAGES ────────────────────────────────────────────
app.get('/',           (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// ─── PROTECTED HTML PAGES ────────────────────────────────────
// Any direct URL hit without ?token= → redirect to login
app.get('/dashboard.html',        requireLoginPage, (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/billing.html',          requireLoginPage, (req, res) => res.sendFile(path.join(__dirname, 'billing.html')));
app.get('/customer-history.html', requireLoginPage, (req, res) => res.sendFile(path.join(__dirname, 'customer-history.html')));

// Catch any other .html request and redirect to login
app.get('/*.html', (req, res) => res.redirect('/login.html'));

// ─── LOGIN ───────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, results) => {
      if (err) return res.status(500).json({ success: false });
      if (results.length > 0) {
        const token = jwt.sign(
          { username: username },
          JWT_SECRET,
          { expiresIn: '8h' }
        );
        res.json({ success: true, token: token, username: username });
      } else {
        res.json({ success: false });
      }
    }
  );
});

// ─── LOGOUT ──────────────────────────────────────────────────
app.post('/logout', (req, res) => {
  res.json({ success: true });
});

// ─── WHO AM I ────────────────────────────────────────────────
app.get('/me', requireLogin, (req, res) => {
  res.json({ username: req.user.username });
});

// ─── GST ─────────────────────────────────────────────────────
app.get('/gst', requireLogin, (req, res) => {
  db.query('SELECT gst_value FROM settings LIMIT 1', (err, results) => {
    if (err || results.length === 0) return res.json({ gst: 0 });
    res.json({ gst: results[0].gst_value });
  });
});

// ─── NEXT BILL NUMBER ────────────────────────────────────────
// Returns next sequential bill number for today: BILL-YYYYMMDD-1, -2, -3...
// Stores in DB table: bill_counter (date DATE, counter INT)
app.get('/next-bill-no', requireLogin, (req, res) => {
  const today = new Date();
  const dateStr = today.getFullYear().toString() +
    (today.getMonth()+1).toString().padStart(2,'0') +
    today.getDate().toString().padStart(2,'0');

  // Ensure table exists
  db.query(
    `CREATE TABLE IF NOT EXISTS bill_counter (
       bill_date VARCHAR(8) PRIMARY KEY,
       counter   INT NOT NULL DEFAULT 0
     )`,
    (err) => {
      if (err) return res.status(500).json({ error: 'DB error' });

      // Upsert: increment counter for today
      db.query(
        `INSERT INTO bill_counter (bill_date, counter) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE counter = counter + 1`,
        [dateStr],
        (err) => {
          if (err) return res.status(500).json({ error: 'Counter error' });

          // Fetch the new counter value
          db.query(
            'SELECT counter FROM bill_counter WHERE bill_date = ?',
            [dateStr],
            (err, results) => {
              if (err || results.length === 0) return res.status(500).json({ error: 'Fetch error' });
              const billNo = `BILL-${dateStr}-${results[0].counter}`;
              res.json({ billNo });
            }
          );
        }
      );
    }
  );
});

// ─── START ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
