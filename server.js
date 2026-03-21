const express    = require('express');
const mysql      = require('mysql2');
const cors       = require('cors');
const bodyParser = require('body-parser');
const path       = require('path');

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname)));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));

// ─── DATABASE ───────────────────────────────────────────────
const db = mysql.createConnection({
  host:     'localhost',
  user:     'root',
  password: 'Ashok@1234',        // ← your MySQL password here
  database: 'mywebsite'
});

db.connect((err) => {
  if (err) { console.error('❌ Database connection failed:', err.message); }
  else      { console.log('✅ Connected to MySQL database'); }
});

// ─── LOGIN ──────────────────────────────────────────────────
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.query('SELECT * FROM users WHERE username = ? AND password = ?',
    [username, password], (err, results) => {
      if (err) return res.status(500).json({ success: false });
      res.json({ success: results.length > 0 });
    });
});

// ─── GST ────────────────────────────────────────────────────
app.get('/gst', (req, res) => {
  db.query('SELECT gst_value FROM settings LIMIT 1', (err, results) => {
    if (err || results.length === 0) return res.json({ gst: 0 });
    res.json({ gst: results[0].gst_value });
  });
});

// ─── START ──────────────────────────────────────────────────
app.listen(3000, () => {
  console.log('🚀 Server running at http://localhost:3000');
  console.log('👉 Open Chrome and go to: http://localhost:3000');
});
