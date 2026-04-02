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

const CHUNK = 2;
let idx = 0;
for (let i = 0; i < files.length; i += CHUNK) {
  const slice = files.slice(i, i + CHUNK);
  const out = slice.map((f) => ({
    file: f,
    b64: fs.readFileSync(path.join(dir, f)).toString("base64"),
  }));
  const name = `_b64_chunk_${String(idx).padStart(2, "0")}.json`;
  fs.writeFileSync(path.join(dir, name), JSON.stringify(out), "utf8");
  console.log(name, out.length, fs.statSync(path.join(dir, name)).size);
  idx++;
}
