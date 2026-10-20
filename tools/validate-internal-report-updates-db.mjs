// Uses only the existing disposable PostgreSQL cluster inside this workspace.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

const connection = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres', connectionTimeoutMillis: 5000 };
const owner = new pg.Client(connection);
await owner.connect();
assert.equal(path.resolve((await owner.query('show data_directory')).rows[0].data_directory).toLowerCase(), path.resolve('.tmp/municipal-demand-pg').toLowerCase());
const database = 'internal_report_updates_' + Date.now();
await owner.query('create database ' + database);
const db = new pg.Client({ ...connection, database });
await db.connect();
const uid = (n) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const pref = uid(10), otherPref = uid(11), channel = uid(20), otherChannel = uid(21);
const internal = uid(30), publicReport = uid(31), linked = uid(32), legacyLinked = uid(33), foreign = uid(34), wrongOrigin = uid(35);
let passed = 0;
async function check(name, action) { await action(); passed++; console.log('OK', name); }
async function asUser(id, role = 'authenticated') {
  await db.query('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
  await db.query('set role ' + role);
}
const call = (report, status = 'em_andamento', message = 'Atendimento registrado.', canal = channel, prefeitura = pref) =>
  db.query('select public.atualizar_bronca_prefeitura($1,$2,$3,$4,$5)', [prefeitura, report, status, message, canal]);
const state = async (id) => {
  await db.query('reset role');
  return (await db.query('select status,is_public,moderation_status from reports where id=$1', [id])).rows[0];
};
function functionFrom(source, name) {
  const start = source.indexOf('create or replace function public.' + name + '(');
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('$$;', start) + 3);
}
try {
  await db.query(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    end $$;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to authenticated,anon;
    create table prefeituras(id uuid primary key,city_id bigint,status text);
    create table prefeitura_membros(prefeitura_id uuid,user_id uuid,papel text,ativo boolean default true);
    create table orgao_canais(id uuid primary key,city_id bigint,nome text,ativo boolean default true,canal_triagem boolean default false);
    create table orgao_membros(canal_id uuid,user_id uuid,papel text,ativo boolean default true);
    create table reports(id uuid primary key,city_id bigint,created_by_municipality uuid,author_id uuid,is_public boolean default true,
      moderation_status text default 'approved',status text default 'pending',is_petition boolean default false,title text,address text,
      check(is_public or (created_by_municipality is not null and moderation_status='internal')));
    create table demandas_municipais(id uuid primary key,report_id uuid);
    create table demanda_broncas(demanda_id uuid,report_id uuid);
    create table report_official_steps(id bigint generated always as identity primary key,report_id uuid references reports(id),etapa text,orgao text,
      observacao text,registrado_por uuid,registrado_por_papel text,ocorreu_em timestamptz default now());
    create table notifications(user_id uuid,type text,title text,message text,link text,report_id uuid,is_read boolean,created_at timestamptz);
    create function public.is_admin(uuid) returns boolean language sql stable as $$ select false $$;
    create function public.is_master(uuid) returns boolean language sql stable as $$ select false $$;
    create function public.pode_acessar_prefeitura(u uuid,c bigint) returns boolean language sql stable security definer as $$
      select exists(select 1 from prefeitura_membros m join prefeituras p on p.id=m.prefeitura_id where m.user_id=u and m.ativo and p.city_id=c and p.status='ativa') $$;
    create function public.pode_administrar_prefeitura(u uuid,c bigint) returns boolean language sql stable security definer as $$
      select exists(select 1 from prefeitura_membros m join prefeituras p on p.id=m.prefeitura_id where m.user_id=u and m.ativo and m.papel='administrador' and p.city_id=c and p.status='ativa') $$;
    create function public.report_participants(r uuid) returns table(user_id uuid) language sql stable security definer as $$
      select author_id from reports where id=r union select '${uid(6)}'::uuid $$;
    alter table report_official_steps enable row level security;
    create policy report_official_steps_public_select on report_official_steps for select to anon,authenticated using(registrado_por_papel is distinct from 'sistema');
    grant select on report_official_steps to anon,authenticated;
    insert into prefeituras values('${pref}',64,'ativa'),('${otherPref}',65,'ativa');
    insert into prefeitura_membros(prefeitura_id,user_id,papel) values
      ('${pref}','${uid(1)}','administrador'),('${pref}','${uid(2)}','colaborador'),('${pref}','${uid(3)}','colaborador'),
      ('${pref}','${uid(4)}','colaborador'),('${otherPref}','${uid(5)}','administrador');
    insert into orgao_canais values('${channel}',64,'Iluminação',true,true),('${otherChannel}',65,'Outra cidade',true,true);
    insert into orgao_membros(canal_id,user_id,papel) values('${channel}','${uid(2)}','operador'),('${channel}','${uid(3)}','leitura'),('${channel}','${uid(4)}','eletricista');
    insert into reports(id,city_id,author_id,created_by_municipality,is_public,moderation_status) values
      ('${internal}',64,'${uid(1)}','${pref}',false,'internal'),('${publicReport}',64,'${uid(6)}',null,true,'approved'),
      ('${linked}',64,'${uid(1)}','${pref}',false,'internal'),('${legacyLinked}',64,'${uid(1)}','${pref}',false,'internal'),
      ('${foreign}',65,'${uid(5)}','${otherPref}',false,'internal'),('${wrongOrigin}',64,'${uid(5)}','${otherPref}',false,'internal');
    insert into demanda_broncas values('${uid(40)}','${linked}');
    insert into demandas_municipais values('${uid(41)}','${legacyLinked}');
  `);
  await db.query(await fs.readFile('supabase/migrations/223_etapa_oficial_em_lote_nao_vira_enxurrada.sql', 'utf8'));
  await db.query(functionFrom(await fs.readFile('supabase/migrations/307_solicitacoes_municipais_visibilidade.sql', 'utf8'), 'can_view_municipal_report_media'));
  await db.query(await fs.readFile('supabase/migrations/302_atualizacao_direta_bronca.sql', 'utf8'));
  await check('reproduz o bloqueio original das solicitações internas', async () => {
    await asUser(uid(1));
    await assert.rejects(call(internal), /indisponível/);
  });
  await db.query('reset role');
  const migration = await fs.readFile('supabase/migrations/365_atualizacao_direta_solicitacao_interna.sql', 'utf8');
  await db.query(migration);
  await db.query(migration);
  const optionalNoteMigration = await fs.readFile('supabase/migrations/366_registro_interno_opcional.sql', 'utf8');
  await db.query(optionalNoteMigration);
  await db.query(optionalNoteMigration);
  await check('registra recebimento interno com histórico e sem criar ordem ou notificação pública', async () => {
    await asUser(uid(1)); await call(internal, 'recebida', '   ');
    assert.deepEqual(await state(internal), { status: 'pending', is_public: false, moderation_status: 'internal' });
    assert.equal((await db.query('select count(*)::int n from report_official_steps where report_id=$1', [internal])).rows[0].n, 1);
    assert.equal((await db.query('select observacao from report_official_steps where report_id=$1', [internal])).rows[0].observacao, null);
    assert.equal((await db.query('select count(*)::int n from notifications where report_id=$1', [internal])).rows[0].n, 0);
    assert.equal((await db.query('select count(*)::int n from demanda_broncas where report_id=$1', [internal])).rows[0].n, 0);
  });
  await check('operador inicia e resolve a solicitação interna sem confirmação pública', async () => {
    await asUser(uid(2)); await call(internal, 'em_andamento', 'OK');
    assert.equal((await state(internal)).status, 'in-progress');
    await asUser(uid(2)); await assert.rejects(call(internal, 'resolvida', 'x'.repeat(4001)), /4000 caracteres/);
    await call(internal, 'resolvida', null);
    assert.deepEqual(await state(internal), { status: 'resolved', is_public: false, moderation_status: 'internal' });
  });
  await check('solicitação pública mantém confirmação da resolução e notificações existentes', async () => {
    await asUser(uid(1)); await call(publicReport, 'em_andamento');
    assert.equal((await state(publicReport)).status, 'in-progress');
    await asUser(uid(1)); await call(publicReport, 'resolvida');
    assert.deepEqual(await state(publicReport), { status: 'pending_resolution', is_public: true, moderation_status: 'approved' });
    assert.ok((await db.query('select count(*)::int n from notifications where report_id=$1', [publicReport])).rows[0].n > 0);
  });
  await check('histórico interno fica oculto para anônimo e cidadão, disponível para a prefeitura', async () => {
    for (const [user, role] of [[null, 'anon'], [uid(6), 'authenticated'], [uid(5), 'authenticated']]) {
      await asUser(user, role);
      assert.equal((await db.query('select count(*)::int n from report_official_steps where report_id=$1', [internal])).rows[0].n, 0);
    }
    await asUser(uid(3));
    assert.equal((await db.query('select count(*)::int n from report_official_steps where report_id=$1', [internal])).rows[0].n, 3);
    await asUser(null, 'anon');
    assert.equal((await db.query('select count(*)::int n from report_official_steps where report_id=$1', [publicReport])).rows[0].n, 2);
  });
  await check('bloqueia leitura, eletricista sem função de gestão, outra prefeitura e anônimo', async () => {
    for (const user of [uid(3), uid(4), uid(5), uid(6)]) {
      await asUser(user); await assert.rejects(call(publicReport), /Sem permissão|Sem acesso/);
    }
    await asUser(null, 'anon'); await assert.rejects(call(publicReport), /permission denied/);
  });
  await check('bloqueia vínculos normais e legados, município incorreto e origem municipal incorreta', async () => {
    await asUser(uid(1));
    for (const id of [linked, legacyLinked]) await assert.rejects(call(id), /ordem de serviço/);
    for (const id of [foreign, wrongOrigin]) await assert.rejects(call(id), /indisponível/);
    await assert.rejects(call(internal), /não está aberta/);
  });
  await check('rejeita situação nula ou inválida e mensagens fora do limite', async () => {
    await asUser(uid(1));
    for (const status of [null, 'inexistente']) await assert.rejects(call(publicReport, status), /Situação inválida/);
    for (const message of [null, '', '   ', 'abcd', 'x'.repeat(4001)]) await assert.rejects(call(publicReport, 'recebida', message), /5 a 4000/);
    await assert.rejects(call(publicReport, 'recebida', 'Mensagem válida.', otherChannel), /Sem permissão/);
  });
  console.log(passed + ' verificações SQL passaram.');
} finally {
  await db.end();
  await owner.query('drop database ' + database);
  await owner.end();
}
