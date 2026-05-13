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

// ─── AUTH MIDDLEWARE (JWT) ────────────────────────────────────
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

// ─── STATIC FILES ─────────────────────────────────────────────
// Serve login.html publicly, protect others via middleware
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// Protected HTML pages — token check done client-side (JS guard)
// Server just serves the file; JS on page will redirect if no token
app.use(express.static(path.join(__dirname)));

// ─── LOGIN ───────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query(
    'SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password],
    (err, results) => {
      if (err) return res.status(500).json({ success: false });
      if (results.length > 0) {
        // Create JWT token — valid for 8 hours
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
// JWT is stateless — logout is handled client-side by deleting token
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

// ─── START ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});