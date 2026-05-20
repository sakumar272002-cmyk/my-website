-- ═══════════════════════════════════════════════════════════════
--  Sree Electricals — Storage Module DB Setup
--  Run this once on your MySQL database.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. STORAGE PRODUCTS (Stock In) ──────────────────────────────
--  Each row = one product in the physical storage.
--  stockIn is the total quantity ever received (cumulative).

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

INSERT INTO storage_transactions
  (product_id, bill_no, customer_name, customer_phone, qty, amount, bill_datetime) VALUES
  (1, 'BILL-20250520-3', 'Ramesh Kumar',  '9876543210',  2,  480.00, '20 May 2025, 10:30 AM'),
  (1, 'BILL-20250518-7', 'Seeni Muthu',   '9123456789',  3,  720.00, '18 May 2025, 03:15 PM'),
  (2, 'BILL-20250519-2', 'Anbu Selvam',   '9988776655',  1, 2800.00, '19 May 2025, 11:00 AM'),
  (2, 'BILL-20250515-5', 'Malathi Devi',  '9012345678',  2, 5600.00, '15 May 2025, 02:45 PM'),
  (2, 'BILL-20250512-1', 'Krishnan R',    '9876001234',  1, 2800.00, '12 May 2025, 09:00 AM'),
  (3, 'BILL-20250517-9', 'Elangovan M',   '9543216789',  4,  520.00, '17 May 2025, 04:00 PM'),
  (4, 'BILL-20250520-1', 'Balamurugan S', '9001234567', 10, 1500.00, '20 May 2025, 09:00 AM'),
  (4, 'BILL-20250516-4', 'Chandran K',    '9712345678',  5,  750.00, '16 May 2025, 01:30 PM'),
  (4, 'BILL-20250514-6', 'Muthukumar P',  '9845612370',  8, 1200.00, '14 May 2025, 10:15 AM'),
  (4, 'BILL-20250510-3', 'Saranya T',     '9234567890',  6,  900.00, '10 May 2025, 11:45 AM'),
  (5, 'BILL-20250519-6', 'Ravi Shankar',  '9988001122',  3,  360.00, '19 May 2025, 03:30 PM'),
  (5, 'BILL-20250513-2', 'Sumathi R',     '9876543000',  2,  240.00, '13 May 2025, 12:00 PM'),
  (7, 'BILL-20250520-5', 'Jayakumar N',   '9345678901',  2, 3200.00, '20 May 2025, 11:15 AM'),
  (7, 'BILL-20250511-8', 'Parimala Devi', '9123490087',  1, 1600.00, '11 May 2025, 09:45 AM'),
  (7, 'BILL-20250508-4', 'Vignesh A',     '9900112233',  1, 1600.00, '08 May 2025, 04:00 PM'),
  (8, 'BILL-20250518-3', 'Arumugam T',    '9876501234',  3, 4500.00, '18 May 2025, 02:00 PM'),
  (8, 'BILL-20250514-9', 'Nirmala S',     '9001122334',  1, 1500.00, '14 May 2025, 11:00 AM');
