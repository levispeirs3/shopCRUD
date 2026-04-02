import Database from "better-sqlite3";
import postgres from "postgres";
import { readFileSync } from "fs";

const DB_PATH = "Data/shop.db";
const SUPABASE_URL = process.env.SUPABASE_DB_URL;

if (!SUPABASE_URL) {
  console.error("Set SUPABASE_DB_URL in your environment or .env.local");
  process.exit(1);
}

const db = new Database(DB_PATH, { readonly: true });
const sql = postgres(SUPABASE_URL, { ssl: "require", prepare: false });

async function migrateTable(tableName, columns) {
  const rows = db.prepare(`SELECT ${columns.join(", ")} FROM ${tableName}`).all();
  console.log(`Migrating ${tableName}: ${rows.length} rows...`);

  if (rows.length === 0) return;

  const BATCH = 250;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    await sql`INSERT INTO ${sql(tableName)} ${sql(batch, ...columns)}`;
    process.stdout.write(`  inserted ${Math.min(i + BATCH, rows.length)}/${rows.length}\r`);
  }
  console.log(`  ${tableName} done.`);
}

async function resetSequence(tableName, pkColumn) {
  await sql.unsafe(
    `SELECT setval(pg_get_serial_sequence('${tableName}', '${pkColumn}'), (SELECT COALESCE(MAX(${pkColumn}), 0) FROM ${tableName}))`
  );
}

try {
  await migrateTable("customers", [
    "customer_id", "full_name", "email", "gender", "birthdate", "created_at",
    "city", "state", "zip_code", "customer_segment", "loyalty_tier", "is_active",
  ]);

  await migrateTable("products", [
    "product_id", "sku", "product_name", "category", "price", "cost", "is_active",
  ]);

  await migrateTable("orders", [
    "order_id", "customer_id", "order_datetime", "billing_zip", "shipping_zip",
    "shipping_state", "payment_method", "device_type", "ip_country", "promo_used",
    "promo_code", "order_subtotal", "shipping_fee", "tax_amount", "order_total",
    "risk_score", "is_fraud",
  ]);

  await migrateTable("order_items", [
    "order_item_id", "order_id", "product_id", "quantity", "unit_price", "line_total",
  ]);

  await migrateTable("shipments", [
    "shipment_id", "order_id", "ship_datetime", "carrier", "shipping_method",
    "distance_band", "promised_days", "actual_days", "late_delivery",
  ]);

  await migrateTable("product_reviews", [
    "review_id", "customer_id", "product_id", "rating", "review_datetime", "review_text",
  ]);

  console.log("\nResetting sequences...");
  await resetSequence("customers", "customer_id");
  await resetSequence("products", "product_id");
  await resetSequence("orders", "order_id");
  await resetSequence("order_items", "order_item_id");
  await resetSequence("shipments", "shipment_id");
  await resetSequence("product_reviews", "review_id");

  console.log("\nVerifying row counts...");
  const counts = await sql.unsafe(`
    SELECT 'customers' as t, COUNT(*)::int as c FROM customers
    UNION ALL SELECT 'products', COUNT(*)::int FROM products
    UNION ALL SELECT 'orders', COUNT(*)::int FROM orders
    UNION ALL SELECT 'order_items', COUNT(*)::int FROM order_items
    UNION ALL SELECT 'shipments', COUNT(*)::int FROM shipments
    UNION ALL SELECT 'product_reviews', COUNT(*)::int FROM product_reviews
  `);
  for (const row of counts) {
    console.log(`  ${row.t}: ${row.c}`);
  }

  console.log("\nMigration complete!");
} catch (err) {
  console.error("Migration failed:", err);
  process.exit(1);
} finally {
  db.close();
  await sql.end();
}
