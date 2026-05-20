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
// ✏️  Change these values to match YOUR database credentials
const pool = mysql.createPool({
  host:     process.env.DB_HOST     || 'localhost',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'root',
  password: process.env.DB_PASS     || 'your_password_here',
  database: process.env.DB_NAME     || 'sree_electricals',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
});

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
app.listen(PORT, () => {
  console.log(`\n✅  Sree Electricals Storage Server running on http://localhost:${PORT}`);
  console.log(`   Open storage page → http://localhost:${PORT}/storage.html\n`);
});
