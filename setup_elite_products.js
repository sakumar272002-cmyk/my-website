/**
 * ============================================================
 *  ELITE PRODUCTS SETUP SCRIPT
 *  Sree Electricals & Electronics
 *
 *  HOW TO RUN (in your project folder):
 *    node setup_elite_products.js
 *
 *  This will:
 *   1. Connect to your Clever Cloud MySQL database
 *   2. Drop & recreate the elite_products table
 *   3. Insert all 55 products
 *   4. Print a success/fail report
 * ============================================================
 */

const mysql = require('mysql2');

const db = mysql.createConnection({
  host:     'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com',
  port:     3306,
  user:     'utkpn8wzxl290hqx',
  password: 'i6AZV2A3QoiqjQT9i3QI',
  database: 'bgkwzqnaueygs0sltdxg',
  multipleStatements: true
});

const SQL = `
DROP TABLE IF EXISTS elite_products;

CREATE TABLE elite_products (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  product_name VARCHAR(255)  NOT NULL,
  company      VARCHAR(100)  NOT NULL,
  price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  INDEX idx_product_name (product_name),
  INDEX idx_company      (company)
);

INSERT INTO elite_products (product_name, company, price) VALUES
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
`;

console.log('🔌 Connecting to Clever Cloud MySQL...');

db.connect((err) => {
  if (err) {
    console.error('❌ Connection FAILED:', err.message);
    console.error('   Check your internet connection and DB credentials.');
    process.exit(1);
  }
  console.log('✅ Connected!\n⚙️  Creating elite_products table and inserting data...\n');

  db.query(SQL, (err, results) => {
    if (err) {
      console.error('❌ SQL Error:', err.message);
      db.end();
      process.exit(1);
    }

    // Verify count
    db.query('SELECT COUNT(*) AS cnt FROM elite_products', (err, rows) => {
      if (err) {
        console.error('❌ Verify error:', err.message);
      } else {
        console.log('✅ SUCCESS! elite_products table created.');
        console.log(`✅ Total products inserted: ${rows[0].cnt}`);
        console.log('\n🚀 Restart your server now — the DB error will be gone!');
      }
      db.end();
    });
  });
});
