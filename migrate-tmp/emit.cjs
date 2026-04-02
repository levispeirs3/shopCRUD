const fs = require("fs");
const path = require("path");
const dir = __dirname;
const f = process.argv[2];
if (!f) {
  console.error("usage: node emit.cjs <file.sql>");
  process.exit(1);
}
const q = fs.readFileSync(path.join(dir, f), "utf8");
process.stdout.write(
  JSON.stringify({ project_id: "ccjvdcsflifxbnbjowss", query: q }),
);
