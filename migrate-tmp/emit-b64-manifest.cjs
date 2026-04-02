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

const out = files.map((f) => ({
  file: f,
  b64: fs.readFileSync(path.join(dir, f)).toString("base64"),
}));
fs.writeFileSync(
  path.join(dir, "_b64_manifest.json"),
  JSON.stringify(out),
  "utf8",
);
console.log("entries", out.length, "bytes", fs.statSync(path.join(dir, "_b64_manifest.json")).size);
