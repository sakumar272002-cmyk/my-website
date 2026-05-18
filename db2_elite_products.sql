-- ═══════════════════════════════════════════════════════════════
-- ELITE PRODUCTS — Run this in bgkwzqnaueygs0sltdxg (same DB as server.js)
-- Open MySQL Workbench → connect to: bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com
-- User: utkpn8wzxl290hqx  |  DB: bgkwzqnaueygs0sltdxg
-- ═══════════════════════════════════════════════════════════════

USE bgkwzqnaueygs0sltdxg;   -- ← MUST match server.js DB_NAME

CREATE TABLE IF NOT EXISTS elite_products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(255)  NOT NULL,
  company      VARCHAR(100)  NOT NULL,
  price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  INDEX idx_product_name (product_name),
  INDEX idx_company      (company)
);

-- Also create bill_counter and bill_history if not already present
CREATE TABLE IF NOT EXISTS bill_counter (
  bill_date DATE        NOT NULL PRIMARY KEY,
  counter   INT         NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS bill_history (
  id               INT AUTO_INCREMENT PRIMARY KEY,
  bill_no          VARCHAR(50)    NOT NULL UNIQUE,
  customer_name    VARCHAR(255)   NOT NULL,
  customer_phone   VARCHAR(20),
  items_json       LONGTEXT,
  grand_total      DECIMAL(12,2)  NOT NULL DEFAULT 0,
  bill_datetime    VARCHAR(50),
  created_at       TIMESTAMP      DEFAULT CURRENT_TIMESTAMP
);

-- ─── Seed elite_products ─────────────────────────────────────
INSERT IGNORE INTO elite_products (product_name, company, price) VALUES
('0.5 sq mm Wire', 'Finolex', 210.00),
('0.5 sq mm Wire', 'Havells', 245.00),
('0.75 sq mm Wire', 'Finolex', 295.00),
('0.75 sq mm Wire', 'Polycab', 310.00),
('1.0 sq mm Wire', 'Finolex', 385.00),
('1.0 sq mm Wire', 'Havells', 420.00),
('1.5 sq mm Wire', 'Finolex', 550.00),
('1.5 sq mm Wire', 'Polycab', 580.00),
('1.5 sq mm Wire', 'Havells', 610.00),
('2.5 sq mm Wire', 'Finolex', 870.00),
('2.5 sq mm Wire', 'Polycab', 895.00),
('2.5 sq mm Wire', 'Havells', 940.00),
('4.0 sq mm Wire', 'Finolex', 1380.00),
('4.0 sq mm Wire', 'Polycab', 1420.00),
('6.0 sq mm Wire', 'Finolex', 2050.00),
('6.0 sq mm Wire', 'Havells', 2180.00),
('9W LED Bulb', 'Philips', 85.00),
('9W LED Bulb', 'Syska', 75.00),
('12W LED Bulb', 'Philips', 110.00),
('12W LED Bulb', 'Havells', 120.00),
('18W LED Bulb', 'Crompton', 165.00),
('24W LED Bulb', 'Syska', 210.00),
('36W LED Tube Light', 'Philips', 280.00),
('36W LED Tube Light', 'Havells', 295.00),
('20W LED Downlight', 'Philips', 380.00),
('Ceiling Fan 48"', 'Usha', 1800.00),
('Ceiling Fan 48"', 'Crompton', 1950.00),
('Ceiling Fan 56"', 'Orient', 2200.00),
('Ceiling Fan 56"', 'Havells', 2400.00),
('Table Fan 400mm', 'Usha', 1200.00),
('Exhaust Fan 6"', 'Havells', 650.00),
('Exhaust Fan 9"', 'Crompton', 850.00),
('1-Way Switch 6A', 'Legrand', 85.00),
('1-Way Switch 6A', 'Anchor', 75.00),
('2-Way Switch 6A', 'Legrand', 110.00),
('5A Socket', 'GM', 75.00),
('15A Socket', 'Legrand', 130.00),
('6A MCB', 'Schneider', 180.00),
('16A MCB', 'ABB', 220.00),
('32A MCB', 'Legrand', 310.00),
('4-Way DB Box', 'Havells', 580.00),
('8-Way DB Box', 'Schneider', 950.00),
('1.5T Split AC', 'Voltas', 35000.00),
('1T Split AC', 'Daikin', 28000.00),
('2T Split AC', 'LG', 42000.00),
('600VA UPS', 'APC', 2800.00),
('1KVA UPS', 'Luminous', 5500.00),
('LED Strip 5m Warm', 'Syska', 450.00),
('LED Strip 5m Cool', 'Philips', 520.00),
('CCTV Camera 2MP', 'CP Plus', 1250.00),
('CCTV Camera 4MP', 'Hikvision', 2850.00),
('DVR 4Ch 1080P', 'CP Plus', 2850.00),
('DVR 8Ch 1080P', 'Hikvision', 4500.00),
('WiFi Router AC1200', 'TP-Link', 2250.00),
('Smart Switch 2 Gang', 'Anchor', 1850.00),
('Motion Sensor PIR', 'Legrand', 850.00);

-- ─── Verify ──────────────────────────────────────────────────
SELECT COUNT(*) AS elite_products_count FROM elite_products;
SELECT COUNT(*) AS bill_counter_exists   FROM bill_counter;
SELECT COUNT(*) AS bill_history_exists   FROM bill_history;
