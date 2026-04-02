import { readFileSync } from 'fs';
import { join } from 'path';

const SUPABASE_URL = 'https://ccjvdcsflifxbnbjowss.supabase.co';
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNjanZkY3NmbGlmeGJuYmpvd3NzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxMzg2NzIsImV4cCI6MjA5MDcxNDY3Mn0.f3qNj_BS3LgLEVNsLCTXKwnOVUZEMPRnuLPYFc8soZw';
const DIR = join(process.cwd(), 'migrate-tmp');

async function execSql(sqlText) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': ANON_KEY,
      'Authorization': `Bearer ${ANON_KEY}`,
    },
    body: JSON.stringify({ sql_text: sqlText }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
  return res.status;
}

async function main() {
  for (let i = 0; i < 10; i++) {
    const file = join(DIR, `orders_${i}.sql`);
    const sql = readFileSync(file, 'utf-8');
    console.log(`Executing orders_${i}.sql (${sql.length} chars)...`);
    try {
      const status = await execSql(sql);
      console.log(`  orders_${i}.sql -> HTTP ${status} OK`);
    } catch (err) {
      console.error(`  orders_${i}.sql FAILED: ${err.message}`);
    }
  }
  console.log('Done!');
}

main();
