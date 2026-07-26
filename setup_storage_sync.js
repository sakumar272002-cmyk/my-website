/**
 * ============================================================
 *  STORAGE ↔ ELITE PRODUCTS SYNC SETUP
 *  Sree Electricals & Electronics
 *
 *  HOW TO RUN (in your project folder):
 *    node setup_storage_sync.js
 *
 *  This will:
 *   1. Connect to your Clever Cloud MySQL database
 *   2. Ensure storage_products has a UNIQUE(product, brand) key so
 *      the same product can never be inserted twice (this is what
 *      was letting e.g. "12W LED Bulb" show up more than once)
 *   3. Clear all existing rows in storage_products
 *   4. Rebuild storage_products from elite_products (all 57 products):
 *        product_name -> product
 *        company      -> brand
 *        stock_in     = 10  (minimum starting stock for every product)
 *   5. Install a DB TRIGGER on elite_products so that every NEW
 *      product inserted there (from now on, by ANY method —
 *      this script, a future API route, or direct SQL) is
 *      automatically mirrored into storage_products with
 *      stock_in = 10 (same minimum used everywhere else).
 *   6. Print a verification report.
 *
 *  NOTE: storage_products IDs are reset by this script (TRUNCATE
 *  resets AUTO_INCREMENT). If storage_transactions already has
 *  rows referencing old product IDs, those links will no longer
 *  match. Safe to ignore if storage_transactions is empty / this
 *  is a fresh setup.
 * ============================================================
 */

const mysql = require('mysql2');

const db = mysql.createConnection({
  host:     'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com',
  port:     3306,
  user:     'utkpn8wzxl290hqx',
  password: 'i6AZV2A3QoiqjQT9i3QI',
  database: 'bgkwzqnaueygs0sltdxg'
});

function run(sql, label) {
  return new Promise((resolve, reject) => {
    db.query(sql, (err, result) => {
      if (err) {
        console.error(`❌ ${label} FAILED:`, err.message);
        return reject(err);
      }
      console.log(`✅ ${label}`);
      resolve(result);
    });
  });
}

async function main() {
  console.log('🔌 Connecting to Clever Cloud MySQL...');
  await new Promise((resolve, reject) => {
    db.connect(err => err ? reject(err) : resolve());
  });
  console.log('✅ Connected!\n');

  // 1. Make sure duplicates can never happen again: dedupe any existing
  //    (product, brand) pairs, then add the UNIQUE key if it's missing.
  await run(
    `DELETE p1 FROM storage_products p1
     JOIN storage_products p2
       ON p1.product = p2.product
      AND p1.brand   = p2.brand
      AND p1.id > p2.id`,
    'Removed any existing duplicate (product, brand) rows'
  );
  const [idxRow] = await new Promise((resolve, reject) =>
    db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name  = 'storage_products'
         AND index_name  = 'uniq_product_brand'`,
      (e, r) => e ? reject(e) : resolve(r)
    )
  );
  if (idxRow.cnt === 0) {
    await run(
      'ALTER TABLE storage_products ADD UNIQUE KEY uniq_product_brand (product, brand)',
      'Added UNIQUE KEY (product, brand) to storage_products'
    );
  } else {
    console.log('✅ uniq_product_brand already present on storage_products');
  }

  // 2. Clear existing storage_products data
  await run('TRUNCATE TABLE storage_products', 'Cleared storage_products');

  // 3. Rebuild from elite_products — all 57 products, each starting at
  //    the 10-unit minimum stock.
  await run(
    `INSERT INTO storage_products (product, brand, stock_in)
     SELECT product_name, company, 10
     FROM elite_products
     ORDER BY product_name`,
    'Repopulated storage_products from elite_products (stock_in = 10)'
  );

  // 4. Install (or replace) the auto-sync trigger — every future product
  //    added to elite_products (script, API route, or direct SQL) gets
  //    mirrored into storage_products with the same 10-unit minimum.
  //    INSERT IGNORE means if that exact (product, brand) somehow already
  //    exists in storage_products, it's left alone instead of erroring or
  //    duplicating.
  await run('DROP TRIGGER IF EXISTS trg_elite_products_after_insert', 'Dropped old trigger (if any)');

  await run(
    `CREATE TRIGGER trg_elite_products_after_insert
     AFTER INSERT ON elite_products
     FOR EACH ROW
     INSERT IGNORE INTO storage_products (product, brand, stock_in)
     VALUES (NEW.product_name, NEW.company, 10)`,
    'Installed trigger: new elite_products rows auto-sync to storage_products (stock_in = 10)'
  );

  // 5. Verify
  const storageRows = await new Promise((resolve, reject) =>
    db.query('SELECT COUNT(*) AS cnt FROM storage_products', (e, r) => e ? reject(e) : resolve(r))
  );
  const eliteRows = await new Promise((resolve, reject) =>
    db.query('SELECT COUNT(*) AS cnt FROM elite_products', (e, r) => e ? reject(e) : resolve(r))
  );
  const storageCount = storageRows[0].cnt;
  const eliteCount   = eliteRows[0].cnt;

  console.log('\n📊 elite_products rows :', eliteCount);
  console.log('📊 storage_products rows:', storageCount);
  console.log(storageCount === eliteCount
    ? '✅ Counts match — migration successful.'
    : '⚠️  Counts differ — check for duplicate product_name+company pairs or NULLs.');

  console.log('\n🚀 Done. Add a new row to elite_products (any way) and it will now');
  console.log('   automatically appear in storage_products with stock_in = 10.');

  db.end();
}

main().catch(err => {
  console.error('\n💥 Setup aborted due to error above.');
  db.end();
  process.exit(1);
});
