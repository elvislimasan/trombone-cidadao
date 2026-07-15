const { Client } = require('pg');
const c = new Client({
  host: 'aws-1-us-east-1.pooler.supabase.com',
  port: 5432, database: 'postgres',
  user: 'postgres.xxdletrjyjajtrmhwzev',
  password: process.env.DEV_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await c.connect();

  const cities = await c.query('select count(*) as n from public.cities');
  console.log('cities count:', cities.rows[0].n);

  const states = await c.query('select count(*) as n from public.states');
  console.log('states count:', states.rows[0].n);

  const colisoes = await c.query(`
    select count(*) as n from (
      select unaccent(lower(trim(c.name))), c.state_id
      from public.cities c
      group by unaccent(lower(trim(c.name))), c.state_id
      having count(*) > 1
    ) sub
  `);
  console.log('colisoes (deve ser 0):', colisoes.rows[0].n);

  const fl_pe = await c.query("select public.match_city('Floresta','PE') as id");
  console.log('match_city(Floresta,PE):', fl_pe.rows[0].id, '(deve ter valor)');

  const fl_pr = await c.query("select public.match_city('Floresta','PR') as id");
  console.log('match_city(Floresta,PR):', fl_pr.rows[0].id, '(deve ser diferente de PE)');

  const rec_sp = await c.query("select public.match_city('Recife','SP') as id");
  console.log('match_city(Recife,SP):', rec_sp.rows[0].id, '(deve ser null)');

  const rep_col = await c.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='reports' and column_name='city_id'
  `);
  console.log('reports.city_id existe:', rep_col.rowCount === 1);

  const prof_col = await c.query(`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='profiles' and column_name='city_id'
  `);
  console.log('profiles.city_id existe:', prof_col.rowCount === 1);

  const rep_null = await c.query('select count(*) as n from public.reports where city_id is null');
  const rep_total = await c.query('select count(*) as n from public.reports');
  console.log('reports sem city_id (pre-backfill):', rep_null.rows[0].n, '/', rep_total.rows[0].n);

  await c.end();
}

run().catch(e => { console.error('ERRO:', e.message); process.exit(1); });
