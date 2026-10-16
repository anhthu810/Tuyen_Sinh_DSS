// For each existing table, check whether each expected column exists (READ-ONLY).
// Technique: GET ?select=<col>&limit=0 -> 200 if column exists, 400 (PGRST) if not.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error('MISSING ENV'); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const expected = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'expected_columns.json'), 'utf8'));

async function colExists(tbl, col) {
  const res = await fetch(`${URL}/rest/v1/${encodeURIComponent(tbl)}?select=${encodeURIComponent(col)}&limit=0`, { headers: H });
  if (res.ok) return { ok: true };
  const b = await res.json().catch(() => ({}));
  return { ok: false, status: res.status, msg: (b.message || '').slice(0, 120) };
}

// also discover EXTRA columns by probing a wildcard with embedded resource? Not possible without rows.
const out = ['# COLUMN PRESENCE CHECK (existing tables vs Excel headers)', 'project: ' + URL, ''];
let totalMissing = 0;
for (const [tbl, cols] of Object.entries(expected)) {
  const missing = [];
  for (const c of cols) {
    const r = await colExists(tbl, c);
    if (!r.ok) missing.push(c);
  }
  totalMissing += missing.length;
  out.push(`## ${tbl}: ${cols.length - missing.length}/${cols.length} expected columns present`);
  if (missing.length) out.push('   MISSING columns: ' + missing.join(', '));
  else out.push('   (all expected columns present)');
  out.push('');
}
fs.writeFileSync(path.resolve(__dirname, '../_db_columns.txt'), out.join('\n'), 'utf8');
console.log('done; total missing columns across tables:', totalMissing);
console.log(out.join('\n'));
