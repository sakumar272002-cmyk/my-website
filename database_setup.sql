-- ============================================
-- RUN THIS IN MySQL Workbench
-- ============================================

CREATE DATABASE IF NOT EXISTS mywebsite;
USE mywebsite;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id       INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

-- Settings table (stores GST)
CREATE TABLE IF NOT EXISTS settings (
  id        INT AUTO_INCREMENT PRIMARY KEY,
  gst_value DECIMAL(5,2) NOT NULL DEFAULT 18.00
);

-- Add users
INSERT IGNORE INTO users (username, password) VALUES ('admin', 'admin123');
INSERT IGNORE INTO users (username, password) VALUES ('john',  'mypassword');


SELECT * FROM users;
SELECT * FROM settings;
