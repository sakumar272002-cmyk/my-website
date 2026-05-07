USE bgkwzqnaueygs0sltdxg;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(100) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  gst_value DECIMAL(5,2) NOT NULL DEFAULT 18.00
);

INSERT IGNORE INTO users (username, password) VALUES ('admin', 'admin123');
INSERT IGNORE INTO users (username, password) VALUES ('john', 'mypassword');

-- Remove john
DELETE FROM users WHERE username = 'john';

-- Add Seeni
INSERT IGNORE INTO users (username, password) VALUES ('Seeni', 'Seeni@1969');
INSERT IGNORE INTO users (username, password) VALUES ('Ari', 'Ari@1999');
INSERT IGNORE INTO users (username, password) VALUES ('Arul', 'Arul@2001');
INSERT IGNORE INTO users (username, password) VALUES ('Ashok', 'Ashok@2002');



INSERT INTO settings (gst_value) VALUES (18);