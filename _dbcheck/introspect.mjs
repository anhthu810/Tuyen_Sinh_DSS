// READ-ONLY Supabase/Postgres introspection. Runs only SELECTs against catalogs.
// Connection string resolution order:
//   1) process.env.DATABASE_URL
//   2) first CLI arg
//   3) DATABASE_URL=... line in ../.env.local  or  ../.env
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function fromEnvFile() {
  for (const f of ['../.env.local', '../.env', '.env.local', '.env']) {
    const p = path.resolve(__dirname, f);
    if (fs.existsSync(p)) {
      const txt = fs.readFileSync(p, 'utf8');
      const m = txt.match(/^\s*(?:DATABASE_URL|SUPABASE_DB_URL|POSTGRES_URL)\s*=\s*["']?(.+?)["']?\s*$/m);
      if (m) return m[1];
    }
  }
  return null;
}

const conn = process.env.DATABASE_URL || process.argv[2] || fromEnvFile();
if (!conn) {
  console.error('NO_CONNECTION_STRING');
  process.exit(2);
}

const client = new pg.Client({
  connectionString: conn,
  ssl: { rejectUnauthorized: false },
  statement_timeout: 20000,
});

const out = [];
const log = (s) => out.push(s);

async function q(sql, params = []) {
  const r = await client.query(sql, params);
  return r.rows;
}

try {
  await client.connect();
  log('# SUPABASE / POSTGRES INTROSPECTION REPORT');
  const ver = (await q('select version() v'))[0].v;
  log('version: ' + ver);
  const dbname = (await q('select current_database() d'))[0].d;
  log('database: ' + dbname);

  // Schemas (non-system)
  const schemas = await q(`
    select nspname from pg_namespace
    where nspname not in ('pg_catalog','information_schema','pg_toast')
      and nspname not like 'pg_temp%' and nspname not like 'pg_toast_temp%'
    order by nspname`);
  log('\n## SCHEMAS\n' + schemas.map(s => '- ' + s.nspname).join('\n'));

  // Tables + estimated and exact-ish row counts (public + others non-system)
  const tables = await q(`
    select n.nspname as schema, c.relname as name, c.relkind,
           c.relrowsecurity as rls_enabled,
           coalesce(s.n_live_tup, 0) as est_rows
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    left join pg_stat_user_tables s on s.relid = c.oid
    where c.relkind in ('r','v','m','p')
      and n.nspname not in ('pg_catalog','information_schema','pg_toast')
      and n.nspname not like 'pg_%'
    order by n.nspname, c.relkind, c.relname`);

  log('\n## RELATIONS (tables r / views v / matview m / partitioned p)');
  for (const t of tables) {
    log(`- [${t.relkind}] ${t.schema}.${t.name}  rls=${t.rls_enabled}  est_rows=${t.est_rows}`);
  }

  // Exact row counts for base tables in public
  log('\n## EXACT ROW COUNTS (public base tables)');
  const baseTables = tables.filter(t => t.relkind === 'r' && t.schema === 'public');
  for (const t of baseTables) {
    try {
      const c = (await q(`select count(*)::int n from "${t.schema}"."${t.name}"`))[0].n;
      log(`- ${t.schema}.${t.name}: ${c}`);
    } catch (e) {
      log(`- ${t.schema}.${t.name}: ERROR ${e.message}`);
    }
  }

  // Columns for all public relations
  log('\n## COLUMNS (public)');
  const cols = await q(`
    select table_name, column_name, data_type, udt_name, is_nullable, column_default,
           character_maximum_length, numeric_precision, numeric_scale, ordinal_position
    from information_schema.columns
    where table_schema = 'public'
    order by table_name, ordinal_position`);
  let cur = null;
  for (const c of cols) {
    if (c.table_name !== cur) { cur = c.table_name; log(`\n### ${c.table_name}`); }
    const type = c.data_type === 'USER-DEFINED' ? c.udt_name
      : (c.character_maximum_length ? `${c.data_type}(${c.character_maximum_length})` : c.data_type);
    log(`  - ${c.column_name} ${type}${c.is_nullable === 'NO' ? ' NOT NULL' : ''}${c.column_default ? ' DEFAULT ' + c.column_default : ''}`);
  }

  // Primary keys
  log('\n## PRIMARY KEYS (public)');
  const pks = await q(`
    select tc.table_name, kcu.column_name, kcu.ordinal_position
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'PRIMARY KEY' and tc.table_schema = 'public'
    order by tc.table_name, kcu.ordinal_position`);
  const pkByTable = {};
  for (const p of pks) (pkByTable[p.table_name] ??= []).push(p.column_name);
  for (const [t, c] of Object.entries(pkByTable)) log(`- ${t} (${c.join(', ')})`);
  if (!Object.keys(pkByTable).length) log('- (none)');

  // Foreign keys
  log('\n## FOREIGN KEYS (public)');
  const fks = await q(`
    select tc.table_name, kcu.column_name,
           ccu.table_name as ref_table, ccu.column_name as ref_column,
           rc.update_rule, rc.delete_rule, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
    join information_schema.referential_constraints rc
      on rc.constraint_name = tc.constraint_name and rc.constraint_schema = tc.table_schema
    where tc.constraint_type = 'FOREIGN KEY' and tc.table_schema = 'public'
    order by tc.table_name, kcu.column_name`);
  for (const f of fks) log(`- ${f.table_name}.${f.column_name} -> ${f.ref_table}.${f.ref_column}  (upd ${f.update_rule}/del ${f.delete_rule})`);
  if (!fks.length) log('- (none) <-- NOTE: no FK constraints defined');

  // Unique constraints
  log('\n## UNIQUE CONSTRAINTS (public)');
  const uniq = await q(`
    select tc.table_name, string_agg(kcu.column_name, ', ' order by kcu.ordinal_position) cols, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'UNIQUE' and tc.table_schema = 'public'
    group by tc.table_name, tc.constraint_name
    order by tc.table_name`);
  for (const u of uniq) log(`- ${u.table_name} (${u.cols})`);
  if (!uniq.length) log('- (none)');

  // Indexes
  log('\n## INDEXES (public)');
  const idx = await q(`
    select tablename, indexname, indexdef from pg_indexes
    where schemaname = 'public' order by tablename, indexname`);
  for (const i of idx) log(`- ${i.tablename}: ${i.indexname}`);
  if (!idx.length) log('- (none)');

  // RLS policies
  log('\n## RLS POLICIES (public)');
  const pol = await q(`
    select tablename, policyname, cmd, roles, qual, with_check
    from pg_policies where schemaname = 'public' order by tablename, policyname`);
  for (const p of pol) log(`- ${p.tablename}.${p.policyname} cmd=${p.cmd} roles=${p.roles}`);
  if (!pol.length) log('- (none)');

  // Views definitions (public)
  log('\n## VIEW DEFINITIONS (public)');
  const views = await q(`
    select table_name, view_definition from information_schema.views
    where table_schema = 'public' order by table_name`);
  for (const v of views) log(`\n### VIEW ${v.table_name}\n${(v.view_definition || '').slice(0, 2000)}`);
  if (!views.length) log('- (none)');

  // Functions (public)
  log('\n## FUNCTIONS (public)');
  const fns = await q(`
    select p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' order by p.proname`);
  for (const f of fns) log(`- ${f.proname}(${f.args})`);
  if (!fns.length) log('- (none)');

  fs.writeFileSync(path.resolve(__dirname, '../_db_report.txt'), out.join('\n'), 'utf8');
  console.log('OK wrote ../_db_report.txt');
  console.log(`tables/views: ${tables.length}, FKs: ${fks.length}, policies: ${pol.length}`);
} catch (e) {
  console.error('CONNECT_OR_QUERY_ERROR:', e.message);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
