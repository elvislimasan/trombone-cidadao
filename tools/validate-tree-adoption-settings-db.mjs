// PostgreSQL descartável em loopback; não usa .env nem banco remoto.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import pg from 'pg';

const bin = 'C:/Program Files/PostgreSQL/17/bin';
const root = path.resolve('.tmp', `adoption-settings-db-${Date.now()}`);
await fs.mkdir(root, { recursive: true });
const cluster = path.join(root, 'data');
const init = spawnSync(path.join(bin, 'initdb.exe'), ['-D', cluster, '-U', 'settings_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { windowsHide: true, encoding: 'utf8' });
await fs.writeFile(path.join(root, 'init.log'), `${init.stdout}\n${init.stderr}`);
assert.equal(init.status, 0, `initdb falhou: ${root}`);
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const server = spawn(path.join(bin, 'postgres.exe'), ['-D', cluster, '-h', '127.0.0.1', '-p', String(port), '-c', 'fsync=off'], { windowsHide: true, stdio: 'ignore' });
let db;
const manager = '10000000-0000-0000-0000-000000000001';
const citizen = '10000000-0000-0000-0000-000000000002';
const attendant = '10000000-0000-0000-0000-000000000003';
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = new pg.Client({ host: '127.0.0.1', port, user: 'settings_test', database: 'postgres', connectionTimeoutMillis: 500 });
    try { await candidate.connect(); db = candidate; break; } catch { await candidate.end(); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(db, 'PostgreSQL não iniciou');
  await db.query(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    create table auth.users(id uuid primary key);
    insert into auth.users values ('${manager}'),('${citizen}'),('${attendant}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
    grant usage on schema auth, public to anon,authenticated;
    create table public.cities(id bigint primary key);
    insert into public.cities values (64),(65);
    create function public.can_dispatch_tree_adoption(p_city bigint) returns boolean
      language sql stable security definer as $$select auth.uid()='${manager}'::uuid and p_city=64$$;
    create table public.tree_adoption_requests(id int primary key,city_id bigint,request_type text,status text default 'solicitada');
    create function public.test_submit(p_id int,p_city bigint,p_type text) returns int
      language plpgsql security definer set search_path=public,pg_temp as $$
      begin
        if exists(select 1 from public.tree_adoption_requests where id=p_id) then return p_id; end if;
        insert into public.tree_adoption_requests(id,city_id,request_type) values(p_id,p_city,p_type);
        return p_id;
      end $$;
  `);
  await db.query(await fs.readFile('supabase/migrations/425_tree_adoption_planting_settings.sql', 'utf8'));
  // Atualização de uma cidade já configurada preserva o estado de plantio.
  await db.query('insert into public.tree_adoption_settings(city_id,planting_enabled) values(65,true)');
  await db.query(await fs.readFile('supabase/migrations/427_tree_adoption_seedlings_settings.sql', 'utf8'));
  assert.deepEqual((await db.query('select planting_enabled,seedlings_enabled from public.tree_adoption_settings where city_id=65')).rows[0], { planting_enabled: true, seedlings_enabled: true });
  await db.query('delete from public.tree_adoption_settings where city_id=65');
  const actor = async (id, role = 'authenticated') => { await db.query('reset role'); await db.query("select set_config('test.user',$1,false)", [id]); await db.query(`set role ${role}`); };
  await actor('', 'anon');
  assert.equal((await db.query('select count(*) from public.tree_adoption_settings')).rows[0].count, '0');
  await assert.rejects(db.query('insert into public.tree_adoption_settings(city_id,planting_enabled) values(64,true)'), /permission denied/);
  await actor(citizen);
  await assert.rejects(db.query("select public.test_submit(1,64,'plantio')"), /solicitações de plantio estão desativadas/);
  await db.query("select public.test_submit(2,64,'muda')");
  await assert.rejects(db.query('insert into public.tree_adoption_settings(city_id,planting_enabled) values(64,true)'), /row-level security/);
  await actor(attendant);
  await assert.rejects(db.query('insert into public.tree_adoption_settings(city_id,planting_enabled) values(64,true)'), /row-level security/);
  await actor(manager);
  await db.query('insert into public.tree_adoption_settings(city_id,planting_enabled) values(64,true)');
  await assert.rejects(db.query('insert into public.tree_adoption_settings(city_id,planting_enabled) values(65,true)'), /row-level security/);
  await assert.rejects(db.query('update public.tree_adoption_settings set city_id=65 where city_id=64'), /row-level security/);
  await actor('', 'anon');
  const enabled = (await db.query('select * from public.tree_adoption_settings where city_id=64')).rows[0];
  assert.equal(enabled.planting_enabled, true);
  assert.equal(enabled.updated_by, manager);
  await actor(citizen);
  assert.equal((await db.query('update public.tree_adoption_settings set planting_enabled=false where city_id=64')).rowCount, 0);
  await db.query("select public.test_submit(1,64,'plantio')");
  await assert.rejects(db.query("select public.test_submit(3,65,'plantio')"), /desativadas/);
  await actor(manager);
  await db.query('update public.tree_adoption_settings set planting_enabled=false where city_id=64');
  await actor(citizen);
  await assert.rejects(db.query("select public.test_submit(4,64,'plantio')"), /desativadas/);
  // Pedidos já recebidos e reenvios idempotentes permanecem disponíveis.
  await db.query("select public.test_submit(1,64,'plantio')");
  await db.query("select public.test_submit(5,64,'muda')");
  await actor(manager);
  await db.query('update public.tree_adoption_settings set seedlings_enabled=false where city_id=64');
  await actor(citizen);
  await assert.rejects(db.query("select public.test_submit(6,64,'muda')"), /solicitações de mudas estão desativadas/);
  // A pausa de uma cidade não impede mudas em outra cidade.
  await db.query("select public.test_submit(7,65,'muda')");
  await actor(manager);
  await db.query('insert into public.tree_adoption_settings(city_id,planting_enabled) values(64,true) on conflict(city_id) do update set planting_enabled=excluded.planting_enabled');
  assert.equal((await db.query('select seedlings_enabled from public.tree_adoption_settings where city_id=64')).rows[0].seedlings_enabled, false);
  await actor(citizen);
  await db.query("select public.test_submit(8,64,'plantio')");
  await assert.rejects(db.query("select public.test_submit(6,64,'muda')"), /desativadas/);
  // Reenvio idempotente de muda recebida antes da pausa.
  await db.query("select public.test_submit(5,64,'muda')");
  await actor(manager);
  await db.query('insert into public.tree_adoption_settings(city_id,seedlings_enabled) values(64,true) on conflict(city_id) do update set seedlings_enabled=excluded.seedlings_enabled');
  assert.equal((await db.query('select planting_enabled from public.tree_adoption_settings where city_id=64')).rows[0].planting_enabled, true);
  await actor(citizen);
  await db.query("select public.test_submit(6,64,'muda')");
  await db.query('reset role');
  await db.query("update public.tree_adoption_requests set status='em_analise' where id=1");
  assert.equal((await db.query('select count(*) from public.tree_adoption_requests')).rows[0].count, '6');
  assert.equal((await db.query('select status from public.tree_adoption_requests where id=1')).rows[0].status, 'em_analise');
  console.log('OK: controles independentes de plantio e mudas, migração preserva cidades existentes, ativação/pausa, leitura pública, permissões, isolamento por cidade e pedidos existentes.');
} finally {
  await db?.end();
  spawnSync(path.join(bin, 'pg_ctl.exe'), ['-D', cluster, 'stop', '-m', 'immediate', '-w'], { windowsHide: true, stdio: 'ignore' });
  server.kill();
}
