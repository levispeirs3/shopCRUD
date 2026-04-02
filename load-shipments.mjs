import postgres from "postgres";
import { readFileSync } from "fs";

const DB_URL = process.env.SUPABASE_DB_URL || process.argv[2];
if (!DB_URL) {
  console.error(
    "Usage: node load-shipments.mjs <database-url>\n" +
    "  or set SUPABASE_DB_URL env var\n\n" +
    "Example: node load-shipments.mjs postgresql://postgres.ccjvdcsflifxbnbjowss:PASSWORD@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
  );
  process.exit(1);
}

const sql = postgres(DB_URL, { ssl: "require", prepare: false });

try {
  for (let i = 0; i < 10; i++) {
    const file = `migrate-tmp/shipments_${i}.sql`;
    const content = readFileSync(file, "utf8");
    console.log(`Executing ${file} ...`);
    await sql.unsafe(content);
    console.log(`  Done.`);
  }

  console.log("\nResetting shipment_id sequence...");
  await sql.unsafe(
    `SELECT setval(pg_get_serial_sequence('shipments', 'shipment_id'), (SELECT MAX(shipment_id) FROM shipments))`
  );

  const [{ total }] = await sql.unsafe(
    `SELECT COUNT(*) as total FROM shipments`
  );
  console.log(`\nTotal rows in shipments: ${total}`);
} catch (err) {
  console.error("Failed:", err.message);
  process.exit(1);
} finally {
  await sql.end();
}
