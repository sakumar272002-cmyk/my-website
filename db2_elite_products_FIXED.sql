-- ============================================================
--  ELITE PRODUCTS TABLE — Sree Electricals & Electronics
--  Run this on your Clever Cloud MySQL database to fix the
--  "Table doesn't exist" error.
-- ============================================================

USE bgkwzqnaueygs0sltdxg;

-- Drop and recreate to ensure clean state
DROP TABLE IF EXISTS elite_products;

CREATE TABLE elite_products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(255)  NOT NULL,
  company      VARCHAR(100)  NOT NULL,
  price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  INDEX idx_product_name (product_name),
  INDEX idx_company      (company),
  -- Stops the exact bug that let "9W LED Bulb"/"Crompton" sneak in as a
  -- 57th row with no matching file entry: a stray/duplicate INSERT for a
  -- (product_name, company) pair that already exists now errors instead
  -- of silently creating an extra row.
  UNIQUE KEY uniq_product_company (product_name, company)
);


DELETE FROM elite_products;

INSERT INTO elite_products (product_name, company, price) VALUES
('5 Amps Switch (Screw Type)', 'Hifi', 20.00),
('5 Amps Socket (Screw Type)', 'Hifi', 35.00),
('5 Amps Plug Top', 'Hifi', 35.00),
('15 Amps Plug Top', 'Hifi', 70.00),
('5 Amps Two Way Switch (Screw Type)', 'Hifi', 25.00),
('5 Amps Indicator (Screw Type)', 'Hifi', 25.00),
('15 Amps Switch (Screw Type)', 'Hifi', 60.00),
('15 Amps Socket (Screw Type)', 'Hifi', 65.00),
('15 Amps Switch - Type 2 (Screw Type)', 'Hifi', 70.00), -- check: possible duplicate of previous row
('5 Amps Bell Switch (Screw Type)', 'Hifi', 25.00),
('15 Amps Bell Switch (Screw Type)', 'Hifi', 70.00),
('5 Amps 2 Pin Socket', 'Hifi', 25.00),
('5 Amps Bell Switch - Type 2', 'Hifi', 30.00), -- check: written as "Bed Switch", likely Bell Switch variant
('15 Amps 3 Pin Socket', 'Kangi', 100.00),
('15 Amps 3 Pin Plug Top', 'Kangi', 100.00),
('5 Amps 2 Pin Plug Top', 'Kangi', 25.00),
('5 Amps 3 Pin Socket', 'Kangi', 50.00);

-- ============================================
-- STEP 3: Insert items from Image 2 (page 2, items 20-34)
-- ============================================
INSERT INTO elite_products (product_name, company, price) VALUES
('5 Amps Switch (Pressing Type)', 'Hifi', 30.00),
('5 Amps 2 Way Switch', 'Hifi', 35.00),
('5 Amps Socket (5 Pin)', 'Hifi', 40.00),
('5 Amps 2 Pin Socket', 'Hifi', 30.00),
('5 Amps Indicator (Pressing Type)', 'Hifi', 30.00),
('5 Amps Bell Switch', 'Hifi', 35.00),
('15 Amps Switch', 'Hifi', 55.00),
('15 Amps Socket', 'Hifi', 60.00),
('10 Amps DB Switch', 'Generic', 180.00),
('16 Amps DB Switch', 'Generic', 190.00),
('25 Amps DB Switch', 'Generic', 220.00),
('32 Amps DB Switch', 'Generic', 220.00),
('10 Amps MCB Switch', 'Generic', 220.00),
('16 Amps MCB Switch', 'Generic', 220.00),
('25 Amps MCB Switch', 'Generic', 220.00),
('32 Amps MCB Switch', 'Generic', 220.00);

-- ============================================
-- STEP 4: Insert items from Image 1 ("Electrical (3)", items 41-58)
-- ============================================
INSERT INTO elite_products (product_name, company, price) VALUES
('5 Amps Combined Switch & Socket', 'Generic', 190.00),
('15 Amps Combined Switch & Socket', 'Generic', 190.00),
('MCB 1P 10A', 'Generic', 310.00),
('MCB 1P 16A', 'Generic', 370.00),   -- check: figure hard to read, could be 380
('MCB 1P 25A', 'Generic', 290.00),
('MCB 1P 32A', 'Generic', 290.00),   -- check: price used ditto marks, verify against original
('MCB 2P 10A', 'Generic', 310.00),   -- check: price used ditto marks, verify against original
('MCB 2P 16A', 'Generic', 310.00),   -- check: price used ditto marks, verify against original
('MCB 2P 32A', 'Generic', 310.00),   -- check: price used ditto marks, verify against original
('MCB 3P 40A', 'Generic', 310.00),   -- check: price used ditto marks, verify against original
('MCB 3P 32A', 'Generic', 310.00),   -- check: price used ditto marks, verify against original
('MCB 3P 63A', 'Generic', 310.00),   -- check: price used ditto marks, verify against original
('MCB 4P 32A', 'Generic', 310.00),   -- check: price used ditto marks, verify against original
('MCB 4P 63A', 'Generic', 310.00),   -- check: price used ditto marks, verify against original
('RCCB 2P 40A', 'Generic', 1200.00),
('RCCB 2P 80A', 'Generic', 1200.00),
('RCCB 4P 80A', 'Generic', 3200.00),
('RCCB 4P 100A', 'Generic', 3200.00);


UPDATE elite_products SET product_name = '5 Amps 2 Way Switch (Pressing Type)' 
WHERE product_name = '5 Amps 2 Way Switch' AND price = 35.00;

UPDATE elite_products SET product_name = '5 Amps Socket (5 Pin) (Pressing Type)' 
WHERE product_name = '5 Amps Socket (5 Pin)' AND price = 40.00;

UPDATE elite_products SET product_name = '5 Amps 2 Pin Socket (Pressing Type)' 
WHERE product_name = '5 Amps 2 Pin Socket' AND price = 30.00;

UPDATE elite_products SET product_name = '5 Amps Bell Switch (Pressing Type)' 
WHERE product_name = '5 Amps Bell Switch' AND price = 35.00;

UPDATE elite_products SET product_name = '15 Amps Switch (Pressing Type)' 
WHERE product_name = '15 Amps Switch' AND price = 55.00;

UPDATE elite_products SET product_name = '15 Amps Socket (Pressing Type)' 
WHERE product_name = '15 Amps Socket' AND price = 60.00;