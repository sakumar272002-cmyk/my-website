-- ═══════════════════════════════════════════════════════════════
-- DB 3 — ELITE BILLING HISTORY
-- Run this in your FREE MySQL DB (separate from DB2)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bill_history (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  bill_no        VARCHAR(50)   NOT NULL,
  customer_name  VARCHAR(255)  NOT NULL,
  customer_phone VARCHAR(10)   NOT NULL,         -- 10-digit, not unique (customer can buy multiple times)
  items_json     TEXT          NOT NULL,          -- JSON array of purchased items
  grand_total    DECIMAL(10,2) NOT NULL DEFAULT 0,
  bill_datetime  VARCHAR(50),
  created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_phone      (customer_phone),          -- fast lookup by phone (primary search key)
  INDEX idx_name       (customer_name),           -- fast lookup by name
  INDEX idx_created_at (created_at)
);

-- Verify
SELECT COUNT(*) AS total_bills FROM bill_history;
-- Expected: 0 (starts empty, fills as bills are downloaded)
