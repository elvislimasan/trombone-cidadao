// Executa a migration e os fluxos em um PostgreSQL local descartável, sem acessar Supabase.
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
const database = 'municipal_test_' + Date.now();
await owner.query('create database ' + database);
const db = new pg.Client({ ...connection, database });
await db.connect();
const source270 = await fs.readFile('supabase/migrations/270_painel_gestao_prefeituras.sql', 'utf8');
const source274 = await fs.readFile('supabase/migrations/274_demandas_municipais_iluminacao.sql', 'utf8');
const migration = await fs.readFile('supabase/migrations/275_fluxo_operacional_demandas.sql', 'utf8');
const deletionRepair = await fs.readFile('supabase/migrations/276_preservar_respostas_ao_excluir_demanda.sql', 'utf8');
const optionalResponsible = await fs.readFile('supabase/migrations/278_responsavel_opcional_na_ordem.sql', 'utf8');
const attachmentTypes = await fs.readFile('supabase/migrations/280_tipos_anexos_demanda.sql', 'utf8');
const quickCompletion = await fs.readFile('supabase/migrations/281_conclusao_rapida_demanda.sql', 'utf8');
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
  await db.query(`insert into cities values(1),(2); insert into categories values('iluminacao','Iluminação');
    insert into profiles(id,name) values('${ids.admin}','Administrador'),('${ids.operator}','Técnico'),('${ids.reader}','Leitura'),('${ids.other}','Outro município'),('${ids.citizen}','Cidadão');
    insert into prefeituras(id,city_id,nome) values('${ids.pref}',1,'Prefeitura um'),('${ids.otherPref}',2,'Prefeitura dois');
    insert into prefeitura_membros(prefeitura_id,user_id,papel) values('${ids.pref}','${ids.admin}','administrador'),('${ids.pref}','${ids.operator}','colaborador'),('${ids.pref}','${ids.reader}','colaborador'),('${ids.otherPref}','${ids.other}','administrador');
    insert into orgao_canais(id,city_id,nome,ativo,canal_triagem) values('${ids.channel}',1,'Iluminação',false,false),('${ids.otherChannel}',2,'Outra secretaria',true,false),('${ids.triage}',1,'Triagem',true,true);
    insert into orgao_membros(canal_id,user_id,papel) values('${ids.channel}','${ids.operator}','operador'),('${ids.channel}','${ids.reader}','leitura');
    insert into reports(id,title,category_id,city_id,author_id) values('${ids.report}','Poste apagado','iluminacao',1,'${ids.citizen}'),('${ids.secondReport}','Mesmo poste sem luz','iluminacao',1,'${ids.citizen}'),('${ids.foreignReport}','Outra cidade','iluminacao',2,'${ids.citizen}');
    insert into orgao_casos(report_id,canal_id) values('${ids.report}','${ids.channel}');
  `);
  await check('migration não transforma broncas ou fichas de triagem em ordens', async () => {
    await db.query(migration);
    assert.equal((await db.query('select count(*)::int n from demandas_municipais')).rows[0].n,0);
    const triggers = (await db.query("select tgname from pg_trigger where tgrelid='public.reports'::regclass and not tgisinternal")).rows.map((item) => item.tgname);
    assert.ok(!triggers.includes('z_receber_bronca_como_demanda'));
  });
  await asUser(ids.admin);
  await check('prazos configurados e registro interno independente', async () => {
    await db.query('select public.salvar_configuracao_atendimento($1,$2)', [ids.pref,JSON.stringify([{category_id:'iluminacao',canal_id:ids.channel,atendimento_horas:72,primeira_resposta_horas:24}])]);
    const result=await saved(ids.order,{titulo:'Trocar luminária',category_id:'iluminacao',canal_id:ids.channel,atribuido_a:ids.operator});
    assert.equal(result.status,'aberta');
    const row=(await db.query('select * from demandas_municipais where id=$1',[ids.order])).rows[0];
    assert.equal(row.report_id,null); assert.ok(row.prazo_em); assert.ok(row.primeira_resposta_prazo_em);
  });
  await check('vínculo explícito com duas broncas preserva os relatos', async () => {
    await saved(ids.order,{}, {reports:[ids.report,ids.secondReport]});
    assert.equal((await db.query('select count(*)::int n from demanda_broncas')).rows[0].n,2);
    assert.equal((await db.query('select count(*)::int n from reports')).rows[0].n,3);
  });
  await check('nota interna não aparece na resposta oficial', async () => {
    await saved(ids.order,{}, {note:'Contato interno restrito',public:'A equipe realizará uma vistoria.'});
    const publicInfo=(await db.query('select atendimento_publico_bronca($1) result',[ids.report])).rows[0].result;
    assert.ok(!JSON.stringify(publicInfo).includes('Contato interno'));
    assert.equal((await db.query("select count(*)::int n from orgao_respostas where mensagem='A equipe realizará uma vistoria.'")).rows[0].n,2);
  });
  await check('edição desatualizada não sobrescreve dados', async () => {
    const version=(await db.query('select versao from demandas_municipais where id=$1',[ids.order])).rows[0].versao;
    await saved(ids.order,{prioridade:'alta'});
    await assert.rejects(saved(ids.order,{prioridade:'baixa'},{version}), /alterada por outra pessoa/);
  });
  await check('conclusão exige comprovação e mantém a bronca em verificação', async () => {
    await assert.rejects(saved(ids.order,{status:'concluida',resultado:'Luminária substituída.'}), /Anexe evidência/);
    await saved(ids.order,{status:'concluida',resultado:'Luminária substituída.',registro_execucao:'Equipe conferiu o circuito e substituiu a luminária defeituosa.'});
    assert.equal((await db.query('select status from demandas_municipais where id=$1',[ids.order])).rows[0].status,'concluida');
    assert.equal((await db.query('select status from reports where id=$1',[ids.report])).rows[0].status,'pending_resolution');
  });
  await check('leitor e usuário de outro município não operam a ordem', async () => {
    await asUser(ids.reader); await assert.rejects(saved(ids.order,{titulo:'Alteração indevida'}), /Sem permissão/);
    await asUser(ids.other); assert.equal((await db.query('select * from demandas_municipais')).rows.length,0);
    await assert.rejects(saved(ids.order,{titulo:'Outra cidade'}), /Sem acesso/);
    await asUser(ids.admin);
  });
  await check('bronca de outra cidade e vínculo duplicado são recusados', async () => {
    await assert.rejects(saved(ids.order,{}, {reports:[ids.foreignReport]}), /desta cidade/);
    await assert.rejects(saved(ids.secondOrder,{titulo:'Ordem duplicada',canal_id:ids.channel},{reports:[ids.report]}), /outro atendimento/);
  });
  await check('contestação sinaliza revisão sem reabrir a ordem automaticamente', async () => {
    await db.query('reset role');
    await db.query('insert into report_updates(report_id,author_id,update_type,message) values($1,$2,$3,$4)', [ids.report,ids.citizen,'still_here','A luz continua apagada.']);
    const row=(await db.query('select status,revisao_pendente from demandas_municipais where id=$1',[ids.order])).rows[0];
    assert.equal(row.status,'concluida'); assert.equal(row.revisao_pendente,true);
    await asUser(ids.admin);
  });
  await check('reabertura exige motivo e preserva o status público', async () => {
    await assert.rejects(saved(ids.order,{status:'triagem'}), /motivo da reabertura/);
    await saved(ids.order,{status:'triagem'},{reason:'Retornar ao local para avaliar a contestação.'});
    assert.equal((await db.query('select status from reports where id=$1',[ids.report])).rows[0].status,'pending_resolution');
  });
  await check('reaplicação preserva registros e não duplica história', async () => {
    await db.query('reset role');
    const before=(await db.query('select count(*)::int n from demanda_eventos')).rows[0].n;
    await db.query(migration);
    assert.equal((await db.query('select count(*)::int n from demanda_eventos')).rows[0].n,before);
    assert.equal((await db.query('select count(*)::int n from demandas_municipais')).rows[0].n,1);
  });
  await check('correção permite excluir a ordem preservando broncas e respostas oficiais', async () => {
    // Reproduz a chave estrangeira da versão que bloqueava a exclusão.
    await db.query('alter table orgao_respostas drop constraint orgao_respostas_demanda_evento_id_fkey; alter table orgao_respostas add constraint orgao_respostas_demanda_evento_id_fkey foreign key(demanda_evento_id) references demanda_eventos(id);');
    await assert.rejects(db.query('delete from demandas_municipais where id=$1',[ids.order]), { code: '23503' });
    const responses=(await db.query('select id,mensagem from orgao_respostas order by id')).rows;
    const reports=(await db.query('select id,status from reports order by id')).rows;
    const steps=(await db.query('select count(*)::int n from report_official_steps')).rows[0].n;
    await db.query(deletionRepair);
    await db.query(deletionRepair);
    await db.query('delete from demandas_municipais where id=$1',[ids.order]);
    assert.equal((await db.query('select count(*)::int n from demanda_eventos')).rows[0].n,0);
    assert.equal((await db.query('select count(*)::int n from demanda_broncas')).rows[0].n,0);
    assert.deepEqual((await db.query('select id,mensagem from orgao_respostas order by id')).rows,responses);
    assert.equal((await db.query('select count(*)::int n from orgao_respostas where demanda_evento_id is not null')).rows[0].n,0);
    assert.deepEqual((await db.query('select id,status from reports order by id')).rows,reports);
    assert.equal((await db.query('select count(*)::int n from report_official_steps')).rows[0].n,steps);
  });
  await check('ordem programada e executada sem usuário responsável preserva permissões e comprovação', async () => {
    await db.query('reset role');
    const values = { titulo: 'Manutenção executada pela secretaria', canal_id: ids.channel, atribuido_a: null, status: 'programada', previsto_em: new Date(Date.now() + 86400000).toISOString() };
    await asUser(ids.admin);
    await assert.rejects(saved(ids.secondOrder, values), /responsável/);
    await db.query('reset role');
    const permissions = (await db.query("select proacl,prosecdef,proconfig from pg_proc where oid='salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure")).rows;
    await db.query(optionalResponsible); await db.query(optionalResponsible);
    assert.deepEqual((await db.query("select proacl,prosecdef,proconfig from pg_proc where oid='salvar_demanda_municipal(uuid,uuid,jsonb,integer,uuid[],text,text,text,jsonb)'::regprocedure")).rows, permissions);
    await asUser(ids.admin);
    assert.equal((await saved(ids.secondOrder, values)).status, 'programada');
    assert.equal((await saved(ids.secondOrder, { status: 'em_andamento' })).status, 'em_andamento');
    assert.equal((await db.query('select atribuido_a from demandas_municipais where id=$1', [ids.secondOrder])).rows[0].atribuido_a, null);
    await assert.rejects(saved(ids.secondOrder, { status: 'concluida', resultado: 'Manutenção realizada pela secretaria.' }), /Anexe evidência/);
    assert.equal((await saved(ids.secondOrder, { status: 'concluida', resultado: 'Manutenção realizada pela secretaria.', registro_execucao: 'Equipe municipal realizou os reparos e verificou o funcionamento.' })).status, 'concluida');
    await assert.rejects(saved(ids.order, { ...values, canal_id: null }), /secretaria/);
    await asUser(ids.reader); await assert.rejects(saved(ids.secondOrder, { titulo: 'Alteração indevida' }), /Sem permissão/);
  });
  await check('anexos de execução permanecem internos e comprovantes aparecem na bronca pública', async () => {
    await db.query('reset role');
    await db.query(attachmentTypes); await db.query(attachmentTypes);
    await db.query('insert into demanda_broncas(demanda_id,report_id) values($1,$2)', [ids.secondOrder, ids.report]);
    await db.query("insert into demanda_anexos(demanda_id,storage_path,nome,mime_type,tamanho,tipo,visibilidade) values($1,'teste/execucao.jpg','Execução','image/jpeg',10,'execucao','interna'),($1,'teste/conclusao.jpg','Conclusão','image/jpeg',10,'conclusao','publica')", [ids.secondOrder]);
    await assert.rejects(db.query("insert into demanda_anexos(demanda_id,storage_path,nome,mime_type,tamanho,tipo,visibilidade) values($1,'teste/invalido.jpg','Inválido','image/jpeg',10,'execucao','publica')", [ids.secondOrder]), { code: '23514' });
    await asUser(null, 'anon');
    const publicService = (await db.query('select public.atendimento_publico_bronca($1) service', [ids.report])).rows[0].service;
    assert.deepEqual(publicService.anexos.map((file) => file.nome), ['Conclusão']);
  });
  await check('conclusão rápida aceita foto e observação opcionais e mantém a verificação pública', async () => {
    await db.query('reset role');
    await db.query(quickCompletion); await db.query(quickCompletion);
    await asUser(ids.admin);
    assert.equal((await saved(ids.secondOrder, { status: 'triagem' }, { reason: 'Nova vistoria solicitada.' })).status, 'triagem');
    assert.equal((await saved(ids.secondOrder, { status: 'concluida' })).status, 'concluida');
    const order = (await db.query('select resultado,executada_em from demandas_municipais where id=$1', [ids.secondOrder])).rows[0];
    assert.equal(order.resultado, null); assert.ok(order.executada_em);
    assert.equal((await db.query('select status from reports where id=$1', [ids.report])).rows[0].status, 'pending_resolution');
    await db.query('reset role');
    const official = (await db.query("select observacao from report_official_steps where report_id=$1 and etapa='executada' order by id desc limit 1", [ids.report])).rows[0];
    assert.equal(official.observacao, 'A prefeitura informou que o serviço foi executado.');
  });
  console.log(passed + ' verificações de PostgreSQL aprovadas.');
} finally {
  await db.end();
  try { if (!process.argv.includes('--keep-db')) { await owner.query("set statement_timeout='5s'"); await owner.query('drop database ' + database); } }
  catch (error) { console.warn('Banco temporário preservado: ' + error.message); }
  finally { await owner.end(); }
}
