const BASE = process.env.SB_URL, K = process.env.SB_K;
const H = { apikey: K, Authorization: 'Bearer ' + K };
const cnt = async (p) => {
  const r = await fetch(BASE + '/rest/v1/' + p, { headers: { ...H, Prefer: 'count=exact' } });
  return r.headers.get('content-range');
};
const g = async (p) => {
  const r = await fetch(BASE + '/rest/v1/' + p, { headers: H });
  return await r.json().catch(() => null);
};

console.log('main_dataset sample:', JSON.stringify(await g('main_dataset?select=application_id,best_method,best_margin_30,is_eligible,is_admitted,est_total_cost_vnd,affordability_index_pct&limit=2')));
console.log('dim_student sample:', JSON.stringify(await g('dim_student?select=student_id,special_case,exam_status,admission_status,admitted_program_id,admitted_by_method&limit=2')));
for (const y of [2023, 2024, 2025, 2026]) console.log('exam_score year', y, '=>', await cnt('fact_exam_score?select=score_id&exam_year=eq.' + y + '&limit=1'));
console.log('cutoff_score rows:', JSON.stringify(await g('fact_cutoff_score?select=cutoff_id&limit=3')));
for (const y of [2023, 2024, 2025, 2026]) console.log('main_dataset cohort', y, '=>', await cnt('main_dataset?select=application_id&cohort_year=eq.' + y + '&limit=1'));
console.log('dim_program in_simulation=true =>', await cnt('dim_program?select=program_id&in_simulation=is.true&limit=1'));
console.log('dim_program in_simulation=false =>', await cnt('dim_program?select=program_id&in_simulation=is.false&limit=1'));
console.log('main_dataset is_admitted=true =>', await cnt('main_dataset?select=application_id&is_admitted=is.true&limit=1'));
