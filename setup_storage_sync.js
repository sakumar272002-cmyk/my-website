/**
 * ============================================================
 *  STORAGE ↔ ELITE PRODUCTS SYNC SETUP
 *  Sree Electricals & Electronics
 *
 *  HOW TO RUN (in your project folder, AFTER storage_setup.sql
 *  has been run against the DB at least once — this script checks
 *  for the uq_product_brand unique key it creates and stops if
 *  it's missing):
 *    node setup_storage_sync.js
 *
 *  This will:
 *   1. Connect to your Clever Cloud MySQL database
 *   2. Verify storage_setup.sql's unique key exists (safety check)
 *   3. Rebuild storage_products from EVERY row currently in
 *      elite_products:
 *        product_name -> product
 *        company      -> brand
 *        stock_in     = 10 minimum
 *      Using ON DUPLICATE KEY UPDATE, so this is safe to re-run —
 *      it will never create duplicate rows, and never lowers an
 *      existing row's stock below 10.
 *   4. Install a DB TRIGGER on elite_products so that every NEW
 *      product inserted there (from now on, by ANY method —
 *      this script, a future API route, or direct SQL) is
 *      automatically mirrored into storage_products with
 *      stock_in = 10.
 *   5. Print a verification report, including a duplicate check.
 * ============================================================
 */

const mysql = require('mysql2');

const db = mysql.createConnection({
  host:     process.env.DB_HOST     || 'bgkwzqnaueygs0sltdxg-mysql.services.clever-cloud.com',
  port:     process.env.DB_PORT     || 3306,
  user:     process.env.DB_USER     || 'utkpn8wzxl290hqx',
  password: process.env.DB_PASSWORD || 'i6AZV2A3QoiqjQT9i3QI',
  database: process.env.DB_NAME     || 'bgkwzqnaueygs0sltdxg'
});

const MIN_STOCK = 10;

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

  // 0. Safety check — make sure storage_setup.sql's unique key exists.
  //    Without it, ON DUPLICATE KEY UPDATE below would silently do
  //    nothing useful and duplicates could sneak back in.
  const keyCheck = await new Promise((resolve, reject) =>
    db.query(
      `SELECT COUNT(*) AS cnt FROM information_schema.statistics
       WHERE table_schema = DATABASE()
         AND table_name = 'storage_products'
         AND index_name = 'uq_product_brand'`,
      (e, r) => e ? reject(e) : resolve(r)
    )
  );
  if (keyCheck[0].cnt === 0) {
    console.error('❌ uq_product_brand unique key not found on storage_products.');
    console.error('   Run the updated storage_setup.sql FIRST, then re-run this script.');
    db.end();
    process.exit(1);
  }
  console.log('✅ Unique key present — safe to sync.\n');

  // 1. Rebuild storage_products from every row in elite_products,
  //    each getting stock_in = 10 minimum. Existing rows for the
  //    same product+brand keep their current stock_in unless it's
  //    below 10, in which case it's topped up to 10.
  await run(
    `INSERT INTO storage_products (product, brand, stock_in)
     SELECT product_name, company, ${MIN_STOCK}
     FROM elite_products
     ON DUPLICATE KEY UPDATE
       stock_in = GREATEST(storage_products.stock_in, ${MIN_STOCK})`,
    `Synced all elite_products rows into storage_products (min stock_in = ${MIN_STOCK})`
  );

  // 2. Recreate the auto-sync trigger with the correct default
  await run('DROP TRIGGER IF EXISTS trg_elite_products_after_insert', 'Dropped old trigger (if any)');

  await run(
    `CREATE TRIGGER trg_elite_products_after_insert
     AFTER INSERT ON elite_products
     FOR EACH ROW
     INSERT INTO storage_products (product, brand, stock_in)
     VALUES (NEW.product_name, NEW.company, ${MIN_STOCK})
     ON DUPLICATE KEY UPDATE
       stock_in = GREATEST(storage_products.stock_in, ${MIN_STOCK})`,
    `Installed trigger: new elite_products rows auto-sync to storage_products (stock_in = ${MIN_STOCK})`
  );

  // 3. Verify
  const storageRows = await new Promise((resolve, reject) =>
    db.query('SELECT COUNT(*) AS cnt FROM storage_products', (e, r) => e ? reject(e) : resolve(r))
  );
  const eliteRows = await new Promise((resolve, reject) =>
    db.query('SELECT COUNT(*) AS cnt FROM elite_products', (e, r) => e ? reject(e) : resolve(r))
  );
  const dupCheck = await new Promise((resolve, reject) =>
    db.query(
      `SELECT COUNT(*) AS cnt FROM (
         SELECT product, brand FROM storage_products
         GROUP BY product, brand HAVING COUNT(*) > 1
       ) x`,
      (e, r) => e ? reject(e) : resolve(r)
    )
  );

  console.log('\n📊 elite_products rows  :', eliteRows[0].cnt);
  console.log('📊 storage_products rows:', storageRows[0].cnt);
  console.log('📊 duplicate product+brand pairs:', dupCheck[0].cnt);
  console.log(dupCheck[0].cnt === 0
    ? '✅ No duplicates — clean.'
    : '⚠️  Duplicates still present — investigate before continuing.');

  console.log(`\n🚀 Done. Every product in elite_products now has a storage row`);
  console.log(`   with at least ${MIN_STOCK} in stock. Add a new row to elite_products`);
  console.log(`   (any way) and it will auto-appear in storage at stock_in = ${MIN_STOCK}.`);

  db.end();
}

main().catch(err => {
  console.error('\n💥 Setup aborted due to error above.');
  db.end();
  process.exit(1);
});
