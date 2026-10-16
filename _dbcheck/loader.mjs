// Upsert a JSON array into a Supabase table via PostgREST (merge-duplicates on PK).
// Usage: node loader.mjs <table> <jsonFileInData>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SB_URL, K = process.env.SB_K;
const H = {
  apikey: K, Authorization: 'Bearer ' + K,
  'Content-Type': 'application/json',
  Prefer: 'resolution=merge-duplicates,return=minimal',
};

const table = process.argv[2];
const file = process.argv[3];
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'data', file), 'utf8'));
const BATCH = 500;

let done = 0, failed = 0;
for (let i = 0; i < rows.length; i += BATCH) {
  const chunk = rows.slice(i, i + BATCH);
  const res = await fetch(`${BASE}/rest/v1/${table}`, { method: 'POST', headers: H, body: JSON.stringify(chunk) });
  if (res.ok) {
    done += chunk.length;
  } else {
    failed += chunk.length;
    const body = await res.text().catch(() => '');
    console.error(`BATCH ${i}-${i + chunk.length} FAILED ${res.status}: ${body.slice(0, 400)}`);
    break; // stop on first error so we can inspect
  }
  process.stdout.write(`\r${table}: upserted ${done}/${rows.length}`);
}
process.stdout.write('\n');

// verify final count
const vr = await fetch(`${BASE}/rest/v1/${table}?select=*&limit=1`, { headers: { ...H, Prefer: 'count=exact' } });
console.log(`${table} final content-range: ${vr.headers.get('content-range')} | upserted=${done} failed=${failed}`);
