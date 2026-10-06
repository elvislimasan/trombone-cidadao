// Somente o cluster PostgreSQL descartável do workspace; sem Supabase remoto.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';
const connection = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres' };
const owner = new pg.Client(connection);
await owner.connect();
const directory = (await owner.query('show data_directory')).rows[0].data_directory;
assert.equal(path.resolve(directory).toLowerCase(), path.resolve('.tmp/municipal-demand-pg').toLowerCase());
const database = 'electrician_patrol_test_' + Date.now();
await owner.query('create database ' + database);
const db = new pg.Client({ ...connection, database });
await db.connect();
let checks = 0;
const check = async (name, fn) => { await fn(); checks++; console.log('OK: ' + name); };
const mine = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
try {
  await db.query(`create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    create table profiles(id uuid primary key); create table cities(id bigint primary key);
    insert into profiles values('${mine}'),('${other}'); insert into cities values(1);`);
  const base = await fs.readFile('supabase/migrations/172_patrols.sql', 'utf8');
  await db.query(base.slice(0, base.indexOf('-- ── Totais')));
  await db.query(await fs.readFile('supabase/migrations/188_patrol_paths.sql', 'utf8'));
  await db.query(await fs.readFile('supabase/migrations/189_patrol_path_actions.sql', 'utf8'));
  const migration = await fs.readFile('supabase/migrations/349_electrician_patrols.sql', 'utf8');
  await check('migração aceita reaplicação', async () => { await db.query(migration); await db.query(migration); });
  const asUser = async (id) => { await db.query('set role authenticated'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); };
  await asUser(mine);
  let id;
  await check('grava patrulha profissional com IDs bigint e percurso privado', async () => {
    id = (await db.query(`insert into patrols(user_id,city_id,started_at,ended_at,duration_seconds,distance_meters,lighting_patrol,lighting_passed_pole_ids,lighting_updated_pole_ids)
      values($1,1,now()-interval '10 minutes',now(),600,500,true,array[159189,9223372036854775800]::bigint[],array[159189]::bigint[]) returning id`, [mine])).rows[0].id;
    await db.query(`insert into patrol_paths(patrol_id,user_id,path,points,actions) values($1,$2,'[[-38.57,-8.6],[-38.571,-8.601]]',2,'[{"lng":-38.57,"lat":-8.6,"t":"confirmacao"}]')`, [id, mine]);
    assert.equal((await db.query('select * from patrols')).rowCount, 1);
    assert.equal((await db.query('select * from patrol_paths')).rowCount, 1);
  });
  await check('poste atualizado deve fazer parte dos encontrados', async () => {
    await assert.rejects(db.query('update patrols set lighting_updated_pole_ids=array[999]::bigint[] where id=$1', [id]), /patrols_lighting_poles/);
  });
  await check('patrulha comum mantém os campos profissionais vazios', async () => {
    await assert.rejects(db.query('update patrols set lighting_patrol=false where id=$1', [id]), /patrols_lighting_poles/);
    const row = (await db.query('insert into patrols(user_id,started_at,ended_at,duration_seconds,distance_meters) values($1,now(),now(),0,0) returning *',[mine])).rows[0];
    assert.equal(row.lighting_patrol, false); assert.deepEqual(row.lighting_passed_pole_ids, []);
  });
  await check('outro usuário não lê nem altera a patrulha e o percurso', async () => {
    await asUser(other);
    assert.equal((await db.query('select * from patrols where id=$1',[id])).rowCount, 0);
    assert.equal((await db.query('select * from patrol_paths where patrol_id=$1',[id])).rowCount, 0);
    assert.equal((await db.query('update patrols set distance_meters=900 where id=$1',[id])).rowCount, 0);
    await assert.rejects(db.query('insert into patrols(user_id,started_at,ended_at,duration_seconds,distance_meters) values($1,now(),now(),0,0)',[mine]), /row-level security/);
  });
  await check('apagar a patrulha remove o percurso', async () => { await asUser(mine); await db.query('delete from patrols where id=$1',[id]); assert.equal((await db.query('select * from patrol_paths')).rowCount, 0); });
  console.log(`${checks} verificações de banco aprovadas.`);
} finally {
  await db.end();
  try { await owner.query('drop database ' + database); } finally { await owner.end(); }
}
