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


-- ── 3. SAMPLE DATA (matches the old hardcoded list) ─────────────
--  Delete this block if you want to start with an empty storage.

INSERT INTO storage_products (id, product, brand, stock_in) VALUES
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

-- storage_transactions is populated automatically by the server
-- whenever a bill is saved via POST /save-bill.
-- No manual inserts needed here.
