/**
 * Reads migrate-tmp/order_items_{2..10}.sql and prints JSON lines:
 * {"ok":true,"file":"...","args":{...}} for use with MCP execute_sql (manual paste) —
 * or run with --print-args-only to stdout one JSON object per file for inspection.
 *
 * For agent: use Node to load args and call MCP externally; this file only prepares payloads.
 */
import fs from "fs";
import path from "path";

const root = process.cwd();
const dir = path.join(root, "migrate-tmp");
const nums = [2, 3, 4, 5, 6, 7, 8, 9, 10];
const projectId = "ccjvdcsflifxbnbjowss";

for (const n of nums) {
  const file = path.join(dir, `order_items_${n}.sql`);
  const query = fs.readFileSync(file, "utf8");
  const args = { project_id: projectId, query };
  const out = path.join(root, `mcp-payload-order_items_${n}.json`);
  fs.writeFileSync(out, JSON.stringify(args), "utf8");
  console.log("wrote", out, "bytes", Buffer.byteLength(JSON.stringify(args)));
}
