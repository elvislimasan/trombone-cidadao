// Ensaia somente em PostgreSQL local descartável; não conecta ao Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

const connection = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres' };
const owner = new pg.Client(connection);
await owner.connect();
assert.equal(path.resolve((await owner.query('show data_directory')).rows[0].data_directory).toLowerCase(),
  path.resolve('.tmp/municipal-demand-pg').toLowerCase());
const database = 'pr8_migration_upgrade_' + Date.now();
await owner.query('create database ' + database);
const db = new pg.Client({ ...connection, database });
await db.connect();
const sewage = await fs.readFile('supabase/migrations/273_sewage_issue_types.sql', 'utf8');
const contacts = await fs.readFile('supabase/migrations/351_reaplicar_contatos_equipe_prefeitura.sql', 'utf8');
const constraint = async () => (await db.query(`
  select oid, convalidated, pg_get_constraintdef(oid) as definition
  from pg_constraint where conrelid='public.reports'::regclass
    and conname='reports_esgoto_issue_type_check'
`)).rows[0];

try {
  await db.query(`
    create schema extensions;
    create domain extensions.geometry as text;
    create domain extensions.geography as text;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    create table auth.users(id uuid primary key,email text);
    create table public.profiles(id uuid primary key,is_admin boolean,is_master boolean);
    create table public.reports(
      id uuid primary key default gen_random_uuid(),category_id text,issue_type text,location extensions.geometry,
      author_id uuid,origin text,signal_status text,title text,description text,city_id bigint,
      neighborhood text,pole_number text,reported_post_identifier text,reported_plate text,
      is_from_water_utility boolean,completed_by uuid,completed_at timestamptz,moderation_status text
    );
    create table public.orgao_canais(id uuid primary key,city_id bigint);
    create table public.orgao_membros(id uuid primary key,canal_id uuid,user_id uuid);
    create function public.pode_administrar_prefeitura(p_user uuid,p_city bigint)
      returns boolean language sql stable as
      $$ select p_user='11111111-1111-4111-8111-111111111111'::uuid and p_city=77 $$;
    insert into auth.users values
      ('11111111-1111-4111-8111-111111111111','admin@local'),
      ('22222222-2222-4222-8222-222222222222','outra-cidade@local');
    insert into orgao_canais values
      ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',77),
      ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',88);
    insert into orgao_membros values
      ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111'),
      ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222');
    insert into reports(id,category_id,issue_type) values
      ('99999999-9999-4999-8999-999999999999','esgoto','tipo_legado');
  `);

  await db.query(sewage);
  const fresh = await constraint();
  assert.equal(fresh.convalidated, false);
  assert.equal((await db.query('select count(*)::int as total from reports')).rows[0].total, 1);
  await db.query(sewage);
  assert.deepEqual(await constraint(), fresh);
  for (const type of ['sewer_clogged','sewer_box_broken','sewer_box_without_cover','sewer_cover_broken',null]) {
    await db.query('insert into reports(category_id,issue_type) values($1,$2)', ['esgoto',type]);
  }
  await db.query("insert into reports(category_id,issue_type) values('iluminacao','lamp_broken')");
  await assert.rejects(db.query("insert into reports(category_id,issue_type) values('esgoto','fora_catalogo')"),
    { code: '23514', constraint: 'reports_esgoto_issue_type_check' });
  console.log('OK instalação limpa, repetição, catálogo e preservação de dados legados (NOT VALID)');

  await db.query("delete from reports where issue_type='tipo_legado'; alter table reports validate constraint reports_esgoto_issue_type_check");
  const validated = await constraint();
  assert.equal(validated.convalidated, true);
  await db.query(sewage);
  assert.deepEqual(await constraint(), validated);
  console.log('OK reexecução preserva OID, definição e validação da constraint existente');

  await db.query(`
    alter table reports drop constraint reports_esgoto_issue_type_check;
    -- Restrição histórica criada pela antiga 272 da main.
    alter table reports add constraint reports_esgoto_issue_type_check
      check(category_id <> 'esgoto' or issue_type is null or issue_type in
        ('sewer_clogged','sewer_box_broken','sewer_box_without_cover','sewer_cover_broken')) not valid;
    create schema supabase_migrations;
    create table supabase_migrations.schema_migrations(version text primary key,name text);
    insert into supabase_migrations.schema_migrations values('272','sewage_issue_types');
  `);
  const old = await constraint();
  await db.query(sewage);
  assert.deepEqual(await constraint(), old);
  assert.ok((await db.query("select to_regprocedure('public.complete_patrol_signal(uuid,text,text,double precision,double precision,double precision,double precision,bigint,text,text,text,boolean)') is not null as installed")).rows[0].installed);
  console.log('OK upgrade da antiga 272 para 273 sem erro 42710, incluindo instalação da RPC de patrulha');

  await db.query('alter table reports drop constraint reports_esgoto_issue_type_check; create table other_reports(value int constraint reports_esgoto_issue_type_check check(value>0))');
  await db.query(sewage);
  assert.ok(await constraint());
  console.log('OK constraint homônima em outra tabela não bloqueia a instalação');

  assert.equal((await db.query("select to_regprocedure('public.listar_emails_equipe_prefeitura()') is null as missing")).rows[0].missing, true);
  await db.query(contacts);
  await db.query(contacts);
  const allowed = await db.query(`select
    has_function_privilege('authenticated','public.listar_emails_equipe_prefeitura()','EXECUTE') as authenticated,
    has_function_privilege('anon','public.listar_emails_equipe_prefeitura()','EXECUTE') as anon`);
  assert.deepEqual(allowed.rows[0], { authenticated: true, anon: false });
  assert.deepEqual((await db.query('select * from listar_emails_equipe_prefeitura()')).rows, []);
  await db.query("select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false)");
  assert.deepEqual((await db.query('select * from listar_emails_equipe_prefeitura()')).rows,
    [{ membro_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', email: 'admin@local' }]);
  await db.query("select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false)");
  assert.deepEqual((await db.query('select * from listar_emails_equipe_prefeitura()')).rows, []);
  assert.deepEqual((await db.query('select * from supabase_migrations.schema_migrations')).rows,
    [{ version: '272', name: 'sewage_issue_types' }]);
  console.log('OK 351 instala contatos com 272 antiga, preserva histórico, grants e isolamento municipal');

  await db.query(await fs.readFile('supabase/migrations/272_contatos_equipe_prefeitura.sql','utf8'));
  const rpc = (await db.query("select 'public.listar_emails_equipe_prefeitura()'::regprocedure::oid as oid")).rows[0].oid;
  await db.query(contacts);
  assert.equal((await db.query("select 'public.listar_emails_equipe_prefeitura()'::regprocedure::oid as oid")).rows[0].oid,rpc);
  console.log('OK 351 também atende ambiente que já recebeu 272 de contatos');
} finally {
  await db.query('rollback');
  await db.end();
  await owner.query('drop database ' + database);
  await owner.end();
}
