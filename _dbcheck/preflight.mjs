import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.SB_URL, K = process.env.SB_K;
const H = { apikey: K, Authorization: 'Bearer ' + K };

async function allKeys(table, col) {
  const set = new Set();
  let offset = 0;
  const limit = 1000;
  for (;;) {
    const r = await fetch(`${BASE}/rest/v1/${table}?select=${col}&limit=${limit}&offset=${offset}`, { headers: H });
    const rows = await r.json();
    if (!Array.isArray(rows) || rows.length === 0) break;
    for (const row of rows) set.add(row[col]);
    if (rows.length < limit) break;
    offset += limit;
  }
  return set;
}

const load = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8'));

const programs = await allKeys('dim_program', 'program_id');
const unis = await allKeys('dim_university', 'university_code');
const students = await allKeys('dim_student', 'student_id');
const apps = await allKeys('main_dataset', 'application_id');
console.log('DB keys: programs=%d unis=%d students=%d apps(main_dataset)=%d', programs.size, unis.size, students.size, apps.size);

function orphans(records, col, ref, refName) {
  const bad = new Set();
  for (const r of records) {
    const v = r[col];
    if (v != null && !ref.has(v)) bad.add(v);
  }
  return bad;
}

const cutoff = load('cutoff_score.json');
const score = load('score.json');
const forecast = load('cutoff_forecast.json');
const am = load('application_method.json');

// cutoff_ids that WILL exist after we load cutoff_score
const cutoffIds = new Set(cutoff.map(r => r.cutoff_id));

const checks = [
  ['cutoff_score.program_id -> dim_program', orphans(cutoff, 'program_id', programs)],
  ['cutoff_score.university_code -> dim_university', orphans(cutoff, 'university_code', unis)],
  ['score.student_id -> dim_student', orphans(score, 'student_id', students)],
  ['cutoff_forecast.program_id -> dim_program', orphans(forecast, 'program_id', programs)],
  ['cutoff_forecast.university_code -> dim_university', orphans(forecast, 'university_code', unis)],
  ['application_method.application_id -> main_dataset', orphans(am, 'application_id', apps)],
  ['application_method.cutoff_id -> (cutoff_score to be loaded)', orphans(am, 'cutoff_id', cutoffIds)],
];

console.log('\n== ORPHAN / FK PREFLIGHT ==');
for (const [name, bad] of checks) {
  const arr = [...bad];
  console.log(`${bad.size === 0 ? 'OK  ' : 'FAIL'} ${name}: ${bad.size} orphans${bad.size ? ' -> e.g. ' + arr.slice(0, 10).join(', ') : ''}`);
}

// duplicate PK check within each dataset
function dupPk(records, pk) {
  const seen = new Set(), dup = new Set();
  for (const r of records) { const v = r[pk]; if (seen.has(v)) dup.add(v); else seen.add(v); }
  return dup;
}
console.log('\n== DUPLICATE PK IN SOURCE ==');
console.log('cutoff_score dup cutoff_id:', dupPk(cutoff, 'cutoff_id').size);
console.log('score dup score_id:', dupPk(score, 'score_id').size);
console.log('cutoff_forecast dup forecast_id:', dupPk(forecast, 'forecast_id').size);
console.log('application_method dup app_method_id:', dupPk(am, 'app_method_id').size);
