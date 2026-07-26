-- ═══════════════════════════════════════════════════════════════
--  Sree Electricals — Storage Module DB Setup
--  Run this once on your MySQL database.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. STORAGE PRODUCTS (Stock In) ──────────────────────────────
--  Each row = one product in the physical storage.
--  stockIn is the total quantity ever received (cumulative).
USE bgkwzqnaueygs0sltdxg;

CREATE TABLE IF NOT EXISTS storage_products (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  product     VARCHAR(200)   NOT NULL,
  brand       VARCHAR(100)   NOT NULL,
  stock_in    INT            NOT NULL DEFAULT 0,
  created_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  -- Prevents the exact bug that caused "12W LED Bulb" to show up twice:
  -- the same product+brand can now only ever exist as one row.
  UNIQUE KEY uniq_product_brand (product, brand)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- If this table already existed (created before this fix) without the
-- UNIQUE key above, run this once to add it retroactively. It first
-- removes any duplicate (product, brand) rows, keeping the lowest id:
--
--   DELETE p1 FROM storage_products p1
--   JOIN storage_products p2
--     ON p1.product = p2.product AND p1.brand = p2.brand AND p1.id > p2.id;
--
--   ALTER TABLE storage_products ADD UNIQUE KEY uniq_product_brand (product, brand);


-- ── 2. STORAGE TRANSACTIONS (Stock Out) ─────────────────────────
--  Each row = one bill line-item that moved goods out of storage.
--  Links back to bill_history via bill_no (soft reference, no FK
--  so deleting old bills doesn't break storage history).

CREATE TABLE IF NOT EXISTS storage_transactions (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  product_id      INT            NOT NULL,          -- → storage_products.id
  bill_no         VARCHAR(50)    NOT NULL,           -- e.g. BILL-20250520-3
  customer_name   VARCHAR(150)   NOT NULL,
  customer_phone  VARCHAR(20)    DEFAULT NULL,
  qty             INT            NOT NULL DEFAULT 1,
  amount          DECIMAL(10,2)  NOT NULL DEFAULT 0,
  bill_datetime   VARCHAR(50)    DEFAULT NULL,       -- human-readable, matches bill_history
  created_at      TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_product (product_id),
  INDEX idx_bill    (bill_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ── 3. INITIAL DATA ──────────────────────────────────────────────
--  NOTE: The old hardcoded sample list used to live here (a separate,
--  unrelated set of product names/brands from the real elite_products
--  catalog). It has been removed — that mismatch, combined with
--  storage_products having no UNIQUE(product, brand) constraint, is
--  exactly what let rows like "12W LED Bulb" get inserted more than
--  once. storage_products should instead be built FROM elite_products
--  (all 57 products, each seeded with stock_in = 10) by running:
--
--      node setup_storage_sync.js
--
--  That script also installs a trigger so any product added later to
--  elite_products (by any method) automatically appears here too, with
--  stock_in = 10.

-- storage_transactions is populated automatically by the server
-- whenever a bill is saved via POST /save-bill.
-- No manual inserts needed here.
