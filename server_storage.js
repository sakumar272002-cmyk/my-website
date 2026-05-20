// ═══════════════════════════════════════════════════════════════
//  Sree Electricals — Storage API Server
//  Node.js + Express + MySQL
//
//  Endpoints served:
//    GET  /storage-products          → all products with stockOut & available
//    GET  /storage-transactions/:id  → buyer list for one product
//    POST /save-bill                 → called by billing page to record a sale
//    POST /logout                    → clears session / responds OK
//
//  Start:  node server.js
//  Requires: npm install express mysql2 cors
// ═══════════════════════════════════════════════════════════════

const express = require('express');
const mysql   = require('mysql2/promise');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// Serve storage.html (and any other static files) from the same folder
app.use(express.static(path.join(__dirname)));

// ── MySQL Connection Pool ─────────────────────────────────────
// ✏️  Uses the same DB credentials as your main server
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || 'your_password_here',
  database: process.env.DB_NAME     || 'bgkwzqnaueygs0sltdxg',  // ← your actual DB
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

// ── Auto-create storage tables if they don't exist ────────────
async function initStorageTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS storage_products (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        product    VARCHAR(200)  NOT NULL,
        brand      VARCHAR(100)  NOT NULL,
        stock_in   INT           NOT NULL DEFAULT 0,
        created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✓ Table OK: storage_products');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS storage_transactions (
        id             INT AUTO_INCREMENT PRIMARY KEY,
        product_id     INT           NOT NULL,
        bill_no        VARCHAR(50)   NOT NULL,
        customer_name  VARCHAR(150)  NOT NULL,
        customer_phone VARCHAR(20)   DEFAULT NULL,
        qty            INT           NOT NULL DEFAULT 1,
        amount         DECIMAL(10,2) NOT NULL DEFAULT 0,
        bill_datetime  VARCHAR(50)   DEFAULT NULL,
        created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_product (product_id),
        INDEX idx_bill    (bill_no)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    console.log('✓ Table OK: storage_transactions');

    // Insert sample products only if table is empty
    const [rows] = await pool.query('SELECT COUNT(*) AS cnt FROM storage_products');
    if (rows[0].cnt === 0) {
      await pool.query(`
        INSERT INTO storage_products (id, product, brand, stock_in) VALUES
          (1, '9W LED Bulb',           'Philips',    10),
          (2, 'Ceiling Fan 48"',       'Orient',      6),
          (3, 'MCB 32A Single Pole',   'Havells',    20),
          (4, 'PVC Conduit Pipe 25mm', 'Finolex',    50),
          (5, '5A Socket & Switch',    'Legrand',    15),
          (6, 'RCCB 40A 30mA',         'Schneider',   4),
          (7, 'Exhaust Fan 12"',       'Crompton',    8),
          (8, 'Copper Wire 1.5mm 90m', 'Polycab',    12)
      `);
      console.log('✓ Sample products inserted');
    }

    console.log('✅ Storage tables ready\n');
  } catch (err) {
    console.error('❌ Storage table init error:', err.message);
  }
}

// ── Auth middleware (simple token check) ─────────────────────
// The frontend sends: Authorization: <token>
// For a quick setup the token is just stored in localStorage.
// Replace this with a real JWT/session check if needed.
function requireAuth(req, res, next) {
  const token = req.headers['authorization'] || '';
  // Accept any non-empty token for now — tighten this later
  if (!token) {
    return res.status(401).json({ error: 'Unauthorised' });
  }
  next();
}

// ═══════════════════════════════════════════════════════════════
//  GET /storage-products
//  Returns each product with computed stockOut and available.
// ═══════════════════════════════════════════════════════════════
app.get('/storage-products', requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id,
        p.product,
        p.brand,
        p.stock_in     AS stockIn,
        COALESCE(SUM(t.qty), 0)            AS stockOut,
        p.stock_in - COALESCE(SUM(t.qty), 0) AS available
      FROM storage_products p
      LEFT JOIN storage_transactions t ON t.product_id = p.id
      GROUP BY p.id
      ORDER BY p.id
    `);
    res.json(rows);
  } catch (err) {
    console.error('GET /storage-products error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  GET /storage-transactions/:id
//  Returns all buyer rows for a given product_id.
// ═══════════════════════════════════════════════════════════════
app.get('/storage-transactions/:id', requireAuth, async (req, res) => {
  const productId = parseInt(req.params.id, 10);
  if (isNaN(productId)) return res.status(400).json({ error: 'Invalid id' });

  try {
    const [rows] = await pool.query(`
      SELECT
        id,
        bill_no,
        customer_name,
        customer_phone,
        qty,
        amount,
        bill_datetime,
        created_at
      FROM storage_transactions
      WHERE product_id = ?
      ORDER BY created_at DESC
    `, [productId]);
    res.json(rows);
  } catch (err) {
    console.error('GET /storage-transactions error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  POST /save-bill
//  Called by the billing page when a bill is finalised.
//
//  Expected body:
//  {
//    bill_no:       "BILL-20250520-3",
//    customer_name: "Kumar",
//    customer_phone:"9876543210",
//    bill_datetime: "20 May 2025, 3:42 PM",
//    items: [
//      { product_id: 1, qty: 2, amount: 180 },
//      { product_id: 3, qty: 5, amount: 250 }
//    ]
//  }
// ═══════════════════════════════════════════════════════════════
app.post('/save-bill', requireAuth, async (req, res) => {
  const { bill_no, customer_name, customer_phone, bill_datetime, items } = req.body;

  if (!bill_no || !customer_name || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    for (const item of items) {
      const { product_id, qty, amount } = item;
      if (!product_id || !qty) continue;

      await conn.query(`
        INSERT INTO storage_transactions
          (product_id, bill_no, customer_name, customer_phone, qty, amount, bill_datetime)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [product_id, bill_no, customer_name, customer_phone || null,
          qty, amount || 0, bill_datetime || null]);
    }

    await conn.commit();
    res.json({ success: true, message: 'Bill saved to storage.' });
  } catch (err) {
    await conn.rollback();
    console.error('POST /save-bill error:', err);
    res.status(500).json({ error: 'Database error', detail: err.message });
  } finally {
    conn.release();
  }
});

// ── Simple logout (stateless — just respond OK) ───────────────
app.post('/logout', (req, res) => {
  res.json({ success: true });
});

// ── Health check ──────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'connected' });
  } catch (err) {
    res.status(500).json({ status: 'error', db: err.message });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, async () => {
  console.log(`\n✅  Sree Electricals Storage Server running on http://localhost:${PORT}`);
  console.log(`   Open storage page → http://localhost:${PORT}/storage.html\n`);
  await initStorageTables();
});
