// Banco PostgreSQL descartável em loopback; não lê .env nem acessa Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import pg from 'pg';

const bin = 'C:/Program Files/PostgreSQL/17/bin';
const root = path.resolve('.tmp', `electrician-sync-filter-${Date.now()}`);
const cluster = path.join(root, 'data');
await fs.mkdir(root, { recursive: true });
const init = spawnSync(path.join(bin, 'initdb.exe'), ['-D', cluster, '-U', 'electrician_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { windowsHide: true, encoding: 'utf8' });
await fs.writeFile(path.join(root, 'init.log'), `${init.stdout}\n${init.stderr}`);
assert.equal(init.status, 0, `initdb falhou: ${root}`);
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const server = spawn(path.join(bin, 'postgres.exe'), ['-D', cluster, '-h', '127.0.0.1', '-p', String(port), '-c', 'fsync=off'], { windowsHide: true, stdio: 'ignore' });
let db, checks = 0;
const pref = '20000000-0000-0000-0000-000000000001';
const worker = '10000000-0000-0000-0000-000000000001';
const other = '10000000-0000-0000-0000-000000000002';
const order = '30000000-0000-0000-0000-000000000001';
const report = '40000000-0000-0000-0000-000000000001';
const operation = '50000000-0000-0000-0000-000000000001';
const inspection = '50000000-0000-0000-0000-000000000002';
const sql = file => fs.readFile(`supabase/migrations/${file}`, 'utf8');
const install = async (file, name) => {
  const source = await sql(file);
  const definition = source.match(new RegExp(`create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$\\$;`, 'i'))?.[0];
  assert.ok(definition, name); await db.query(definition);
};
const actor = async id => { await db.query('reset role'); await db.query("select set_config('test.user',$1,false)", [id]); await db.query('set role authenticated'); };
const check = async (name, run) => { await run(); checks++; console.log('OK', name); };
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    const candidate = new pg.Client({ host: '127.0.0.1', port, user: 'electrician_test', database: 'postgres', connectionTimeoutMillis: 500 });
    try { await candidate.connect(); db = candidate; break; } catch { await candidate.end(); await new Promise(resolve => setTimeout(resolve, 100)); }
  }
  assert.ok(db, 'PostgreSQL não iniciou');
  await db.query("set timezone='UTC'");
  await db.query(`
    create role authenticated; create role anon; create schema auth; create schema extensions;
    create table auth.users(id uuid primary key);
    insert into auth.users values('${worker}'),('${other}');
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.user',true),'')::uuid$$;
    grant usage on schema auth,public,extensions to authenticated,anon;
    create domain extensions.geometry as point;
    create function extensions.st_y(extensions.geometry) returns float8 language sql immutable as $$select $1[1]$$;
    create function extensions.st_x(extensions.geometry) returns float8 language sql immutable as $$select $1[0]$$;
    create table prefeituras(id uuid primary key,city_id bigint,status text,categorias_habilitadas text[]);
    create table orgao_canais(id uuid primary key,city_id bigint,ativo boolean default true,canal_triagem boolean default false);
    create table orgao_membros(user_id uuid,canal_id uuid,ativo boolean default true,papel text default 'eletricista');
    create table orgao_categorias(canal_id uuid,city_id bigint,category_id text);
    create table poles(id bigint primary key,city_id bigint,identifier text,plate text,address text,latitude float8,longitude float8,
      lighting_status text,lamp_type text,lamp_power_w numeric,updated_at timestamptz,is_broken boolean default false);
    create table reports(id uuid primary key,city_id bigint,category_id text,title text,description text,protocol text,
      address text,neighborhood text,issue_type text,status text,moderation_status text default 'approved',is_public boolean default true,
      is_petition boolean default false,created_by_municipality uuid,created_at timestamptz default now(),location point,pole_id bigint,
      pole_number text,reported_post_identifier text,reported_plate text);
    create table demandas_municipais(id uuid primary key,prefeitura_id uuid,titulo text,descricao text,endereco text,bairro text,
      latitude float8,longitude float8,pole_id bigint,category_id text,prioridade text,status text,canal_id uuid,atribuido_a uuid,
      origem text,resultado text,registro_execucao text,service_type text,service_types text[] default '{}',
      executada_em timestamptz,concluida_em timestamptz,criado_por uuid,updated_by uuid,updated_at timestamptz,
      previsto_em timestamptz,prazo_em timestamptz,protocolo text,created_at timestamptz default now(),issue_type text,report_id uuid,
      revisao_pendente boolean default false,versao int default 1,executada_por uuid,execution_specialty text default 'eletricista');
    create table demanda_broncas(demanda_id uuid,report_id uuid,atendida_em timestamptz,atendida_por uuid,pole_id bigint,
      service_types text[] default '{}',resultado text,vinculado_por uuid);
    create table demanda_atendimentos(id uuid default gen_random_uuid(),demanda_id uuid,report_id uuid,atendida_em timestamptz,
      atendida_por uuid,pole_id bigint,service_types text[],resultado text,titulo text,bairro text,unique(demanda_id,report_id,atendida_em));
    create table demanda_eventos(demanda_id uuid,tipo text,detalhes jsonb,criado_por uuid);
    create table orgao_casos(report_id uuid,canal_id uuid,atribuido_a uuid,status text,prioridade text,prazo_em timestamptz,updated_at timestamptz);
    create table pole_lighting_changes(id bigserial,pole_id bigint,city_id bigint,pole_number text,address text,old_power_w numeric,
      new_power_w numeric,old_lamp_type text,new_lamp_type text,old_status text,new_status text,action text,changed_by uuid,descricao_servico text);
    create function public.pode_acessar_prefeitura(u uuid,c bigint) returns boolean language sql stable security definer as $$select u='${worker}'::uuid and c=64$$;
    create function public.eletricista_ativo_municipio(u uuid,c bigint) returns boolean language sql stable security definer as $$select public.pode_acessar_prefeitura(u,c)$$;
    create function public.pode_administrar_prefeitura(uuid,bigint) returns boolean language sql as $$select false$$;
    create function public.municipal_channel_action(u uuid,c uuid,a text) returns boolean language sql stable as $$select u='${worker}'::uuid and c='${pref}'::uuid and a='execute'$$;
    create function public.field_executor_can_work(uuid,uuid,text,text) returns boolean language sql as $$select false$$;
    create function public.pode_operar_demanda(u uuid,d uuid) returns boolean language sql stable security definer as $$select exists(select 1 from demandas_municipais where id=d and atribuido_a=u)$$;
    create function public.refresh_pole_broken_state(bigint) returns void language sql as $$select$$;
    create function public.salvar_demanda_municipal(uuid,uuid,jsonb,integer) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.resolver_ordem_eletricista(uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.atender_solicitacao_ordem_eletricista(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb) returns jsonb language sql as $$select '{}'::jsonb$$;
    create function public.concluir_ordem_eletricista(uuid,uuid,integer) returns jsonb language sql as $$select '{}'::jsonb$$;
    insert into prefeituras values('${pref}',64,'ativa','{iluminacao}');
    insert into orgao_canais values('${pref}',64,true,false);
    insert into orgao_membros values('${worker}','${pref}',true,'eletricista');
    insert into orgao_categorias values('${pref}',64,'iluminacao');
    insert into poles values(1,64,'X083935',null,'Rua A',-8,-38,'apagado','LED',50,'2026-01-01',false),
      (2,64,'S231058',null,'Rua B',-8,-38,'apagado','LED',50,'2026-01-01',false);
    insert into reports(id,city_id,category_id,title,status,pole_id) values('${report}',64,'iluminacao','Lâmpada apagada','pending',1);
    insert into demandas_municipais(id,prefeitura_id,titulo,category_id,prioridade,status,canal_id,atribuido_a)
      values('${order}','${pref}','Ordem existente','iluminacao','normal','em_andamento','${pref}','${worker}');
    insert into demanda_broncas(demanda_id,report_id) values('${order}','${report}');
    grant select,update on demandas_municipais to authenticated;
  `);
  await install('331_visita_poste_eletricista.sql', 'registrar_visita_poste_eletricista');
  await install('335_visita_poste_resolve_solicitacao.sql', 'registrar_visita_poste_eletricista_v2');
  await install('339_coerencia_fluxos_atendimento.sql', 'guardar_atendimento_solicitacao');
  await install('373_municipal_workflow_boundaries.sql', 'enforce_municipal_order_responsibility');
  await db.query(`create trigger guardar_atendimento_solicitacao after insert or update of atendida_em on demanda_broncas
    for each row execute function guardar_atendimento_solicitacao();
    create trigger zzzz_municipal_order_responsibility before insert or update on demandas_municipais
    for each row execute function enforce_municipal_order_responsibility();`);
  await db.query(await sql('409_electrician_offline_operations.sql'));
  const visitArgs = { p_prefeitura: pref, p_poste_id: 1, p_poste_atualizado_em: '2026-01-01', p_status: 'aceso',
    p_lamp_type: 'LED', p_power_w: 50, p_servicos: ['lamp_replacement'], p_descricao: 'Lâmpada trocada', p_report: report };
  const inspectionArgs = { ...visitArgs, p_poste_id: 2, p_status: 'apagado', p_servicos: [], p_report: null, p_descricao: '' };
  const sync = (id, args) => db.query("select sync_electrician_operation($1,'registrar_visita_poste_eletricista_v2',$2) result", [id, args]);
  await actor(worker);
  await check('reproduz as duas recusas mostradas na fila', async () => {
    await assert.rejects(sync(operation, visitArgs), /Executor só pode registrar/);
    await assert.rejects(sync(inspection, inspectionArgs), /Altere a situação/);
  });
  await db.query('reset role'); await db.query(await sql('435_electrician_visit_sync.sql')); await actor(worker);
  await check('reenvia o mesmo registro e conclui apenas a solicitação atendida', async () => {
    const result = (await sync(operation, visitArgs)).rows[0].result;
    assert.equal(result.response.status, 'concluida');
    await sync(operation, visitArgs);
    await db.query('reset role');
    assert.equal((await db.query('select count(*) from demanda_atendimentos')).rows[0].count, '1');
    assert.equal((await db.query('select count(*) from pole_lighting_changes')).rows[0].count, '1');
    assert.equal((await db.query('select status from reports where id=$1', [report])).rows[0].status, 'resolved');
    await actor(worker);
  });
  await check('vistoria sem alteração gera histórico uma vez e não cria reparo', async () => {
    const result = (await sync(inspection, inspectionArgs)).rows[0].result;
    assert.equal(result.response.vistoria, true); assert.equal(result.response.ordem_id, null);
    await sync(inspection, inspectionArgs); await db.query('reset role');
    assert.equal((await db.query('select count(*) from demandas_municipais')).rows[0].count, '1');
    assert.equal((await db.query('select count(*) from pole_lighting_changes where pole_id=2')).rows[0].count, '1');
    assert.equal((await db.query('select updated_at from poles where id=2')).rows[0].updated_at.toISOString(), '2026-01-01T00:00:00.000Z');
    await actor(worker);
  });
  await check('continua recusando alteração avulsa dos serviços e da programação', async () => {
    await assert.rejects(db.query("update demandas_municipais set service_types='{other}',service_type='other' where id=$1", [order]), /Executor só pode registrar/);
    await assert.rejects(db.query("update demandas_municipais set prazo_em=now() where id=$1", [order]), /Executor só pode registrar/);
    await assert.rejects(db.query("insert into demanda_atendimentos(demanda_id) values($1)", [order]), /permission denied/);
    await assert.rejects(sync('50000000-0000-0000-0000-000000000003', { ...inspectionArgs, p_poste_atualizado_em: '2025-01-01' }), { code: '40001' });
  });
  await db.query('reset role');
  await db.query(`alter table poles add column raw_properties jsonb default '{}',add column geom point;
    alter table pole_lighting_changes add column changed_at timestamptz default clock_timestamp();
    create function handle_updated_at() returns trigger language plpgsql as $$begin new.updated_at=clock_timestamp();return new;end$$;
    create trigger update_poles_updated_at before update on poles for each row execute function handle_updated_at();
    insert into pole_lighting_changes(pole_id,city_id,pole_number) values(2,64,'S-ANTIGO');
    create domain extensions.geography as point;`);
  await install('348_eletricista_ofertas_municipio_e_busca.sql', 'buscar_mapa_eletricista');
  await install('323_sugerir_postes_proximos_ordem_eletricista.sql', 'buscar_postes_ordem_eletricista');
  await db.query(await sql('437_pole_identifier_history.sql'));
  await check('recupera códigos antigos sem invalidar a versão offline', async () => {
    const p = (await db.query('select previous_identifiers,updated_at from poles where id=2')).rows[0];
    assert.deepEqual(p.previous_identifiers, ['S-ANTIGO']);
    assert.equal(p.updated_at.toISOString(), '2026-01-01T00:00:00.000Z');
  });
  await check('renumeração preserva ID, histórico, busca e visita pendente', async () => {
    await db.query("update poles set identifier='X-NOVO' where id=2");
    await db.query("update poles set identifier='X-FINAL' where id=2");
    const p = (await db.query('select id,previous_identifiers from poles where id=2')).rows[0];
    assert.equal(p.id, '2');
    assert.deepEqual(p.previous_identifiers, ['S-ANTIGO', 'S231058', 'X-NOVO']);
    assert.equal((await db.query('select count(*) from pole_lighting_changes where pole_id=2 and renumber_only')).rows[0].count, '2');
    await actor(worker);
    const found = (await db.query('select poste from buscar_mapa_eletricista($1,$2)', [pref, 'S231058'])).rows;
    assert.equal(found.length, 1); assert.equal(found[0].poste.identifier, 'X-FINAL');
    const foundOrder = (await db.query('select identifier from buscar_postes_ordem_eletricista($1,$2,$3)', [pref, order, 'S231058'])).rows;
    assert.equal(foundOrder[0].identifier, 'X-FINAL');
    const id = '50000000-0000-0000-0000-000000000011';
    assert.equal((await sync(id, inspectionArgs)).rows[0].result.response.vistoria, true);
    await sync(id, inspectionArgs); // O recibo continua idempotente.
    await db.query('reset role');
    assert.equal((await db.query('select count(*) from electrician_offline_operations where id=$1', [id])).rows[0].count, '1');
  });
  await check('mudança técnica após renumeração continua exigindo revisão', async () => {
    await db.query("update poles set lamp_power_w=75 where id=2");
    await actor(worker);
    await assert.rejects(sync('50000000-0000-0000-0000-000000000012', inspectionArgs), { code: '40001' });
    await db.query('reset role');
    await db.query("update poles set identifier='X-TECNICO',lamp_power_w=100 where id=2");
    await actor(worker);
    await assert.rejects(sync('50000000-0000-0000-0000-000000000013', inspectionArgs), { code: '40001' });
    await db.query('reset role');
    await db.query("update poles set lighting_status='removido' where id=2");
    await actor(worker);
    await assert.rejects(sync('50000000-0000-0000-0000-000000000014', inspectionArgs), /Poste ativo não encontrado/);
  });
  await actor(other);
  await check('outra conta não reenvia nem lê os recibos', async () => {
    assert.equal((await db.query('select electrician_offline_receipt($1) result', [operation])).rows[0].result, null);
    await assert.rejects(sync('50000000-0000-0000-0000-000000000004', inspectionArgs), { code: '42501' });
  });
  await db.query('reset role');
  await db.query("select set_config('test.user','',false)");
  await install('350_electrician_panel_pagination.sql', 'listar_painel_eletricista');
  const internal = await sql('367_solicitacoes_internas_ofertas_eletricista.sql');
  await db.query(internal.slice(0, internal.indexOf('-- A prévia'))); // Inclui apenas a alteração da lista paginada.
  await db.query('commit');
  await db.query(await sql('436_electrician_service_filter.sql'));
  await db.query(`truncate reports,demanda_broncas,demandas_municipais;
    insert into reports(id,city_id,category_id,title,protocol,status,issue_type,created_at)
      select ('40000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid,64,'iluminacao','Serviço '||i,'FILTRO-'||i,'pending',
        case when i%2=0 then 'arm_damaged' else 'lamp_off' end,'2026-01-01'::timestamptz+i*interval '1 day' from generate_series(1,53) i;
    update reports set issue_type='arm_damaged' where protocol='FILTRO-53';
    update reports set is_public=false,moderation_status='internal',created_by_municipality='${pref}' where protocol='FILTRO-52';
    insert into reports(id,city_id,category_id,title,protocol,status,issue_type,is_public,moderation_status,created_by_municipality)
      values('40000000-0000-0000-0000-000000000054',64,'iluminacao','Interna de outra prefeitura','INDEVIDA','pending','arm_damaged',false,'internal','20000000-0000-0000-0000-000000000065');
    insert into demandas_municipais(id,prefeitura_id,titulo,category_id,prioridade,status,canal_id,service_type,service_types)
      values('${order}','${pref}','Ordem com dois serviços','iluminacao','normal','aberta','${pref}','arm_installation','{arm_installation,relay_replacement}');
    insert into demanda_broncas(demanda_id,report_id) values('${order}','40000000-0000-0000-0000-000000000053');
  `);
  const filter = async (type, page = 1, term = '') => (await db.query(`select listar_painel_eletricista_por_servico($1,'disponiveis','fazer',$2,'oldest',$3,20,'{}',$4) data`, [pref, term, page, type])).rows[0].data;
  await actor(worker);
  await check('filtra problema antes da paginação e inclui solicitações vinculadas', async () => {
    const first = await filter('problema:arm_damaged'); const second = await filter('problema:arm_damaged', 2);
    assert.equal(first.total, 27); assert.equal(first.items.length, 20); assert.equal(second.items.length, 7);
    assert.ok(first.items.some(item => item.id === order));
    assert.equal(new Set([...first.items, ...second.items].map(item => item.id)).size, 27);
  });
  await check('encontra serviço secundário e combina tipo com busca', async () => {
    const service = await filter('servico:relay_replacement');
    assert.equal(service.total, 1); assert.equal(service.items[0].id, order);
    const search = await filter('problema:arm_damaged', 99, 'FILTRO-52');
    assert.equal(search.page, 1); assert.equal(search.total, 1); assert.equal(search.items[0].protocolo, 'FILTRO-52');
    assert.equal((await filter('problema:exposed_wiring')).total, 0);
  });
  await check('mantém a consulta antiga e recusa acesso de outra conta', async () => {
    assert.equal((await filter('')).total, 53);
    const old = (await db.query("select listar_painel_eletricista($1,'disponiveis') data", [pref])).rows[0].data;
    assert.equal(old.total, 53);
    await actor(other); await assert.rejects(filter('problema:arm_damaged'), /Sem acesso/);
  });
  await db.query('reset role');
  await db.query(`create table tree_adoption_requests(id uuid primary key,author_id uuid not null,city_id bigint,
    request_type text,status text default 'solicitada',created_at timestamptz not null default clock_timestamp());
    create function submit_interval_test(p_id uuid,p_type text default 'muda') returns uuid
    language plpgsql security definer set search_path=public,pg_temp as $$begin
      if exists(select 1 from tree_adoption_requests where id=p_id and author_id=auth.uid()) then return p_id; end if;
      insert into tree_adoption_requests(id,author_id,city_id,request_type) values(p_id,auth.uid(),64,p_type);
      return p_id;
    end$$;`);
  await db.query(await sql('438_tree_adoption_request_interval.sql'));
  const request = '60000000-0000-0000-0000-000000000001';
  const nextRequest = '60000000-0000-0000-0000-000000000002';
  const submit = id => db.query('select submit_interval_test($1)', [id]);
  await actor(worker);
  await check('bloqueia novo pedido por 30 dias e preserva reenvio e edição', async () => {
    await submit(request); await submit(request);
    await assert.rejects(submit(nextRequest), error => error.code === '23514' && /1 pedido a cada 30 dias/.test(error.message));
    await db.query('reset role');
    for (const status of ['solicitada', 'concluida', 'recusada', 'cancelada']) {
      await db.query('update tree_adoption_requests set status=$1 where id=$2', [status, request]);
      await actor(worker);
      await assert.rejects(submit(nextRequest), { code: '23514' });
      await db.query('reset role');
    }
    await db.query("update tree_adoption_requests set created_at=clock_timestamp()-interval '719 hours' where id=$1", [request]);
    await actor(worker); await assert.rejects(submit(nextRequest), { code: '23514' });
    await db.query('reset role');
    await db.query("update tree_adoption_requests set created_at=clock_timestamp()-interval '720 hours' where id=$1", [request]);
    await actor(worker); await submit(nextRequest);
    await assert.rejects(db.query("select submit_interval_test('60000000-0000-0000-0000-000000000003','plantio')"), { code: '23514' });
    await actor(other); await submit('60000000-0000-0000-0000-000000000004');
  });
  await check('envios simultâneos da mesma conta criam somente um pedido', async () => {
    const concurrent = '10000000-0000-0000-0000-000000000003';
    await actor(concurrent);
    const second = new pg.Client({ host: '127.0.0.1', port, user: 'electrician_test', database: 'postgres' });
    await second.connect();
    try {
      await second.query("select set_config('test.user',$1,false)", [concurrent]);
      await second.query('set role authenticated');
      await db.query('begin');
      await submit('60000000-0000-0000-0000-000000000005');
      const waiting = second.query("select submit_interval_test('60000000-0000-0000-0000-000000000006')");
      const rejected = assert.rejects(waiting, { code: '23514' });
      await db.query('commit'); await rejected;
      await db.query('reset role');
      assert.equal((await db.query('select count(*) from tree_adoption_requests where author_id=$1', [concurrent])).rows[0].count, '1');
    } finally { await second.end(); }
  });
  console.log(`${checks} cenários aprovados: bloqueios reproduzidos, reenvio, recibos, vistorias, permissões e filtro paginado.`);
} finally {
  await db?.end();
  const stopped = spawnSync(path.join(bin, 'pg_ctl.exe'), ['-D', cluster, '-m', 'fast', 'stop'], { windowsHide: true, encoding: 'utf8' });
  if (stopped.status !== 0) server.kill();
}
