const fs = require("fs");
const path = require("path");

const dir = __dirname;
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

const MAX = 85000;
const batches = [];
let cur = [];
let size = 0;
for (const f of files) {
  const t = fs.readFileSync(path.join(dir, f), "utf8");
  const add = t.length + 1;
  if (size + add > MAX && cur.length) {
    batches.push(cur);
    cur = [];
    size = 0;
  }
  cur.push({ f, s: t });
  size += add;
}
if (cur.length) batches.push(cur);

const pid = "ccjvdcsflifxbnbjowss";
batches.forEach((b, i) => {
  const q = b.map((x) => x.s).join("\n");
  const payload = JSON.stringify({ project_id: pid, query: q });
  const name = `batch-${String(i + 1).padStart(2, "0")}.json`;
  fs.writeFileSync(path.join(dir, name), payload, "utf8");
  console.log(name, b.map((x) => x.f).join(","), payload.length);
});
