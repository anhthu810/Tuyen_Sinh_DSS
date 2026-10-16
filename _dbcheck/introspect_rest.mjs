// READ-ONLY introspection of a Supabase project via the PostgREST REST API,
// using only the publishable/anon key (no DB password).
// Reads the OpenAPI schema (tables, columns, types, PK/FK notes) and row counts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error('MISSING SUPABASE_URL/SUPABASE_KEY'); process.exit(2); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const out = [];
const log = (s) => out.push(s);

// Expected tables from the Excel data package (canonical names) + confident row counts
const EXPECTED = {
  dim_university: 7,
  dim_program: 380,
  dim_student: 500,
  fact_exam_score: null,          // ~ up to 500
  fact_application: 3096,
  fact_application_method: 4587,
  fact_cutoff_score: 2939,
  fact_quota: 1366,
  fact_tuition: null,
  fact_employment: null,
  fact_labor_demand: null,
  fact_cutoff_forecast: 1826,
  v_main_dataset: 3096,
  v_student_outcome: 500,
  v_coverage_real: null,
  v_coverage_sim: null,
};

async function getCount(table) {
  try {
    const res = await fetch(`${URL}/rest/v1/${encodeURIComponent(table)}?select=*&limit=1`, {
      headers: { ...H, Prefer: 'count=exact' },
    });
    const cr = res.headers.get('content-range'); // e.g. 0-0/3096  or  */0
    let count = null;
    if (cr && cr.includes('/')) {
      const tail = cr.split('/')[1];
      count = tail === '*' ? null : parseInt(tail, 10);
    }
    let note = '';
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      note = `HTTP ${res.status} ${body.slice(0, 160)}`;
    }
    return { status: res.status, count, note };
  } catch (e) {
    return { status: 0, count: null, note: 'FETCH_ERR ' + e.message };
  }
}

try {
  log('# SUPABASE REST INTROSPECTION');
  log('project: ' + URL);

  // 1) OpenAPI root
  const root = await fetch(`${URL}/rest/v1/`, { headers: H });
  log('root status: ' + root.status);
  if (!root.ok) {
    const b = await root.text().catch(() => '');
    log('root error body: ' + b.slice(0, 300));
  }
  const spec = await root.json().catch(() => null);

  const defs = (spec && (spec.definitions || (spec.components && spec.components.schemas))) || {};
  const exposed = Object.keys(defs).sort();
  log('\n## EXPOSED RELATIONS (public, visible to anon): ' + exposed.length);
  for (const t of exposed) log('- ' + t);

  // 2) Columns / types / PK-FK notes per exposed relation
  log('\n## COLUMNS & KEY NOTES');
  for (const t of exposed) {
    const d = defs[t];
    const props = (d && d.properties) || {};
    const req = (d && d.required) || [];
    log(`\n### ${t}`);
    for (const [col, meta] of Object.entries(props)) {
      const type = meta.format || meta.type || '?';
      const desc = (meta.description || '').replace(/\s+/g, ' ').trim();
      const flags = [];
      if (req.includes(col)) flags.push('NOT NULL');
      if (/Primary Key/i.test(desc)) flags.push('PK');
      const fk = desc.match(/Foreign Key to `?([\w.]+)`?/i);
      if (fk) flags.push('FK->' + fk[1]);
      log(`  - ${col} ${type}${flags.length ? '  [' + flags.join(', ') + ']' : ''}`);
    }
  }

  // 3) Row counts for exposed + expected tables
  const toCount = Array.from(new Set([...exposed, ...Object.keys(EXPECTED)])).sort();
  log('\n## ROW COUNTS vs EXPECTED');
  const results = {};
  for (const t of toCount) {
    const r = await getCount(t);
    results[t] = r;
    const exp = EXPECTED[t];
    let verdict = '';
    if (!exposed.includes(t) && r.status === 404) verdict = '  <== MISSING (not in API)';
    else if (exp != null && r.count != null) {
      const diff = r.count - exp;
      verdict = diff === 0 ? '  (matches expected)' : `  <== expected ~${exp} (diff ${diff > 0 ? '+' : ''}${diff})`;
    } else if (r.count === 0) verdict = '  <== EMPTY (no rows / RLS blocks anon)';
    log(`- ${t}: count=${r.count ?? 'n/a'} status=${r.status}${r.note ? ' | ' + r.note : ''}${verdict}`);
  }

  // 4) Coverage summary vs expected canonical set
  log('\n## COVERAGE vs EXCEL CANONICAL TABLES');
  const missing = Object.keys(EXPECTED).filter(t => !exposed.includes(t));
  const extra = exposed.filter(t => !(t in EXPECTED));
  log('MISSING (in Excel package, not exposed by API): ' + (missing.length ? missing.join(', ') : 'none'));
  log('EXTRA (exposed but not in Excel canonical set): ' + (extra.length ? extra.join(', ') : 'none'));

  fs.writeFileSync(path.resolve(__dirname, '../_db_report_rest.txt'), out.join('\n'), 'utf8');
  console.log('OK wrote ../_db_report_rest.txt');
  console.log('exposed relations:', exposed.length, '| missing canonical:', missing.length, '| extra:', extra.length);
} catch (e) {
  console.error('ERROR:', e.message);
  fs.writeFileSync(path.resolve(__dirname, '../_db_report_rest.txt'), out.join('\n') + '\n\nFATAL: ' + e.message, 'utf8');
  process.exit(1);
}
