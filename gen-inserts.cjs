const { readFileSync, writeFileSync } = require("fs");

function escVal(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function genInserts(table, rows, batchSize) {
  if (rows.length === 0) return [];
  const cols = Object.keys(rows[0]);
  const colList = cols.join(", ");
  const batches = [];

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const values = batch
      .map((r) => "(" + cols.map((c) => escVal(r[c])).join(", ") + ")")
      .join(",\n");
    batches.push(`INSERT INTO ${table} (${colList}) VALUES\n${values};`);
  }
  return batches;
}

const tables = [
  { name: "customers", batch: 250 },
  { name: "products", batch: 100 },
  { name: "orders", batch: 500 },
  { name: "order_items", batch: 250 },
  { name: "shipments", batch: 250 },
  { name: "product_reviews", batch: 500 },
];

for (const t of tables) {
  const rows = JSON.parse(readFileSync("migrate-tmp/" + t.name + ".json", "utf8"));
  const batches = genInserts(t.name, rows, t.batch);
  for (let i = 0; i < batches.length; i++) {
    const fname = "migrate-tmp/" + t.name + "_" + i + ".sql";
    writeFileSync(fname, batches[i]);
  }
  console.log(t.name + ": " + batches.length + " batch file(s)");
}
console.log("Done.");
