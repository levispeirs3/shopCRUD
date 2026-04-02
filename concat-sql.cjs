const { readFileSync, writeFileSync, readdirSync } = require("fs");
const path = require("path");

const dir = "migrate-tmp";

function concat(prefix, outFile) {
  const files = readdirSync(dir)
    .filter(f => f.startsWith(prefix) && f.endsWith(".sql"))
    .sort((a, b) => {
      const numA = parseInt(a.replace(prefix, "").replace(".sql", ""));
      const numB = parseInt(b.replace(prefix, "").replace(".sql", ""));
      return numA - numB;
    });
  
  let combined = "";
  for (const f of files) {
    combined += readFileSync(path.join(dir, f), "utf8") + "\n\n";
  }
  writeFileSync(path.join(dir, outFile), combined);
  console.log(`${outFile}: ${files.length} files combined (${(combined.length / 1024).toFixed(0)} KB)`);
}

concat("shipments_", "all_shipments.sql");
concat("order_items_", "all_order_items_5_30.sql");
