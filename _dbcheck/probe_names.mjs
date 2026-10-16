// Probe which table/view names actually exist in the project (READ-ONLY).
// 200 => exists (anon has SELECT grant; rows may be RLS-filtered)
// 404 PGRST205 => does not exist under that name
// 401/403 => exists but anon not permitted
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const URL = process.env.SUPABASE_URL, KEY = process.env.SUPABASE_KEY;
if (!URL || !KEY) { console.error('MISSING ENV'); process.exit(2); }
const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const CANDIDATES = [
  // canonical
  'dim_university','dim_program','dim_student',
  'fact_exam_score','fact_application','fact_application_method','fact_cutoff_score',
  'fact_quota','fact_tuition','fact_employment','fact_labor_demand','fact_cutoff_forecast',
  'v_main_dataset','v_student_outcome','v_coverage_real','v_coverage_sim',
  // sheet names
  'university','program','student','score','application','application_method',
  'cutoff_score','quota','tuition','employment','labor_demand','cutoff_forecast',
  'main_dataset','student_outcome','case_summary','kpi_sheet','data_dictionary','source_log',
  // extra ref tables mentioned in Source_Log / README
  'map_admission_code','dim_program_member_major','fact_salary','fact_macro_labor',
  // common plurals / misc
  'universities','programs','students','applications','scores','cutoffs','quotas',
];

async function probe(t) {
  try {
    const res = await fetch(`${URL}/rest/v1/${encodeURIComponent(t)}?select=*&limit=1`, {
      headers: { ...H, Prefer: 'count=exact' },
    });
    const cr = res.headers.get('content-range');
    let count = null;
    if (cr && cr.includes('/')) { const tail = cr.split('/')[1]; count = tail === '*' ? null : parseInt(tail, 10); }
    let code = '';
    if (!res.ok) { const b = await res.json().catch(() => ({})); code = b.code || ''; }
    return { status: res.status, count, code };
  } catch (e) { return { status: 0, count: null, code: 'ERR:' + e.message }; }
}

const out = [];
const exists = [], missing = [], other = [];
for (const t of CANDIDATES) {
  const r = await probe(t);
  const line = `${t.padEnd(26)} status=${r.status} count=${r.count ?? 'n/a'}${r.code ? ' code=' + r.code : ''}`;
  out.push(line);
  if (r.status === 200) exists.push(`${t} (rows=${r.count ?? '?'})`);
  else if (r.status === 404) missing.push(t);
  else other.push(`${t} (${r.status} ${r.code})`);
}

const report = [
  '# TABLE NAME PROBE',
  'project: ' + URL,
  '',
  '## EXISTS (HTTP 200, anon can reach):',
  ...exists.map(s => '  + ' + s),
  '',
  '## NOT FOUND (HTTP 404):',
  '  ' + (missing.join(', ') || 'none'),
  '',
  '## OTHER (auth/err):',
  ...(other.length ? other.map(s => '  ? ' + s) : ['  none']),
  '',
  '## RAW',
  ...out,
].join('\n');
fs.writeFileSync(path.resolve(__dirname, '../_db_names.txt'), report, 'utf8');
console.log('EXISTS:', exists.length, '| MISSING:', missing.length, '| OTHER:', other.length);
console.log(exists.join('\n'));
