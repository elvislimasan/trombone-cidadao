// Regressao de RLS em PostgreSQL local descartavel; nunca conecta ao Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

const connection = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres' };
const owner = new pg.Client(connection);
await owner.connect();
const directory = (await owner.query('show data_directory')).rows[0].data_directory;
assert.equal(path.resolve(directory).toLowerCase(), path.resolve('.tmp/municipal-demand-pg').toLowerCase(), 'Use apenas o cluster descartavel deste projeto.');
const database = 'anon_map_test_' + Date.now();
await owner.query('create database ' + database);
const db = new pg.Client({ ...connection, database });
await db.connect();
const read = (name) => fs.readFile('supabase/migrations/' + name, 'utf8');
const [source270, source307, source320, correction] = await Promise.all([
  read('270_painel_gestao_prefeituras.sql'), read('307_solicitacoes_municipais_visibilidade.sql'),
  read('320_feed_anon_and_report_webp.sql'), read('340_mapa_broncas_acesso_anon.sql'),
]);
const functionStart = source270.indexOf('create or replace function public.pode_acessar_prefeitura(');
const municipalAccess = source270.slice(functionStart, source270.indexOf('$$;', functionStart) + 3);
const visibility = source307.slice(source307.indexOf('create policy reports_municipality_select_internal'), source307.indexOf('create or replace function public.set_municipal_report_publicity'));
const users = {
  author: '10000000-0000-0000-0000-000000000001', member: '10000000-0000-0000-0000-000000000002',
  stranger: '10000000-0000-0000-0000-000000000003', admin: '10000000-0000-0000-0000-000000000004',
  master: '10000000-0000-0000-0000-000000000005', inactive: '10000000-0000-0000-0000-000000000006',
};
const report = (n) => '40000000-0000-0000-0000-' + String(n).padStart(12, '0');
let passed = 0;
async function check(name, fn) { await fn(); passed++; console.log('OK', name); }
async function asUser(id, role = 'authenticated') {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
  await db.query('set role ' + role);
}
async function reports() { return (await db.query('select id from reports order by id')).rows.map((r) => r.id); }
async function media() { return (await db.query('select report_id from report_media order by report_id')).rows.map((r) => r.report_id); }

try {
  await db.query(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
    end $$;
    create schema auth; create schema storage;
    grant usage on schema public,auth to anon,authenticated;
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create function public.is_admin(u uuid) returns boolean language sql stable as $$ select u='${users.admin}'::uuid $$;
    create function public.is_master(u uuid) returns boolean language sql stable as $$ select u='${users.master}'::uuid $$;
    create table prefeituras(id uuid primary key,city_id bigint,status text);
    create table prefeitura_membros(prefeitura_id uuid,user_id uuid,ativo boolean);
    create table reports(id uuid primary key,is_public boolean not null,author_id uuid,city_id bigint,created_by_municipality uuid,moderation_status text);
    create table report_media(report_id uuid references reports(id));
    create table storage.buckets(id text primary key,allowed_mime_types text[]);
    alter table reports enable row level security;
    alter table report_media enable row level security;
    grant select on reports,report_media to anon,authenticated;
    create policy reports_read on reports for select using (moderation_status='approved' or author_id=auth.uid());
    create policy report_media_read on report_media for select using (true);
    insert into prefeituras values('20000000-0000-0000-0000-000000000001',1,'ativa');
    insert into prefeitura_membros values
      ('20000000-0000-0000-0000-000000000001','${users.member}',true),
      ('20000000-0000-0000-0000-000000000001','${users.inactive}',false);
    insert into reports values
      ('${report(1)}',true,'${users.author}',1,null,'approved'),
      ('${report(2)}',false,'${users.author}',1,'20000000-0000-0000-0000-000000000001','internal'),
      ('${report(3)}',false,'${users.author}',2,'20000000-0000-0000-0000-000000000002','internal'),
      ('${report(4)}',true,'${users.author}',1,null,'pending_approval');
    insert into report_media select id from reports;
    ${municipalAccess}
    revoke all on function public.pode_acessar_prefeitura(uuid,bigint) from public,anon;
    grant execute on function public.pode_acessar_prefeitura(uuid,bigint) to authenticated;
    ${visibility}
  `);
  await check('reproduz 42501 no acesso deslogado apos migration 307', async () => {
    await asUser(null, 'anon');
    await assert.rejects(reports(), { code: '42501', message: 'permission denied for function pode_acessar_prefeitura' });
  });
  await check('CASE da migration 320 ainda reproduz o erro', async () => {
    await db.query('reset role'); await db.query(source320);
    await asUser(null, 'anon');
    await assert.rejects(reports(), { code: '42501', message: 'permission denied for function pode_acessar_prefeitura' });
  });
  await check('migration corretiva pode ser reaplicada', async () => {
    await db.query('reset role'); await db.query(correction); await db.query(correction);
  });
  await check('visitante consulta somente broncas publicas aprovadas', async () => {
    await asUser(null, 'anon');
    assert.deepEqual(await reports(), [report(1)]);
    assert.equal((await db.query('select count(*)::int total from reports')).rows[0].total, 1);
    assert.deepEqual(await media(), [report(1), report(4)]);
    assert.equal((await db.query('select public.can_view_municipal_report_media($1) allowed', [report(2)])).rows[0].allowed, false);
    await assert.rejects(db.query('select public.pode_acessar_prefeitura(null,1)'), { code: '42501' });
  });
  await check('cidadao sem vinculo nao acessa solicitacoes internas nem suas midias', async () => {
    await asUser(users.stranger);
    assert.deepEqual(await reports(), [report(1)]);
    assert.deepEqual(await media(), [report(1), report(4)]);
  });
  await check('autor preserva acesso a suas solicitacoes e midias', async () => {
    await asUser(users.author);
    assert.deepEqual(await reports(), [report(1), report(2), report(3), report(4)]);
    assert.deepEqual(await media(), [report(1), report(2), report(3), report(4)]);
  });
  await check('equipe ativa acessa internos apenas de sua cidade', async () => {
    await asUser(users.member);
    assert.deepEqual(await reports(), [report(1), report(2)]);
    assert.deepEqual(await media(), [report(1), report(2), report(4)]);
  });
  await check('membro inativo nao recebe acesso interno', async () => {
    await asUser(users.inactive);
    assert.deepEqual(await reports(), [report(1)]);
    assert.deepEqual(await media(), [report(1), report(4)]);
  });
  await check('admin e master preservam a visibilidade concedida pelas demais politicas', async () => {
    await db.query('reset role');
    await db.query('create policy reports_admin_read on reports for select to authenticated using (public.is_admin(auth.uid()) or public.is_master(auth.uid()))');
    for (const user of [users.admin, users.master]) {
      await asUser(user);
      assert.deepEqual(await reports(), [report(1), report(2), report(3), report(4)]);
      assert.deepEqual(await media(), [report(1), report(2), report(3), report(4)]);
    }
  });
  await check('logout apos sessao municipal volta a mostrar somente publicas', async () => {
    await asUser(users.member); assert.deepEqual(await reports(), [report(1), report(2)]);
    await asUser(null, 'anon'); assert.deepEqual(await reports(), [report(1)]);
    assert.deepEqual(await media(), [report(1), report(4)]);
  });
  console.log(passed + ' verificacoes de PostgreSQL aprovadas.');
} finally {
  await db.end();
  try { await owner.query('drop database ' + database); }
  finally { await owner.end(); }
}
