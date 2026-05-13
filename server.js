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

// ─── DATABASE ────────────────────────────────────────────────
const db = mysql.createConnection({
  host:     process.env.DB_HOST     || 'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'utkpn8wzxl290hqx',
  password: process.env.DB_PASSWORD || 'i6AZV2A3QoiqjQT9i3QI',
  database: process.env.DB_NAME     || 'bgkwzqnaueygs0sltdxg'
});

db.connect(err => {
  if (err) { console.error('❌ Database connection failed:', err.message); }
  else {
    console.log('✅ Connected to MySQL database');
    runMigrations();
  }
});

// ─── AUTO-CREATE TABLES ───────────────────────────────────────
function runMigrations() {
  // Products table (seeded from Excel)
  db.query(`
    CREATE TABLE IF NOT EXISTS products (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      section     VARCHAR(100) NOT NULL,
      product     VARCHAR(255) NOT NULL,
      brand       VARCHAR(100),
      spec        VARCHAR(255),
      unit        VARCHAR(100),
      rate        DECIMAL(12,2) DEFAULT 0,
      INDEX idx_section (section),
      INDEX idx_product (product)
    )
  `, err => { if (err) console.error('products table:', err.message); else console.log('✅ products table ready'); });

  // Elite billing history — phone is the primary customer key
  db.query(`
    CREATE TABLE IF NOT EXISTS elite_bills (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      phone       VARCHAR(10) NOT NULL,
      name        VARCHAR(255),
      section     VARCHAR(100),
      items       JSON,
      subtotal    DECIMAL(12,2),
      gst         DECIMAL(12,2),
      grand       DECIMAL(12,2),
      billed_by   VARCHAR(100),
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_phone (phone),
      INDEX idx_name  (name)
    )
  `, err => { if (err) console.error('elite_bills table:', err.message); else console.log('✅ elite_bills table ready'); });
}

// ─── AUTH MIDDLEWARE ──────────────────────────────────────────
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
app.get('/',          (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/login.html',(req, res) => res.sendFile(path.join(__dirname, 'login.html')));
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
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '8h' });
        res.json({ success: true, token, username });
      } else {
        res.json({ success: false });
      }
    }
  );
});

// ─── LOGOUT ──────────────────────────────────────────────────
app.post('/logout', (req, res) => res.json({ success: true }));

// ─── WHO AM I ────────────────────────────────────────────────
app.get('/me', requireLogin, (req, res) => res.json({ username: req.user.username }));

// ─── GST ─────────────────────────────────────────────────────
app.get('/gst', requireLogin, (req, res) => {
  db.query('SELECT gst_value FROM settings LIMIT 1', (err, results) => {
    if (err || !results.length) return res.json({ gst: 0 });
    res.json({ gst: results[0].gst_value });
  });
});

// ─── PRODUCTS (search) ───────────────────────────────────────
// Returns products filtered by section and optional search term
app.get('/products', requireLogin, (req, res) => {
  const { section, q } = req.query;
  let sql  = 'SELECT * FROM products WHERE 1=1';
  const params = [];
  if (section) { sql += ' AND section = ?'; params.push(section); }
  if (q)       { sql += ' AND (product LIKE ? OR brand LIKE ?)'; params.push('%'+q+'%','%'+q+'%'); }
  sql += ' LIMIT 50';
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── SAVE ELITE BILL ─────────────────────────────────────────
// Called from dashboard when Elite user downloads PDF
app.post('/save-bill', requireLogin, (req, res) => {
  const { phone, name, section, items, subtotal, gst, grand, billedBy } = req.body;

  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }

  db.query(
    `INSERT INTO elite_bills (phone, name, section, items, subtotal, gst, grand, billed_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [phone, name || 'Unknown', section, JSON.stringify(items), subtotal, gst, grand, billedBy || req.user.username],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ success: true, billId: result.insertId });
    }
  );
});

// ─── CUSTOMER BILLS (history lookup) ─────────────────────────
// GET /customer-bills?phone=9876543210  OR  ?name=Rajan
app.get('/customer-bills', requireLogin, (req, res) => {
  const { phone, name } = req.query;

  if (!phone && !name) {
    return res.status(400).json({ error: 'Provide phone or name' });
  }

  let sql, params;
  if (phone) {
    sql    = 'SELECT id, phone, name, created_at, grand FROM elite_bills WHERE phone = ? ORDER BY created_at DESC';
    params = [phone];
  } else {
    sql    = 'SELECT id, phone, name, created_at, grand FROM elite_bills WHERE name LIKE ? ORDER BY created_at DESC';
    params = ['%' + name + '%'];
  }

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// ─── PREVIEW BILL ────────────────────────────────────────────
// GET /preview-bill?id=42  — returns printable HTML of a saved bill
app.get('/preview-bill', requireLogin, (req, res) => {
  const { id } = req.query;
  db.query('SELECT * FROM elite_bills WHERE id = ?', [id], (err, rows) => {
    if (err || !rows.length) return res.status(404).send('<h3>Bill not found</h3>');
    const b = rows[0];
    const items = typeof b.items === 'string' ? JSON.parse(b.items) : b.items;

    const tableRows = items.map((r, i) => `
      <tr>
        <td>${i+1}</td><td>${r.product||''}</td><td>${r.brand||''}</td>
        <td>${r.qty||1}</td><td>${r.warranty||'-'} / ${r.guarantee||'-'}</td>
        <td>₹${(+r.price||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
        <td>₹${(+r.total||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td>
      </tr>`).join('');

    const dt = new Date(b.created_at).toLocaleString('en-IN');

    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"/><title>Bill #${b.id}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;color:#222;max-width:800px;margin:auto;}
      h2{color:#ff6b35;} .meta{color:#888;font-size:12px;margin-bottom:20px;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th{background:#ff6b35;color:#fff;padding:9px 12px;text-align:left;}
      td{padding:8px 12px;border-bottom:1px solid #f0e0d0;}
      tr:nth-child(even) td{background:#fff8f0;}
      .tot{text-align:right;margin-top:16px;font-size:14px;}
      .grand{font-size:18px;font-weight:700;color:#ff6b35;}
      @media print{.no-print{display:none;}}
    </style></head><body>
    <button class="no-print" onclick="window.print()" style="padding:8px 20px;background:#ff6b35;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-bottom:16px;">🖨 Print / Save PDF</button>
    <h2>Sree Electricals &amp; Electronics</h2>
    <div class="meta">
      Bill #${b.id} | Customer: <strong>${b.name}</strong> | Phone: <strong>${b.phone}</strong><br/>
      Section: ${b.section} | Date: ${dt} | Billed by: ${b.billed_by}
    </div>
    <table><thead><tr><th>Sl</th><th>Product</th><th>Company</th><th>Qty</th><th>W/G</th><th>Price</th><th>Total</th></tr></thead>
    <tbody>${tableRows}</tbody></table>
    <div class="tot">
      <div>Subtotal: ₹${(+b.subtotal||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>
      <div>GST: ₹${(+b.gst||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>
      <div class="grand">Grand Total: ₹${(+b.grand||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>
    </div>
    </body></html>`);
  });
});

// ─── START ───────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
