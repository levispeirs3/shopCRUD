const fs = require("fs");
const path = require("path");

const dir = __dirname;
const outDir = path.join(dir, "_mcp_args");
const re = /^(shipments|order_items)_(\d+)\.sql$/;
const files = fs
  .readdirSync(dir)
  .filter((f) => re.test(f))
  .sort((a, b) => {
    const ma = a.match(re);
    const mb = b.match(re);
    if (ma[1] !== mb[1]) return ma[1] === "shipments" ? -1 : 1;
    return Number(ma[2]) - Number(mb[2]);
  });

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const pid = "ccjvdcsflifxbnbjowss";
let max = 0;
for (const f of files) {
  const q = fs.readFileSync(path.join(dir, f), "utf8");
  const payload = JSON.stringify({ project_id: pid, query: q });
  const name = f.replace(/\.sql$/, ".json");
  fs.writeFileSync(path.join(outDir, name), payload, "utf8");
  max = Math.max(max, payload.length);
}
console.log("wrote", files.length, "maxPayloadChars", max);
