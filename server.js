const express     = require('express');
const mysql       = require('mysql2');
const cors        = require('cors');
const bodyParser  = require('body-parser');
const session     = require('express-session');
const path        = require('path');

const app = express();

app.use(cors());
app.use(bodyParser.json());

// ─── SESSION SETUP ───────────────────────────────────────────
app.set('trust proxy', 1); // Required for Render / reverse proxies
app.use(session({
  secret: 'sree-electricals-secret-key',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    secure: true,          // Must be true on Render (HTTPS)
    sameSite: 'none',      // Required for cross-origin cookie on Render
    maxAge: 1000 * 60 * 60 // 1 hour
  }
}));

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

// ─── AUTH MIDDLEWARE ─────────────────────────────────────────
function requireLogin(req, res, next) {
  if (req.session && req.session.isLoggedIn) {
    next();
  } else {
    res.redirect('/login.html');
  }
}

// ─── PUBLIC ROUTES ───────────────────────────────────────────
// Root → always go to login
app.get('/', (req, res) => {
  if (req.session && req.session.isLoggedIn) {
    return res.redirect('/dashboard.html');
  }
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Login page — if already logged in, redirect to dashboard
app.get('/login.html', (req, res) => {
  if (req.session && req.session.isLoggedIn) {
    return res.redirect('/dashboard.html');
  }
  res.sendFile(path.join(__dirname, 'login.html'));
});

// ─── PROTECTED ROUTES ────────────────────────────────────────
app.get('/dashboard.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'dashboard.html'));
});

app.get('/billing.html', requireLogin, (req, res) => {
  res.sendFile(path.join(__dirname, 'billing.html'));
});

// Block any other .html file — redirect to login
app.get('*.html', (req, res) => {
  res.redirect('/login.html');
});

// ─── LOGIN ───────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, results) => {
      if (err) return res.status(500).json({ success: false });
      if (results.length > 0) {
        req.session.isLoggedIn = true;
        req.session.user = username;
        res.json({ success: true, username: username }); // ← send username to frontend
      } else {
        res.json({ success: false });
      }
    }
  );
});

// ─── LOGOUT ──────────────────────────────────────────────────
app.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).json({ success: false });
    res.json({ success: true });
  });
});

// ─── WHO AM I (returns logged-in username) ───────────────────
app.get('/me', requireLogin, (req, res) => {
  res.json({ username: req.session.user || '' });
});

// ─── GST ─────────────────────────────────────────────────────
app.get('/gst', requireLogin, (req, res) => {
  db.query('SELECT gst_value FROM settings LIMIT 1', (err, results) => {
    if (err || results.length === 0) return res.json({ gst: 0 });
    res.json({ gst: results[0].gst_value });
  });
});

// ─── START ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
