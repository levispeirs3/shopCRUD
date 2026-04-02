const { readFileSync, readdirSync } = require("fs");
const path = require("path");
const { Client } = require("pg");

// Session pooler (IPv4): postgres.<ref> @ aws-0-<region>.pooler.supabase.com:5432
// Use when direct db.<ref>.supabase.co is IPv6-only and Node cannot resolve it.
const client = new Client({
  host: process.env.PG_HOST || "aws-0-us-east-1.pooler.supabase.com",
  port: Number(process.env.PG_PORT) || 5432,
  database: "postgres",
  user: process.env.PG_USER || "postgres.ccjvdcsflifxbnbjowss",
  password: process.env.PG_PASSWORD || "",
  ssl: { rejectUnauthorized: false },
});

const dir = "migrate-tmp";

function getBatchFiles(prefix) {
  return readdirSync(dir)
    .filter(f => f.match(new RegExp(`^${prefix}\\d+\\.sql$`)))
    .sort((a, b) => {
      const numA = parseInt(a.replace(prefix, "").replace(".sql", ""));
      const numB = parseInt(b.replace(prefix, "").replace(".sql", ""));
      return numA - numB;
    });
}

async function run() {
  await client.connect();
  console.log("Connected to Supabase Postgres.");

  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM shipments) AS ship,
      (SELECT COUNT(*)::int FROM order_items) AS oi
  `);
  console.log("Current counts:", counts.rows[0]);

  const shipFiles = getBatchFiles("shipments_");
  console.log(`\nShipments: ${shipFiles.length} batch file(s)`);

  if (counts.rows[0].ship < 5000) {
    console.log("Clearing partial shipments data...");
    await client.query("DELETE FROM shipments");
    for (const f of shipFiles) {
      const content = readFileSync(path.join(dir, f), "utf8").trim();
      if (!content.startsWith("INSERT")) continue;
      console.log(`  Executing ${f}...`);
      await client.query(content);
    }
    const shipCount = await client.query("SELECT COUNT(*)::int AS c FROM shipments");
    console.log(`  Shipments total: ${shipCount.rows[0].c}`);
    await client.query("SELECT setval(pg_get_serial_sequence('shipments','shipment_id'), (SELECT MAX(shipment_id) FROM shipments))");
  } else {
    console.log("  Shipments already complete, skipping.");
  }

  const oiFiles = getBatchFiles("order_items_");
  console.log(`\nOrder items: ${oiFiles.length} batch file(s)`);

  if (counts.rows[0].oi < 15000) {
    console.log("Clearing partial order_items data...");
    await client.query("DELETE FROM order_items");
    for (const f of oiFiles) {
      const content = readFileSync(path.join(dir, f), "utf8").trim();
      if (!content.startsWith("INSERT")) continue;
      console.log(`  Executing ${f}...`);
      await client.query(content);
    }
    const oiCount = await client.query("SELECT COUNT(*)::int AS c FROM order_items");
    console.log(`  Order items total: ${oiCount.rows[0].c}`);
    await client.query("SELECT setval(pg_get_serial_sequence('order_items','order_item_id'), (SELECT MAX(order_item_id) FROM order_items))");
  } else {
    console.log("  Order items already complete, skipping.");
  }

  const final = await client.query(`
    SELECT 'customers' AS t, COUNT(*)::int AS c FROM customers
    UNION ALL SELECT 'products', COUNT(*)::int FROM products
    UNION ALL SELECT 'orders', COUNT(*)::int FROM orders
    UNION ALL SELECT 'order_items', COUNT(*)::int FROM order_items
    UNION ALL SELECT 'shipments', COUNT(*)::int FROM shipments
    UNION ALL SELECT 'product_reviews', COUNT(*)::int FROM product_reviews
  `);
  console.log("\nFinal row counts:");
  for (const row of final.rows) {
    console.log(`  ${row.t}: ${row.c}`);
  }

  await client.end();
  console.log("\nDone.");
}

run().catch(async (err) => {
  console.error("Migration failed:", err.message || err);
  try { await client.end(); } catch {}
  process.exit(1);
});
