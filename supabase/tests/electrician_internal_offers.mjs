// Runs real RPC definitions and migration 367 in a disposable local database.
// Start the project's local validation PostgreSQL on 127.0.0.1:55439 first.
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';
const config = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres' };
const owner = new pg.Client(config);
await owner.connect();
const name = `electrician_internal_test_${Date.now()}`;
await owner.query(`create database ${name}`);
const db = new pg.Client({ ...config, database: name });
await db.connect();
const migration = await fs.readFile('supabase/migrations/367_solicitacoes_internas_ofertas_eletricista.sql', 'utf8');
async function install(file, functionName) {
  const sql = await fs.readFile(`supabase/migrations/${file}`, 'utf8');
  const definition = sql.match(new RegExp(`create(?: or replace)? function public\\.${functionName}\\([\\s\\S]*?\\$\\$;`, 'i'))?.[0];
  assert.ok(definition, functionName);
  await db.query(definition);
}
const pref = '00000000-0000-0000-0000-000000000064';
const otherPref = '00000000-0000-0000-0000-000000000065';
const person = '00000000-0000-0000-0000-000000000101';
const colleague = '00000000-0000-0000-0000-000000000102';
const outsider = '00000000-0000-0000-0000-000000000103';
const reportId = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const actor = async (id) => db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']);
const panel = async () => (await db.query("select public.listar_painel_eletricista($1,'disponiveis') data", [pref])).rows[0].data;
const offers = async () => (await db.query('select id from public.listar_ofertas_eletricista($1)', [pref])).rows.map((r) => r.id);
const search = async (n) => (await db.query('select protocolo from public.buscar_mapa_eletricista($1,$2)', [pref, `TEST-${n}`])).rows;
const accept = async (n) => (await db.query("select public.aceitar_oferta_eletricista($1,'solicitacao',$2) id", [pref, reportId(n)])).rows[0].id;
try {
  await db.query(`
    create schema auth; create schema extensions;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    -- PostGIS is unnecessary for visibility/authorization; retain real point coordinates.
    create domain extensions.geometry as point; create domain extensions.geography as point;
    create function extensions.st_y(extensions.geometry) returns float8 language sql immutable as $$ select $1[1] $$;
    create function extensions.st_x(extensions.geometry) returns float8 language sql immutable as $$ select $1[0] $$;
    create function extensions.st_makepoint(float8,float8) returns point language sql immutable as $$ select point($1,$2) $$;
    create function extensions.st_setsrid(point,integer) returns point language sql immutable as $$ select $1 $$;
    create function extensions.st_distance(extensions.geography,extensions.geography) returns float8 language sql immutable as $$ select $1 <-> $2 $$;
    create table prefeituras(id uuid primary key,city_id bigint,status text default 'ativa',categorias_habilitadas text[] default '{iluminacao}');
    create table orgao_canais(id uuid primary key,city_id bigint,ativo boolean default true,canal_triagem boolean default false,nome text);
    create table orgao_membros(user_id uuid,canal_id uuid,ativo boolean default true,papel text);
    create table orgao_categorias(canal_id uuid,city_id bigint,category_id text);
    create table reports(id uuid primary key,protocol text,title text,description text,address text,neighborhood text,issue_type text default 'other',created_at timestamptz default now(),location point default point(-38,-8),pole_id bigint default 1,city_id bigint default 64,category_id text default 'iluminacao',status text default 'pending',is_public boolean default false,moderation_status text default 'internal',is_petition boolean default false,created_by_municipality uuid,author_id uuid,pole_number text,reported_post_identifier text,reported_plate text);
    create table poles(id bigint primary key,city_id bigint,lighting_status text,identifier text,plate text,address text,latitude float8,longitude float8);
    create table orgao_casos(report_id uuid,canal_id uuid,atribuido_a uuid,status text,prioridade text,prazo_em timestamptz,protocolo text,updated_at timestamptz);
    create table demandas_municipais(id uuid primary key default gen_random_uuid(),prefeitura_id uuid,category_id text,atribuido_a uuid,status text,canal_id uuid,report_id uuid,titulo text,descricao text,endereco text,bairro text,issue_type text,prioridade text,prazo_em timestamptz,created_at timestamptz default now(),latitude float8,longitude float8,pole_id bigint,revisao_pendente boolean default false,previsto_em timestamptz,updated_by uuid,origem text,criado_por uuid,protocolo text);
    create table demanda_broncas(demanda_id uuid,report_id uuid unique,vinculado_por uuid);
    create table demanda_eventos(demanda_id uuid,tipo text,detalhes jsonb,criado_por uuid);
    create table prefeitura_servico_regras(prefeitura_id uuid,category_id text,prioridade text,atendimento_horas integer);
    create function public.pode_acessar_prefeitura(p_user uuid,p_city bigint) returns boolean language sql stable security definer as $$ select exists(select 1 from orgao_membros m join orgao_canais c on c.id=m.canal_id where m.user_id=p_user and m.ativo and c.ativo and c.city_id=p_city) $$;
    create function public.publicar_estado_demanda(uuid,uuid,text) returns void language sql as $$ update reports set status='in-progress' where id=$2 and status='pending' $$;
    insert into prefeituras(id,city_id) values('${pref}',64),('${otherPref}',65);
    insert into orgao_canais(id,city_id) values('${pref}',64),('${otherPref}',65);
    insert into orgao_categorias values('${pref}',64,'iluminacao'),('${otherPref}',65,'iluminacao');
    insert into orgao_membros(user_id,canal_id,papel) values('${person}','${pref}','eletricista'),('${colleague}','${pref}','eletricista'),('${outsider}','${otherPref}','eletricista');
    insert into poles values(1,64,'aceso','POSTE-1',null,'Rua do teste',-8,-38);
  `);
  await install('348_eletricista_ofertas_municipio_e_busca.sql', 'eletricista_ativo_municipio');
  await install('319_painel_eletricista_ofertas.sql', 'listar_ofertas_eletricista');
  await install('319_painel_eletricista_ofertas.sql', 'aceitar_oferta_eletricista');
  const amendments = await fs.readFile('supabase/migrations/333_atendimento_individual_solicitacoes_eletricista.sql', 'utf8');
  await db.query(amendments.match(/do \$migration\$[\s\S]*?end \$migration\$;/i)[0]);
  await install('350_electrician_panel_pagination.sql', 'listar_painel_eletricista');
  await install('348_eletricista_ofertas_municipio_e_busca.sql', 'buscar_mapa_eletricista');
  // Include public approved, foreign municipality, closed, rejected, petition,
  // malformed private, assigned, already linked, other category and other city.
  for (let n = 1; n <= 13; n++) await db.query('insert into reports(id,protocol,title,description,created_by_municipality) values($1,$2,$3,$4,$5)', [reportId(n), `TEST-${n}`, `Poste ${n}`, 'Troca de vapor de sódio para LED', pref]);
  await db.query(`
    update reports set is_public=true,moderation_status='approved',created_by_municipality=null where protocol='TEST-2';
    update reports set created_by_municipality='${otherPref}' where protocol='TEST-3';
    update reports set status='resolved' where protocol='TEST-4';
    update reports set moderation_status='rejected' where protocol='TEST-5';
    update reports set is_petition=true where protocol='TEST-6';
    update reports set created_by_municipality=null,moderation_status=null where protocol='TEST-7';
    insert into orgao_casos(report_id,canal_id,atribuido_a,status) values('${reportId(8)}','${pref}','${colleague}','atribuida');
    insert into demandas_municipais(id,prefeitura_id,report_id,category_id,atribuido_a,status) values('${reportId(90)}','${pref}','${reportId(9)}','iluminacao','${colleague}','em_andamento');
    insert into demanda_broncas values('${reportId(90)}','${reportId(9)}','${colleague}');
    update reports set category_id='outro' where protocol='TEST-10';
    update reports set city_id=65,created_by_municipality='${otherPref}' where protocol='TEST-11';
    update reports set moderation_status='pending_approval' where protocol='TEST-12';
    update reports set status='in-progress' where protocol='TEST-13';
  `);
  await actor(person);
  assert.deepEqual(await offers(), [reportId(2)]);
  await db.query(migration);
  await db.query(migration); // Safe reapplication; privileges remain intact.
  assert.deepEqual(new Set(await offers()), new Set([1,2,13].map(reportId)));
  assert.deepEqual(new Set((await panel()).items.map((r) => r.id)), new Set([1,2,13].map(reportId)));
  assert.equal((await panel()).total, 3);
  assert.equal((await search(1))[0].protocolo, 'TEST-1');
  assert.equal((await search(3)).length, 0);
  for (const n of [3,4,5,6,7,8,9,10,11,12]) await assert.rejects(accept(n));
  const order = await accept(1);
  assert.equal(await accept(1), order, 'Repeated acceptance must return the same order');
  const row = (await db.query('select * from demandas_municipais where id=$1', [order])).rows[0];
  assert.equal(row.atribuido_a, person);
  assert.equal(row.status, 'em_andamento');
  assert.equal(row.descricao, 'Troca de vapor de sódio para LED');
  assert.equal((await offers()).includes(reportId(1)), false);
  assert.equal((await panel()).items.some((r) => r.id === reportId(1)), false);
  const report = (await db.query('select is_public,moderation_status from reports where id=$1', [reportId(1)])).rows[0];
  assert.deepEqual(report, { is_public: false, moderation_status: 'internal' });
  await actor(colleague);
  await assert.rejects(accept(1));
  await actor(outsider);
  await assert.rejects(panel()); await assert.rejects(offers()); await assert.rejects(search(1)); await assert.rejects(accept(13));
  await actor(null);
  await assert.rejects(panel()); await assert.rejects(offers()); await assert.rejects(search(1)); await assert.rejects(accept(13));
  await actor(person);
  await db.query("update orgao_membros set ativo=false where user_id=$1", [person]);
  await assert.rejects(panel()); await assert.rejects(offers()); await assert.rejects(accept(13));
  // Exercise the existing restrictive privacy policy against a permissive
  // legacy SELECT policy, as in the application database.
  await db.query(`
    create function public.is_admin(uuid) returns boolean language sql as $$ select false $$;
    create function public.is_master(uuid) returns boolean language sql as $$ select false $$;
    alter table reports enable row level security;
    create policy legacy_report_select on reports for select using(true);
    grant usage on schema public,auth to anon,authenticated;
    grant select on reports to anon,authenticated;
  `);
  const visibilitySql = await fs.readFile('supabase/migrations/307_solicitacoes_municipais_visibilidade.sql', 'utf8');
  await db.query(visibilitySql.match(/create policy reports_hide_internal_municipal[\s\S]*?;/)[0]);
  await actor(null);
  await db.query('set role anon');
  assert.deepEqual((await db.query('select id from reports')).rows.map((r) => r.id), [reportId(2)]);
  await db.query('reset role');
  await actor(outsider);
  await db.query('set role authenticated');
  assert.equal((await db.query('select id from reports where id=$1', [reportId(1)])).rowCount, 0);
  await db.query('reset role');
  console.log('OK: private/public offers, paginated list, map search, private acceptance, idempotency, duplicate prevention, foreign/inactive/anonymous access and invalid requests.');
} finally {
  await db.end();
  await owner.query(`drop database ${name}`);
  await owner.end();
}
