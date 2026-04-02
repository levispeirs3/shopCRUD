const Database = require("better-sqlite3");
const { writeFileSync, mkdirSync } = require("fs");

const db = new Database("Data/shop.db", { readonly: true });
mkdirSync("migrate-tmp", { recursive: true });

const tables = ["customers", "products", "orders", "order_items", "shipments", "product_reviews"];
for (const t of tables) {
  const rows = db.prepare("SELECT * FROM " + t).all();
  writeFileSync("migrate-tmp/" + t + ".json", JSON.stringify(rows));
  console.log(t + ": " + rows.length + " rows exported");
}
db.close();
console.log("Done.");
