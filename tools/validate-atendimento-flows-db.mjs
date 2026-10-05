// Valida os ciclos de atendimento em PostgreSQL local descartavel, sem Supabase.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import pg from 'pg';

const root = process.cwd();
const connection = { host: '127.0.0.1', port: 55439, user: 'codex_validation', database: 'postgres' };
const owner = new pg.Client(connection);
await owner.connect();
const directory = (await owner.query('show data_directory')).rows[0].data_directory;
assert.equal(path.resolve(directory).toLowerCase(), path.resolve(root, '.tmp/municipal-demand-pg').toLowerCase(), 'Use apenas o cluster descartável deste projeto.');
const database = 'municipal_flows_test_' + Date.now();
await owner.query('create database ' + database);
const db = new pg.Client({ ...connection, database });
await db.connect();
const source270 = await fs.readFile('supabase/migrations/270_painel_gestao_prefeituras.sql', 'utf8');
const source274 = await fs.readFile('supabase/migrations/274_demandas_municipais_iluminacao.sql', 'utf8');
const migration = await fs.readFile('supabase/migrations/275_fluxo_operacional_demandas.sql', 'utf8');
function table(name, source) {
  const start = source.indexOf('create table ' + (source.includes('create table if not exists public.' + name) ? 'if not exists ' : '') + 'public.' + name + ' (');
  assert.ok(start >= 0, name);
  return source.slice(start, source.indexOf('\n);', start) + 3);
}
function fn(name) {
  const start = source270.indexOf('create or replace function public.' + name + '(');
  assert.ok(start >= 0, name);
  return source270.slice(start, source270.indexOf('$$;', source270.indexOf('as $$', start)) + 3);
}
const ids = {
  admin: '10000000-0000-0000-0000-000000000001', operator: '10000000-0000-0000-0000-000000000002', reader: '10000000-0000-0000-0000-000000000003', other: '10000000-0000-0000-0000-000000000004', citizen: '10000000-0000-0000-0000-000000000005',
  pref: '20000000-0000-0000-0000-000000000001', otherPref: '20000000-0000-0000-0000-000000000002',
  channel: '30000000-0000-0000-0000-000000000001', otherChannel: '30000000-0000-0000-0000-000000000002', triage: '30000000-0000-0000-0000-000000000003',
  report: '40000000-0000-0000-0000-000000000001', secondReport: '40000000-0000-0000-0000-000000000002', foreignReport: '40000000-0000-0000-0000-000000000003',
  order: '50000000-0000-0000-0000-000000000001', secondOrder: '50000000-0000-0000-0000-000000000002',
};
async function asUser(id, role = 'authenticated') { await db.query('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id || '']); await db.query('set role ' + role); }
async function saved(id = ids.order, values = {}, options = {}) {
  const version = options.version ?? (await db.query('select versao from public.demandas_municipais where id=$1', [id])).rows[0]?.versao ?? null;
  const result = await db.query('select public.salvar_demanda_municipal($1,$2,$3,$4,$5,$6,$7,$8,$9) result', [ids.pref,id,JSON.stringify(values),version,options.reports || [],options.public || null,options.note || null,options.reason || null,JSON.stringify(options.files || [])]);
  return result.rows[0].result;
}
let passed = 0;
async function check(name, action) { await action(); passed++; console.log('OK', name); }
try {
  await db.query(`
    do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if; end $$;
    create schema auth; create schema storage;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public,storage to authenticated,anon,service_role;
    create table public.cities(id bigint primary key);
    create table public.profiles(id uuid primary key,name text,is_admin boolean default false,is_master boolean default false);
    create function public.is_admin(u uuid) returns boolean language sql stable as $$ select coalesce((select is_admin from public.profiles where id=u),false) $$;
    create function public.is_master(u uuid) returns boolean language sql stable as $$ select coalesce((select is_master from public.profiles where id=u),false) $$;
    create table public.categories(id text primary key,name text);
    create table public.orgao_canais(id uuid primary key,city_id bigint references public.cities(id),nome text,ativo boolean default true,canal_triagem boolean default false);
    create table public.orgao_categorias(city_id bigint,category_id text,canal_id uuid);
    create table public.poles(id bigint primary key,city_id bigint references public.cities(id),identifier text,plate text,address text,lighting_status text default 'nao_informado');
    create table public.reports(id uuid primary key,title text,description text,address text,neighborhood text,category_id text references public.categories(id),city_id bigint references public.cities(id),pole_id bigint references public.poles(id),status text default 'pending',moderation_status text default 'approved',is_petition boolean default false,author_id uuid references public.profiles(id),created_at timestamptz default now());
    create table public.report_updates(id uuid primary key default gen_random_uuid(),report_id uuid references public.reports(id),author_id uuid references public.profiles(id),update_type text,status text default 'pending',message text,created_at timestamptz default now());
    create table public.report_official_steps(id bigint generated always as identity primary key,report_id uuid references public.reports(id),etapa text,orgao text,protocolo text,observacao text,registrado_por uuid,registrado_por_papel text,ocorreu_em timestamptz default now());
    create table public.notifications(id bigint generated always as identity primary key,user_id uuid,type text,title text,message text,link text,report_id uuid,is_read boolean,created_at timestamptz);
    create table public.pole_lighting_changes(id bigint generated always as identity primary key,pole_id bigint,city_id bigint,pole_number text,address text,old_status text,new_status text,action text,changed_by uuid);
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
    alter table storage.objects enable row level security;
    create function public.report_participants(r uuid) returns table(user_id uuid) language sql stable security definer as $$ select author_id from public.reports where id=r and author_id is not null $$;
  `);
  await db.query([table('prefeituras',source270),table('prefeitura_membros',source270),table('orgao_membros',source270),table('orgao_casos',source270),table('orgao_caso_eventos',source270),table('orgao_respostas',source270),table('demandas_municipais',source274)].join('\n'));
  await db.query(['pode_acessar_prefeitura','pode_administrar_prefeitura','papel_no_orgao'].map(fn).join('\n'));
  await db.query('alter table public.demandas_municipais enable row level security; grant select,insert,update on public.demandas_municipais to authenticated; grant select on public.prefeituras,public.profiles,public.orgao_membros,public.orgao_canais,public.reports,public.orgao_respostas to authenticated; grant select,insert,delete on storage.objects to authenticated; grant select on storage.objects to anon;');

  // O fixture espacial usa pontos, sem PostGIS. Os testes abaixo validam estados,
  // autorização e histórico; não medem distâncias geográficas.
  await db.query(`
    create schema extensions;
    create domain extensions.geometry as point;
    create domain extensions.geography as point;
    create function extensions.st_x(extensions.geometry) returns double precision language sql immutable as $$ select ($1::point)[0] $$;
    create function extensions.st_y(extensions.geometry) returns double precision language sql immutable as $$ select ($1::point)[1] $$;
    create function extensions.st_makepoint(double precision,double precision) returns point language sql immutable as $$ select point($1,$2) $$;
    create function extensions.st_setsrid(point,integer) returns point language sql immutable as $$ select $1 $$;
    create function extensions.st_distance(extensions.geography,extensions.geography) returns double precision language sql immutable as $$ select $1::point <-> $2::point $$;
    create function extensions.distance_points(extensions.geography,extensions.geography) returns double precision language sql immutable as $$ select $1::point <-> $2::point $$;
    create operator extensions.<-> (leftarg=extensions.geography,rightarg=extensions.geography,function=extensions.distance_points);
    alter table reports add column location extensions.geometry, add column is_public boolean default true,
      add column protocol text, add column issue_type text, add column pole_number text,
      add column reported_post_identifier text, add column reported_plate text,
      add column created_by_municipality uuid references prefeituras(id);
    alter table poles add column latitude double precision,add column longitude double precision,
      add column geom extensions.geography,add column lamp_type text,add column lamp_power_w numeric,
      add column raw_properties jsonb default '{}',add column updated_at timestamptz default now(),add column is_broken boolean default false;
    alter table prefeituras add column categorias_habilitadas text[] default array['iluminacao','esgoto'];
    alter table pole_lighting_changes add column old_power_w numeric,add column new_power_w numeric,
      add column old_lamp_type text,add column new_lamp_type text,add column descricao_servico text;
    create function public.refresh_pole_broken_state(bigint) returns void language sql as $$
      update poles set is_broken=exists(select 1 from reports where pole_id=$1 and status<>'resolved') where id=$1 $$;
    insert into cities values(1),(2);
    insert into categories values('iluminacao','Iluminação'),('esgoto','Esgoto');
    insert into profiles(id,name) values('${ids.admin}','Gestão'),('${ids.operator}','Eletricista A'),('${ids.reader}','Eletricista B'),('${ids.other}','Outro município'),('${ids.citizen}','Cidadão');
    insert into prefeituras(id,city_id,nome) values('${ids.pref}',1,'Prefeitura um'),('${ids.otherPref}',2,'Prefeitura dois');
    insert into prefeitura_membros(prefeitura_id,user_id,papel) values('${ids.pref}','${ids.admin}','administrador'),('${ids.pref}','${ids.operator}','colaborador'),('${ids.pref}','${ids.reader}','colaborador'),('${ids.otherPref}','${ids.other}','administrador');
    insert into orgao_canais(id,city_id,nome,ativo,canal_triagem) values('${ids.channel}',1,'Iluminação',true,false),('${ids.otherChannel}',2,'Outra secretaria',true,false),('${ids.triage}',1,'Triagem',true,true);
    insert into orgao_categorias values(1,'iluminacao','${ids.channel}');
    insert into orgao_membros(canal_id,user_id,papel) values('${ids.channel}','${ids.operator}','operador'),('${ids.channel}','${ids.reader}','leitura');
    insert into reports(id,title,category_id,city_id,author_id,pole_id) values('${ids.report}','Poste apagado','iluminacao',1,'${ids.citizen}',null),('${ids.secondReport}','Relé queimado','iluminacao',1,'${ids.citizen}',null),('${ids.foreignReport}','Outra categoria','esgoto',1,'${ids.citizen}',null);
    insert into poles(id,city_id,identifier,address,lighting_status,lamp_type,lamp_power_w) values(1,1,'P001','Rua A','apagado','LED',50);
  `);
  await db.query(migration);
  await db.query('grant usage on schema extensions to authenticated; grant select,update on poles,reports to authenticated;');
  await db.query('alter table demandas_municipais add column issue_type text;');
  const source304 = await fs.readFile('supabase/migrations/304_eletricista_municipal.sql','utf8');
  const functionFrom = (source,name) => {
    const start=source.indexOf('create or replace function public.'+name+'(');
    assert.ok(start>=0,name); return source.slice(start,source.indexOf('$$;',start)+3);
  };
  await db.query(['pode_ver_demanda','pode_operar_demanda','validar_demanda_municipal','salvar_demanda_municipal'].map((name)=>functionFrom(source304,name)).join('\n'));
  await db.query("alter table orgao_membros drop constraint orgao_membros_papel_valido; alter table orgao_membros add constraint orgao_membros_papel_valido check(papel in ('gestor','operador','eletricista','leitura')); update orgao_membros set papel='eletricista';");
  const migrations = [280,316,319,322,323,325,326,327,330,331,332,333,334,335,337,338,339,342];
  const files=await fs.readdir('supabase/migrations');
  for(const number of migrations) {
    const file=files.find((name)=>name.startsWith(number+'_'));
    console.log('Migration',number);
    await db.query((await fs.readFile('supabase/migrations/'+file,'utf8')).replace(/\r\n/g,'\n'));
  }
  const currentVersion=async(id=ids.order)=>(await db.query('select versao from demandas_municipais where id=$1',[id])).rows[0]?.versao ?? -1;
  const orderForm={titulo:'Atendimento de iluminação',category_id:'iluminacao',canal_id:ids.channel,atribuido_a:ids.operator};
  const attend=async(report,services=['lamp_replacement'],result='Lâmpada substituída.')=> {
    const pole=(await db.query('select updated_at::text from poles where id=1')).rows[0];
    return (await db.query('select atender_solicitacao_ordem_eletricista($1,$2,$3,$4,1,$5,$6,$7) result',[
      ids.pref,ids.order,report,await currentVersion(),pole.updated_at,
      JSON.stringify({identifier:'P001',lamp_type:'LED',lamp_power_w:50,lamp_count:1,service_type:services[0],service_types:services,resultado:result}),'[]'
    ])).rows[0].result;
  };
  await check('previa mostra o mesmo poste antes e depois do aceite sem alterar o relato', async () => {
    await db.query('reset role');
    const report = (await db.query("insert into reports(id,title,category_id,city_id,author_id,location,pole_number) values(gen_random_uuid(),'Numero apagado','iluminacao',1,$1,point(-38,-8),'Numero apagado') returning id", [ids.citizen])).rows[0].id;
    await db.query("insert into poles(id,city_id,identifier,geom,lighting_status) values (2,1,'X070337',point(-38.001,-8),'apagado'),(3,1,'REMOVIDO',point(-38,-8),'removido'),(4,2,'OUTRA_CIDADE',point(-38,-8),'apagado')");
    await asUser(ids.operator);
    const preview = (await db.query('select poste_oferta_eletricista($1,$2,$3) result',[ids.pref,'solicitacao',report])).rows[0].result;
    assert.equal(preview.identifier,'X070337'); assert.equal(preview.nearby,true);
    assert.equal((await db.query('select pole_id from reports where id=$1',[report])).rows[0].pole_id,null);
    assert.equal((await db.query('select count(*)::int n from demandas_municipais')).rows[0].n,0);
    const order = (await db.query('select aceitar_oferta_eletricista($1,$2,$3) id',[ids.pref,'solicitacao',report])).rows[0].id;
    const linked = (await db.query('select * from solicitacoes_ordem_eletricista($1,$2)',[ids.pref,order])).rows[0];
    assert.equal(String(linked.pole_id),String(preview.pole_id));
    assert.equal((await db.query('select poste_oferta_eletricista($1,$2,$3) result',[ids.pref,'solicitacao',report])).rows[0].result,null);
    await asUser(null,'anon');
    await assert.rejects(db.query('select poste_oferta_eletricista($1,$2,$3)',[ids.pref,'solicitacao',report]),{code:'42501'});
    await asUser(ids.other);
    await assert.rejects(db.query('select poste_oferta_eletricista($1,$2,$3)',[ids.pref,'solicitacao',report]),/Sem acesso/);
    await db.query('reset role');
    await db.query('delete from demandas_municipais where id=$1',[order]);
    await db.query('delete from report_official_steps where report_id=$1',[report]);
    await db.query('delete from reports where id=$1',[report]);
    await db.query('delete from poles where id in (2,3,4)');
  });
  await check('previa de ordem vinculada respeita a solicitacao ativa mesmo com outra localizacao na ordem', async () => {
    await asUser(ids.admin);
    await db.query("update reports set location=point(-38,-8),pole_id=1 where id=$1",[ids.report]);
    await saved(ids.secondOrder,{...orderForm,atribuido_a:null,latitude:-7,longitude:-37},{reports:[ids.report]});
    await asUser(ids.operator);
    const preview=(await db.query('select poste_oferta_eletricista($1,$2,$3) result',[ids.pref,'ordem',ids.secondOrder])).rows[0].result;
    assert.equal(preview.identifier,'P001'); assert.equal(preview.nearby,false);
    await db.query('reset role');
    await db.query('delete from demandas_municipais where id=$1',[ids.secondOrder]);
    await db.query('delete from orgao_casos where report_id=$1',[ids.report]);
    await db.query("update reports set pole_id=null,location=null,status='pending' where id=$1",[ids.report]);
  });
  await asUser(ids.admin);
  await check('bloqueia categorias incompatíveis na gravação da ordem',async()=> {
    await assert.rejects(saved(ids.order,orderForm,{reports:[ids.report,ids.foreignReport]}),/só podem receber/);
    assert.equal((await db.query('select count(*)::int n from demandas_municipais')).rows[0].n,0);
    await saved(ids.order,{...orderForm,status:'em_andamento'},{reports:[ids.report,ids.secondReport]});
  });
  await check('eletricista não pode atender ordem de outro responsável',async()=> {
    await asUser(ids.reader); await assert.rejects(attend(ids.report),/não atribuída/);
  });
  await asUser(ids.operator);
  await check('versão antiga e conclusão com solicitação pendente são rejeitadas',async()=> {
    await assert.rejects(db.query('select concluir_ordem_eletricista($1,$2,$3)',[ids.pref,ids.order,-1]),{code:'40001'});
    await assert.rejects(db.query('select concluir_ordem_eletricista($1,$2,$3)',[ids.pref,ids.order,await currentVersion()]),/Atenda todas/);
    await assert.rejects(db.query('select registrar_resolucao_solicitacao_municipal($1,$2,$3,$4)',[ids.pref,ids.order,ids.report,await currentVersion()]),/Sem permissão/);
  });
  await check('atendimento parcial tem resultado público próprio e repetição idempotente',async()=> {
    assert.equal((await attend(ids.report)).status,'em_andamento');
    const first=(await db.query('select atendimento_publico_bronca($1) result',[ids.report])).rows[0].result;
    assert.equal(first.status,'concluida'); assert.equal(first.resultado,'Lâmpada substituída.');
    assert.equal(first.resolvida_pela_equipe,true);
    const pending=(await db.query('select atendimento_publico_bronca($1) result',[ids.secondReport])).rows[0].result;
    assert.equal(pending.resultado,null); assert.equal(pending.executada_em,null);
    assert.equal((await attend(ids.report)).repeated,true);
    assert.equal((await db.query('select count(*)::int n from demanda_atendimentos')).rows[0].n,1);
  });
  await check('redistribuição preserva os créditos e o resultado de cada executor',async()=> {
    await asUser(ids.admin); await saved(ids.order,{atribuido_a:ids.reader});
    await asUser(ids.reader); assert.equal((await attend(ids.secondReport,['relay_replacement'],'Relé substituído.')).status,'concluida');
    const mine=(await db.query('select * from atendimentos_eletricista_iluminacao($1)',[ids.pref])).rows;
    assert.equal(mine.length,1); assert.equal(mine[0].service_type,'relay_replacement');
    const ranks=(await db.query('select * from ranking_eletricistas_iluminacao($1)',[ids.pref])).rows;
    assert.equal(ranks.find((row)=>row.user_id===ids.operator).servicos,'1');
    assert.equal(ranks.find((row)=>row.user_id===ids.reader).servicos,'1');
    assert.equal((await db.query('select atendimento_publico_bronca($1) result',[ids.report])).rows[0].result.resultado,'Lâmpada substituída.');
  });
  await check('reabertura gera novo ciclo sem apagar serviços anteriores',async()=> {
    await asUser(ids.admin); await saved(ids.order,{status:'em_andamento'},{reason:'Nova vistoria solicitada.'});
    assert.ok((await db.query('select status from reports where id=any($1::uuid[])',[[ids.report,ids.secondReport]])).rows.every((row)=>row.status==='in-progress'));
    assert.ok((await db.query('select atendida_em from demanda_broncas')).rows.every((row)=>row.atendida_em===null));
    assert.equal((await db.query('select count(*)::int n from demanda_atendimentos')).rows[0].n,2);
    await asUser(ids.reader); assert.equal((await attend(ids.report)).status,'em_andamento');
    assert.equal((await db.query('select count(*)::int n from demanda_atendimentos')).rows[0].n,3);
  });
  await check('gestão registra resolução individual e conclui após a última',async()=> {
    await asUser(ids.admin);
    const result=(await db.query('select registrar_resolucao_solicitacao_municipal($1,$2,$3,$4,$5,$6) result',[
      ids.pref,ids.order,ids.secondReport,await currentVersion(),'Relé testado.', ['other']])).rows[0].result;
    assert.equal(result.status,'concluida');
  });
  await check('contestação limpa somente o vínculo reaberto e mantém histórico',async()=> {
    await db.query("update reports set status='pending' where id=$1",[ids.report]);
    assert.equal((await db.query('select atendida_em from demanda_broncas where report_id=$1',[ids.report])).rows[0].atendida_em,null);
    assert.ok((await db.query('select atendida_em from demanda_broncas where report_id=$1',[ids.secondReport])).rows[0].atendida_em);
    await saved(ids.order,{status:'em_andamento'},{reason:'Reavaliar apenas a solicitação contestada.'});
    assert.equal((await db.query('select status from reports where id=$1',[ids.secondReport])).rows[0].status,'resolved');
  });
  await check('ordem em execução sem responsável permanece disponível para aceite',async()=> {
    await saved(ids.secondOrder,{...orderForm,atribuido_a:null,status:'em_andamento'});
    await asUser(ids.operator);
    assert.ok((await db.query('select * from listar_ofertas_eletricista($1)',[ids.pref])).rows.some((row)=>row.id===ids.secondOrder));
    assert.equal((await db.query("select aceitar_oferta_eletricista($1,'ordem',$2) id",[ids.pref,ids.secondOrder])).rows[0].id,ids.secondOrder);
  });
  await check('solicitação resolvida externamente permite encerrar a ordem sem registrar novo serviço',async()=> {
    await asUser(ids.admin); await db.query("update reports set status='resolved' where id=$1",[ids.report]);
    await asUser(ids.reader);
    assert.equal((await db.query('select concluir_ordem_eletricista($1,$2,$3) result',[ids.pref,ids.order,await currentVersion()])).rows[0].result.status,'concluida');
  });
  await check('mapa exige serviço ao resolver solicitação',async()=> {
    await asUser(ids.admin); await saved(ids.order,{status:'em_andamento'},{reason:'Conferir funcionamento novamente.'});
    await db.query('update reports set pole_id=1 where id=$1',[ids.report]);
    await asUser(ids.reader);
    const pole=(await db.query('select updated_at::text from poles where id=1')).rows[0];
    await assert.rejects(db.query("select registrar_visita_poste_eletricista_v2($1,1,$2,'aceso','LED',50,'{}','',gen_random_uuid(),$3)",[ids.pref,pole.updated_at,ids.report]),/serviços válidos/);
  });
  console.log(passed+' verificações dos fluxos de atendimento aprovadas.');
} finally {
  await db.query('rollback').catch(()=>{});
  await db.end();
  try { await owner.query('drop database '+database); } finally { await owner.end(); }
}
