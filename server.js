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
    console.log(`   → host: ${process.env.DB_HOST || 'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com'}`);
    console.log(`   → database: ${process.env.DB_NAME || 'bgkwzqnaueygs0sltdxg'}`);

    // Check all required tables exist and log any missing ones
    const required = ['users', 'settings', 'elite_products', 'bill_counter', 'bill_history'];
    required.forEach(tbl => {
      conn.query(`SELECT 1 FROM ${tbl} LIMIT 1`, (e) => {
        if (e) console.error(`⚠️  Table MISSING or error: ${tbl} — ${e.message}`);
        else   console.log(`   ✔ Table OK: ${tbl}`);
      });
    });

    // ── Auto-create storage tables if missing ──────────────────────────
    conn.query(`
      CREATE TABLE IF NOT EXISTS storage_products (
        id         INT AUTO_INCREMENT PRIMARY KEY,
        product    VARCHAR(200)  NOT NULL,
        brand      VARCHAR(100)  NOT NULL,
        stock_in   INT           NOT NULL DEFAULT 0,
        created_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_product_brand (product, brand)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `, (e) => {
      if (e) { console.error('❌ storage_products create error:', e.message); return; }
      console.log('   ✔ Table OK: storage_products');

      // ── Retro-fit the UNIQUE(product, brand) guard on pre-existing tables ──
      // This is what actually stops a product like "12W LED Bulb" from ever
      // showing up twice in the Storage page: without it, re-running the
      // sync script, re-adding sample data, or the auto-sync trigger firing
      // for the same product just creates another row instead of being
      // merged/ignored. If the table already existed (created before this
      // fix), the CREATE TABLE IF NOT EXISTS above is a no-op, so we check
      // for the index explicitly and add it, first clearing out any
      // duplicate rows that would block the ALTER.
      conn.query(`
        SELECT COUNT(*) AS cnt FROM information_schema.statistics
        WHERE table_schema = DATABASE()
          AND table_name  = 'storage_products'
          AND index_name  = 'uniq_product_brand'
      `, (idxErr, idxRows) => {
        if (idxErr) {
          console.error('❌ storage_products index check error:', idxErr.message);
          return createStorageTransactions();
        }
        if (idxRows[0].cnt > 0) return createStorageTransactions();

        conn.query(`
          DELETE p1 FROM storage_products p1
          JOIN storage_products p2
            ON p1.product = p2.product
           AND p1.brand   = p2.brand
           AND p1.id > p2.id
        `, (dupErr, dupResult) => {
          if (dupErr) console.error('⚠️  Duplicate cleanup error:', dupErr.message);
          else if (dupResult.affectedRows > 0)
            console.log(`   🧹 Removed ${dupResult.affectedRows} duplicate storage_products row(s) (e.g. repeated "12W LED Bulb")`);

          conn.query(
            'ALTER TABLE storage_products ADD UNIQUE KEY uniq_product_brand (product, brand)',
            (alterErr) => {
              if (alterErr) console.error('⚠️  Could not add uniq_product_brand:', alterErr.message);
              else           console.log('   ✔ Added UNIQUE KEY (product, brand) to storage_products');
              createStorageTransactions();
            }
          );
        });
      });

      function createStorageTransactions() {
      conn.query(`
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
      `, (e2) => {
        if (e2) { console.error('❌ storage_transactions create error:', e2.message); return; }
        console.log('   ✔ Table OK: storage_transactions');

        // ── Sync storage_products FROM elite_products, min stock 10 ──────
        // Runs on every server start (Render redeploy/restart), so this
        // does NOT depend on someone manually running setup_storage_sync.js
        // against production. INSERT IGNORE + the uniq_product_brand key
        // mean: any elite_products row not yet in storage_products gets
        // added with stock_in = 10; rows already there (and their current
        // stock_in) are left untouched.
        conn.query(
          `INSERT IGNORE INTO storage_products (product, brand, stock_in)
           SELECT product_name, company, 10 FROM elite_products`,
          (syncErr, syncResult) => {
            if (syncErr) {
              console.error('❌ storage_products sync-from-elite_products error:', syncErr.message);
            } else if (syncResult.affectedRows > 0) {
              console.log(`   ✔ Synced ${syncResult.affectedRows} new product(s) from elite_products into storage_products (stock_in = 10)`);
            } else {
              console.log('   ✔ storage_products already up to date with elite_products');
            }

            // ── Remove stale rows that AREN'T in elite_products ──────────
            // This is what was causing storage to show 67 while
            // elite_products only had 57: 10 leftover rows from the old
            // hardcoded sample data (different names/brands than the real
            // catalog, e.g. "MCB 32A Single Pole"/Havells vs the real
            // "32A MCB"/Legrand) were never removed by the old sync, which
            // only ever added rows and never cleaned up. storage_products
            // is meant to mirror elite_products 1:1, so anything not in
            // elite_products gets removed here.
            conn.query(
              `DELETE sp FROM storage_products sp
               LEFT JOIN elite_products ep
                 ON sp.product = ep.product_name AND sp.brand = ep.company
               WHERE ep.id IS NULL`,
              (cleanErr, cleanResult) => {
                if (cleanErr) console.error('❌ storage_products stale-row cleanup error:', cleanErr.message);
                else if (cleanResult.affectedRows > 0)
                  console.log(`   🧹 Removed ${cleanResult.affectedRows} storage_products row(s) not present in elite_products`);

                checkTrigger();
              }
            );

            function checkTrigger() {
            // ── Ensure the auto-sync TRIGGER exists ─────────────────────
            // Keeps future elite_products additions (via any method) auto-
            // mirrored into storage_products with stock_in = 10.
            conn.query(
              `SELECT COUNT(*) AS cnt FROM information_schema.triggers
               WHERE trigger_schema = DATABASE()
                 AND trigger_name = 'trg_elite_products_after_insert'`,
              (trigCheckErr, trigRows) => {
                if (trigCheckErr) {
                  console.error('❌ trigger check error:', trigCheckErr.message);
                  return finishStorageSetup();
                }
                if (trigRows[0].cnt > 0) {
                  console.log('   ✔ Trigger OK: trg_elite_products_after_insert');
                  return finishStorageSetup();
                }
                conn.query(
                  `CREATE TRIGGER trg_elite_products_after_insert
                   AFTER INSERT ON elite_products
                   FOR EACH ROW
                   INSERT IGNORE INTO storage_products (product, brand, stock_in)
                   VALUES (NEW.product_name, NEW.company, 10)`,
                  (trigErr) => {
                    if (trigErr) {
                      // Expected on Clever Cloud / most shared MySQL hosts: the
                      // DB user isn't granted SUPER, so triggers can't be
                      // created (error mentions log_bin_trust_function_creators).
                      // That's fine — syncStorageProductsFromElite() below runs
                      // on a timer and covers the same "new product → storage"
                      // requirement without needing a trigger at all.
                      console.warn('   ⚠️  Trigger not installed (no SUPER privilege on this DB — expected on managed MySQL). Falling back to periodic sync instead.');
                    } else {
                      console.log('   ✔ Installed trigger: trg_elite_products_after_insert (new elite_products rows → storage_products, stock_in = 10)');
                    }
                    finishStorageSetup();
                  }
                );
              }
            );
            }
          }
        );

        function finishStorageSetup() {
        conn.query('SELECT COUNT(*) AS cnt FROM storage_products', (e3, rows) => {
          if (!e3) console.log(`   ✔ storage_products has ${rows[0].cnt} row(s)`);
          conn.release();
        });
        }
      });
      } // end createStorageTransactions
    });
  });
}, 3000);

// ─── STORAGE AUTO-SYNC (trigger fallback) ────────────────────────────
// Clever Cloud's MySQL user doesn't have SUPER, so the DB TRIGGER above
// usually can't be created (see warning above). This timer covers the
// exact same requirement — any product added to elite_products (via
// setup_elite_products.js, direct SQL, or a future API route) shows up
// in storage_products with stock_in = 10 — by re-running the same
// INSERT IGNORE ... SELECT every couple of minutes. It's cheap and a
// no-op whenever nothing new has been added, thanks to the
// uniq_product_brand key. POST /storage-sync still exists if you want
// it to happen immediately instead of waiting for the next tick.
function syncStorageProductsFromElite() {
  db.query(
    `INSERT IGNORE INTO storage_products (product, brand, stock_in)
     SELECT product_name, company, 10 FROM elite_products`,
    (err, result) => {
      if (err) { console.error('⚠️  Periodic storage sync error:', err.message); return; }
      if (result.affectedRows > 0)
        console.log(`🔄 Periodic sync: added ${result.affectedRows} new product(s) from elite_products into storage_products (stock_in = 10)`);

      // Also drop any storage_products row that's no longer in elite_products
      // (e.g. an elite product that was renamed/removed), so counts stay in sync.
      db.query(
        `DELETE sp FROM storage_products sp
         LEFT JOIN elite_products ep
           ON sp.product = ep.product_name AND sp.brand = ep.company
         WHERE ep.id IS NULL`,
        (cleanErr, cleanResult) => {
          if (cleanErr) console.error('⚠️  Periodic storage cleanup error:', cleanErr.message);
          else if (cleanResult.affectedRows > 0)
            console.log(`🔄 Periodic sync: removed ${cleanResult.affectedRows} storage_products row(s) no longer in elite_products`);
        }
      );
    }
  );
}
setInterval(syncStorageProductsFromElite, 2 * 60 * 1000); // every 2 minutes


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
  '/storage':         'storage.html',
};
Object.entries(protectedPages).forEach(([route, file]) => {
  app.get(route, requirePage, (req, res) =>
    res.sendFile(path.join(__dirname, file))
  );
});

// Block direct .html access for protected pages
const blockedHtml = [
  'elite-dashboard.html','elite-billing.html','elite-history.html',
  'dashboard.html','billing.html','customer-history.html','storage.html'
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

// POST /save-bill — save a completed bill to history AND replicate each
// line-item into storage_transactions so storage stock-out is always in sync.
// Both writes happen inside a single DB transaction — if either fails,
// neither is committed (no partial data).
app.post('/save-bill', requireLogin, (req, res) => {
  const { billNo, customerName, customerPhone, items, grandTotal, dateTime } = req.body;
  if (!billNo || !customerName)
    return res.status(400).json({ error: 'billNo and customerName are required' });

  // items must be an array with at least one entry that has a product name
  const validItems = Array.isArray(items)
    ? items.filter(i => i.product && (parseFloat(i.qty) || 0) > 0)
    : [];

  db.getConnection((connErr, conn) => {
    if (connErr) {
      console.error('Save bill – getConnection error:', connErr.message);
      return res.status(500).json({ error: 'DB connection error' });
    }

    conn.beginTransaction(txErr => {
      if (txErr) { conn.release(); return res.status(500).json({ error: 'TX begin error' }); }

      // ── Step 1: write bill_history ──────────────────────────────────
      conn.query(
        `INSERT INTO bill_history
          (bill_no, customer_name, customer_phone, items_json, grand_total, bill_datetime)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [billNo, customerName, customerPhone || null, JSON.stringify(items), grandTotal, dateTime],
        (histErr) => {
          if (histErr) {
            return conn.rollback(() => {
              conn.release();
              console.error('Save bill – bill_history insert error:', histErr.message);
              res.status(500).json({ error: 'DB error saving bill history' });
            });
          }

          // ── Step 2: replicate each line-item → storage_transactions ──
          // We look up the storage_product by name+brand match so we can
          // record a proper product_id. Items that don't match any storage
          // product are skipped (non-storage sales are allowed).
          if (validItems.length === 0) {
            // Nothing to replicate — just commit the history row
            return conn.commit(commitErr => {
              conn.release();
              if (commitErr) return res.status(500).json({ error: 'TX commit error' });
              res.json({ success: true, storageRowsInserted: 0 });
            });
          }

          let pending = validItems.length;
          let storageCount = 0;
          let aborted = false;

          validItems.forEach(item => {
            if (aborted) return;

            const qty    = parseFloat(item.qty)   || 1;
            const price  = parseFloat(item.price) || 0;
            const amount = qty * price;
            // Match storage product by name (and optionally brand/company)
            const brand  = item.company || item.brand || null;

            let lookupSql    = 'SELECT id FROM storage_products WHERE product = ?';
            const lookupVals = [item.product];
            if (brand) { lookupSql += ' AND brand = ?'; lookupVals.push(brand); }
            lookupSql += ' LIMIT 1';

            conn.query(lookupSql, lookupVals, (lookupErr, rows) => {
              if (aborted) return;
              if (lookupErr) {
                aborted = true;
                return conn.rollback(() => {
                  conn.release();
                  console.error('Save bill – storage lookup error:', lookupErr.message);
                  res.status(500).json({ error: 'DB error looking up storage product' });
                });
              }

              if (rows.length === 0) {
                // Product not in storage — skip silently
                if (--pending === 0 && !aborted) commitAndRespond();
                return;
              }

              const productId = rows[0].id;
              conn.query(
                `INSERT INTO storage_transactions
                  (product_id, bill_no, customer_name, customer_phone, qty, amount, bill_datetime)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [productId, billNo, customerName, customerPhone || null, qty, amount, dateTime || null],
                (txInsErr) => {
                  if (aborted) return;
                  if (txInsErr) {
                    aborted = true;
                    return conn.rollback(() => {
                      conn.release();
                      console.error('Save bill – storage_transactions insert error:', txInsErr.message);
                      res.status(500).json({ error: 'DB error saving storage transaction' });
                    });
                  }
                  storageCount++;
                  if (--pending === 0 && !aborted) commitAndRespond();
                }
              );
            });
          });

          function commitAndRespond() {
            conn.commit(commitErr => {
              conn.release();
              if (commitErr) return res.status(500).json({ error: 'TX commit error' });
              console.log(`✅ Bill ${billNo} saved — ${storageCount} storage transaction(s) recorded`);
              res.json({ success: true, storageRowsInserted: storageCount });
            });
          }
        }
      );
    });
  });
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

// ─── STORAGE ─────────────────────────────────────────────────────

// GET /storage-products?search=bulb
// Returns every product with computed stockOut & available fields.
app.get('/storage-products', requireLogin, (req, res) => {
  const { search } = req.query;
  let sql = `
    SELECT
      p.id,
      p.product,
      p.brand,
      p.stock_in   AS stockIn,
      COALESCE(SUM(t.qty), 0) AS stockOut
    FROM storage_products p
    LEFT JOIN storage_transactions t ON t.product_id = p.id
    WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (p.product LIKE ? OR p.brand LIKE ?)';
    params.push('%' + search + '%', '%' + search + '%');
  }
  sql += ' GROUP BY p.id ORDER BY p.product';
  db.query(sql, params, (err, rows) => {
    if (err) { console.error('Storage products error:', err.message); return res.status(500).json({ error: 'DB error' }); }
    // Compute available on the server so the client never does arithmetic
    const result = rows.map(r => ({
      ...r,
      stockIn:  r.stockIn,
      stockOut: Number(r.stockOut),
      available: r.stockIn - Number(r.stockOut)
    }));
    res.json(result);
  });
});

// GET /storage-transactions/:productId — all stock-out rows for one product
app.get('/storage-transactions/:productId', requireLogin, (req, res) => {
  db.query(
    `SELECT * FROM storage_transactions WHERE product_id = ? ORDER BY created_at DESC`,
    [req.params.productId],
    (err, rows) => {
      if (err) { console.error('Storage transactions error:', err.message); return res.status(500).json({ error: 'DB error' }); }
      res.json(rows);
    }
  );
});

// POST /storage-products — add a brand-new product to the CATALOG.
// Body: { product, brand, price, stockIn }
//
// This must write to BOTH tables, not just storage_products:
//   - elite_products    → the master catalog. Elite Dashboard's product
//                          search/billing reads from here, and it needs
//                          a price.
//   - storage_products   → stock tracking for the Storage page.
//
// Why both: on every server start, this app deletes any storage_products
// row that has no matching elite_products row (see the startup cleanup
// above) — so a product written only to storage_products would work
// today and silently vanish on the next restart/redeploy. The insert is
// wrapped in a transaction so it's all-or-nothing: if either table's
// insert fails, both roll back and the two tables never drift apart.
//
// Duplicate check runs against elite_products (the source of truth).
// The storage_products insert uses ON DUPLICATE KEY UPDATE as a
// self-heal: if an old, orphaned storage_products row already exists
// for this exact (product, brand) — e.g. left over from before this
// fix — it gets linked up and its stock set to the value just entered,
// instead of failing with a confusing duplicate error.
app.post('/storage-products', requireLogin, (req, res) => {
  const product = String(req.body.product || '').trim();
  const brand   = String(req.body.brand   || '').trim();
  const price   = Number(req.body.price);
  const stockIn = Number(req.body.stockIn);

  if (!product || !brand) {
    return res.status(400).json({ error: 'product and brand are required' });
  }
  if (!Number.isFinite(price) || price < 0) {
    return res.status(400).json({ error: 'price must be a number 0 or greater' });
  }
  if (!Number.isFinite(stockIn) || stockIn < 0) {
    return res.status(400).json({ error: 'stockIn must be a number 0 or greater' });
  }

  db.getConnection((connErr, conn) => {
    if (connErr) {
      console.error('Add product — connection error:', connErr.message);
      return res.status(500).json({ error: 'DB error' });
    }

    const fail = (err, stage) => {
      console.error(`Add product — ${stage} error:`, err.message);
      conn.rollback(() => {
        conn.release();
        res.status(500).json({ error: 'DB error' });
      });
    };
    const conflict = () => {
      conn.rollback(() => {
        conn.release();
        res.status(409).json({
          error: 'duplicate',
          message: `"${product}" (${brand}) already exists. Use Edit Stock to add more units instead.`
        });
      });
    };

    conn.beginTransaction(txErr => {
      if (txErr) { conn.release(); console.error('Add product — tx start error:', txErr.message); return res.status(500).json({ error: 'DB error' }); }

      // 1. Duplicate check against the master catalog (source of truth)
      conn.query(
        'SELECT id FROM elite_products WHERE product_name = ? AND company = ? LIMIT 1',
        [product, brand],
        (checkErr, existing) => {
          if (checkErr) return fail(checkErr, 'duplicate check');
          if (existing.length > 0) return conflict();

          // 2. Insert into elite_products (master catalog + price)
          conn.query(
            'INSERT INTO elite_products (product_name, company, price) VALUES (?, ?, ?)',
            [product, brand, price],
            (eliteErr) => {
              if (eliteErr) {
                if (eliteErr.code === 'ER_DUP_ENTRY') return conflict();
                return fail(eliteErr, 'elite_products insert');
              }

              // 3. Insert (or self-heal) into storage_products
              conn.query(
                `INSERT INTO storage_products (product, brand, stock_in) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE stock_in = VALUES(stock_in)`,
                [product, brand, stockIn],
                (storErr, storResult) => {
                  if (storErr) return fail(storErr, 'storage_products insert');

                  conn.commit(commitErr => {
                    if (commitErr) return fail(commitErr, 'commit');
                    conn.release();
                    res.json({
                      success:   true,
                      id:        storResult.insertId,
                      product, brand, price,
                      stockIn,
                      stockOut:  0,
                      available: stockIn
                    });
                  });
                }
              );
            }
          );
        }
      );
    });
  });
});

// PATCH /storage-products/:id/stock — update stock_in count
// Body: { stockIn }
app.patch('/storage-products/:id/stock', requireLogin, (req, res) => {
  const { stockIn } = req.body;
  if (stockIn === undefined) return res.status(400).json({ error: 'stockIn required' });
  db.query(
    'UPDATE storage_products SET stock_in = ? WHERE id = ?',
    [Number(stockIn), req.params.id],
    (err) => {
      if (err) { console.error('Update stock error:', err.message); return res.status(500).json({ error: 'DB error' }); }
      res.json({ success: true });
    }
  );
});

// POST /storage-transactions — record a stock-out (called from billing on save)
// Body: { productId, billNo, customerName, customerPhone, qty, amount, billDatetime }
app.post('/storage-transactions', requireLogin, (req, res) => {
  const { productId, billNo, customerName, customerPhone, qty, amount, billDatetime } = req.body;
  if (!productId || !billNo || !customerName)
    return res.status(400).json({ error: 'productId, billNo, customerName required' });
  db.query(
    `INSERT INTO storage_transactions
      (product_id, bill_no, customer_name, customer_phone, qty, amount, bill_datetime)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [productId, billNo, customerName, customerPhone || null, Number(qty) || 1, Number(amount) || 0, billDatetime || null],
    (err, result) => {
      if (err) { console.error('Add storage transaction error:', err.message); return res.status(500).json({ error: 'DB error' }); }
      res.json({ success: true, id: result.insertId });
    }
  );
});

// ─── DB DIAGNOSTICS ──────────────────────────────────────────────────
// GET /db-info — confirms which database this LIVE server is actually
// talking to (host + db name, never the password) plus row counts.
// Compare this against what setup_storage_sync.js reports to catch any
// credential/host mismatch between your local script and the deployed app.
app.get('/db-info', requireLogin, (req, res) => {
  db.query(
    `SELECT
       (SELECT COUNT(*) FROM elite_products)   AS eliteCount,
       (SELECT COUNT(*) FROM storage_products) AS storageCount`,
    (err, rows) => {
      if (err) { console.error('db-info error:', err.message); return res.status(500).json({ error: 'DB error' }); }
      res.json({
        host:          process.env.DB_HOST || 'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com',
        database:      process.env.DB_NAME || 'bgkwzqnaueygs0sltdxg',
        eliteCount:    rows[0].eliteCount,
        storageCount:  rows[0].storageCount
      });
    }
  );
});

// POST /storage-sync — manually re-run the elite_products ↔ storage_products
// sync (adds any missing product at stock_in = 10, leaves existing stock
// untouched, and removes any storage_products row no longer present in
// elite_products) without waiting for a server restart/redeploy.
app.post('/storage-sync', requireLogin, (req, res) => {
  db.query(
    `INSERT IGNORE INTO storage_products (product, brand, stock_in)
     SELECT product_name, company, 10 FROM elite_products`,
    (err, addResult) => {
      if (err) { console.error('Storage sync error:', err.message); return res.status(500).json({ error: 'DB error' }); }
      db.query(
        `DELETE sp FROM storage_products sp
         LEFT JOIN elite_products ep
           ON sp.product = ep.product_name AND sp.brand = ep.company
         WHERE ep.id IS NULL`,
        (cleanErr, cleanResult) => {
          if (cleanErr) { console.error('Storage cleanup error:', cleanErr.message); return res.status(500).json({ error: 'DB error' }); }
          res.json({ success: true, added: addResult.affectedRows, removed: cleanResult.affectedRows });
        }
      );
    }
  );
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
