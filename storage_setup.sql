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
  updated_at  TIMESTAMP      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


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


-- ── 3. DEDUPE ANY EXISTING DUPLICATE ROWS ───────────────────────
--  Root cause of past duplicates (e.g. two "12W LED Bulb / Crompton"
--  rows with different stock counts): this file had no uniqueness
--  constraint, so re-running the INSERT block below on an existing
--  database just added fresh rows instead of being ignored. This
--  block merges any duplicates that already exist BEFORE the
--  constraint is added, so the ALTER TABLE below doesn't fail.

CREATE TEMPORARY TABLE IF NOT EXISTS dup_map AS
SELECT sp.id AS dup_id, keep.id AS keep_id
FROM storage_products sp
JOIN (
  SELECT product, brand, MIN(id) AS id
  FROM storage_products
  GROUP BY product, brand
) keep ON keep.product = sp.product AND keep.brand = sp.brand
WHERE sp.id <> keep.id;

UPDATE storage_transactions t
JOIN dup_map m ON t.product_id = m.dup_id
SET t.product_id = m.keep_id;

UPDATE storage_products keep
JOIN (
  SELECT keep_id, SUM(sp.stock_in) AS extra
  FROM storage_products sp
  JOIN dup_map m ON sp.id = m.dup_id
  GROUP BY keep_id
) x ON keep.id = x.keep_id
SET keep.stock_in = keep.stock_in + x.extra;

DELETE sp FROM storage_products sp
JOIN dup_map m ON sp.id = m.dup_id;

DROP TEMPORARY TABLE IF EXISTS dup_map;

-- ── 4. UNIQUE CONSTRAINT — prevents duplicates from now on ──────
--  Guarded so this file is safe to run again without erroring on
--  "duplicate key name" if the constraint already exists.

SET @constraint_exists := (
  SELECT COUNT(*) FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name   = 'storage_products'
    AND index_name    = 'uq_product_brand'
);

SET @sql := IF(@constraint_exists = 0,
  'ALTER TABLE storage_products ADD UNIQUE KEY uq_product_brand (product, brand)',
  'SELECT ''uq_product_brand already exists'' AS note'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;


-- ── 5. SAMPLE DATA (matches the old hardcoded list) ─────────────
--  Delete this block if you want to start with an empty storage.
--  Safe to re-run now: INSERT IGNORE will genuinely be ignored on
--  a duplicate (product, brand) thanks to the unique key above,
--  instead of creating a second row.

INSERT IGNORE INTO storage_products (id, product, brand, stock_in) VALUES
  (1, '9W LED Bulb',          'Philips',   10),
  (2, 'Ceiling Fan 48"',      'Orient',     6),
  (3, 'MCB 32A Single Pole',  'Havells',   20),
  (4, 'PVC Conduit Pipe 25mm','Finolex',   50),
  (5, '5A Socket & Switch',   'Legrand',   15),
  (6, 'RCCB 40A 30mA',        'Schneider',  4),
  (7, 'Exhaust Fan 12"',      'Crompton',   8),
  (8, 'Copper Wire 1.5mm 90m','Polycab',   12);

INSERT IGNORE INTO storage_products (product, brand, stock_in) VALUES
('12W LED Bulb', 'Crompton', 50),
('18W LED Bulb', 'Crompton', 50),
('24W LED Bulb', 'Crompton', 50),
('30W LED Bulb', 'Crompton', 50);

-- Verify — should return ZERO rows
SELECT product, brand, COUNT(*) AS c
FROM storage_products
GROUP BY product, brand
HAVING c > 1;

-- storage_transactions is populated automatically by the server
-- whenever a bill is saved via POST /save-bill.
-- No manual inserts needed here.
