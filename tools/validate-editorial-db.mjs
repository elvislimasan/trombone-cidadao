// Banco PostgreSQL descartável, em loopback. Não lê .env nem usa Supabase remoto.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const bin = process.env.POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const root = path.resolve('.tmp', `editorial-db-${Date.now()}`);
await fs.mkdir(root, { recursive: true });
const cluster = path.join(root, 'data');
const initialized = spawnSync(path.join(bin, 'initdb.exe'), ['-D', cluster, '-U', 'editorial_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { windowsHide: true, encoding: 'utf8' });
await fs.writeFile(path.join(root, 'init.log'), `${initialized.stdout}\n${initialized.stderr}`);
if (initialized.status !== 0) throw new Error(`initdb falhou: ${root}`);
const listener = net.createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const server = spawn(path.join(bin, 'postgres.exe'), ['-D', cluster, '-h', '127.0.0.1', '-p', String(port), '-c', 'fsync=off'], { windowsHide: true, stdio: 'ignore' });
let client;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (let attempt = 0; attempt < 60; attempt++) {
    const connection = new pg.Client({ host: '127.0.0.1', port, user: 'editorial_test', database: 'postgres', connectionTimeoutMillis: 1000 });
    try { await connection.connect(); client = connection; break; } catch { await connection.end(); await pause(100); }
  }
  assert.ok(client, 'PostgreSQL local não iniciou');
  const q = (text, values) => client.query(text, values);
  const value = async (text, values) => (await q(text, values)).rows[0]?.value;
  const denied = async (text, values, pattern = /permiss|acesso|indisponível|negad/i) => {
    await assert.rejects(() => q(text, values), pattern);
  };
  await q(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
    grant usage on schema public,auth to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;
    create table public.profiles(id uuid primary key,is_admin boolean default false,is_master boolean default false);
    create table public.cities(id bigint primary key,name text);
    create table public.bairros(id uuid primary key,city_id bigint references cities(id),name text);
    create table public.public_works(id uuid primary key default gen_random_uuid(),city_id bigint references cities(id),
      title text,status text,is_complete boolean default true,total_value numeric,amount_spent numeric,
      stalled_date date,expected_end_date date,end_date date,bairro_id uuid references bairros(id));
    create table public.news(id uuid primary key default gen_random_uuid(),title text,source text,date date,description text,body text,link text,image_url text not null,video_url text not null);
    create table public.news_public_works(news_id uuid references news(id),work_id uuid references public_works(id),unique(news_id,work_id));
    insert into cities values(64,'Floresta'),(65,'Recife');
    insert into bairros values('10000000-0000-0000-0000-000000000001',64,'Centro');
    insert into profiles values('00000000-0000-0000-0000-000000000001',true,true),
      ('00000000-0000-0000-0000-000000000002',true,false),('00000000-0000-0000-0000-000000000003',true,false),
      ('00000000-0000-0000-0000-000000000004',false,false);
    insert into public_works(city_id,title,status,total_value,bairro_id)
      select 64,'Obra '||n,case when n<=23 then 'stalled' when n<=30 then 'unfinished' when n<=50 then 'in-progress' else 'completed' end,
        case when n=1 then null else 1000 end,'10000000-0000-0000-0000-000000000001'::uuid from generate_series(1,60) n;
    insert into public_works(city_id,title,status,is_complete) values(64,'Cadastro não publicável','stalled',false),(65,'Obra de outra cidade','stalled',true);`);
  await q(await fs.readFile('supabase/migrations/411_editorial_works_pilot.sql', 'utf8'));
  await q(`insert into editorial_access values(64,'00000000-0000-0000-0000-000000000002',true,true),(65,'00000000-0000-0000-0000-000000000003',false,false);`);
  const as = async (role, user = '') => { await q('reset role'); await q(`select set_config('test.user_id',$1,false)`, [user]); await q(`set role ${role}`); };
  const editor = '00000000-0000-0000-0000-000000000002';
  await as('anon');
  await denied('select * from editorial_candidates');
  await denied('select editorial_analyze(64)');
  await as('authenticated', '00000000-0000-0000-0000-000000000004');
  await denied('select editorial_analyze(64)');
  assert.equal(await value('select count(*)::int as value from editorial_candidates'), 0);
  await as('authenticated', editor);
  await denied('select editorial_analyze(65)');
  await denied(`select editorial_works_snapshot(64,'works.stalled')`);
  const initial = await value('select editorial_analyze(64) as value');
  assert.equal(initial.created, 3, 'Paralisadas, inacabadas e concluídas; sem prazo vencido');
  assert.equal((await value('select editorial_analyze(64) as value')).created, 0);
  const candidate = (await q(`select * from editorial_candidates where city_id=64 and topic_key='works.stalled'`)).rows[0];
  assert.equal(candidate.snapshot.total, 60);
  assert.equal(candidate.snapshot.selected, 23);
  assert.equal(candidate.snapshot.share, 38.3);
  assert.equal(candidate.snapshot.sources.length, 23);
  assert.ok(candidate.snapshot.facts.find(f => f.id === 'F4').text.startsWith('1 obras'));
  assert.ok(candidate.snapshot.facts.find(f => f.id === 'F6').text.includes('Centro: 23'));
  await denied(`insert into editorial_candidates(city_id) values(64)`);
  const reservation = randomUUID();
  await q(`select editorial_reserve_generation($1,'news',$2,'',0)`, [candidate.id, reservation]);
  await denied(`select editorial_reserve_generation($1,'news',$2,'',0)`, [candidate.id, randomUUID()], /andamento/);
  await denied(`select editorial_finish_generation($1,null,'modelo')`, [reservation]);
  const content = { title: 'Floresta: 23 obras registradas como paralisadas', title_fact_ids: ['F2'], blocks: [
    { text: 'São 23 obras registradas como paralisadas, equivalentes a 38,3% dos cadastros publicáveis.', fact_ids: ['F2'] },
    { text: 'A plataforma acompanha 60 obras com cadastro publicável em Floresta.', fact_ids: ['F1'] },
  ] };
  await as('service_role');
  const draftId = await value('select editorial_finish_generation($1,$2,\'modelo-teste\',\'{"input_tokens":100}\') as value', [reservation, content]);
  assert.equal(await value('select editorial_finish_generation($1,$2,\'modelo-teste\') as value', [reservation, content]), draftId);
  await as('authenticated', editor);
  assert.equal((await value(`select editorial_reserve_generation($1,'news',$2,'',1) as value`, [candidate.id, randomUUID()])).cached_content_id, draftId);
  await denied('select editorial_save_content($1,null)', [draftId], /incompleto/);
  await denied('select editorial_save_content($1,$2)', [draftId, { ...content, blocks: [{ text: 'São 999 obras paralisadas.', fact_ids: ['F2'] }] }], /Número sem suporte/);
  await denied('select editorial_save_content($1,$2)', [draftId, { ...content, title_fact_ids: [], blocks: content.blocks }], /fontes/);
  await denied('select editorial_save_content($1,$2)', [draftId, { ...content, blocks: [{ text: '<script>ataque</script>', fact_ids: ['F2'] }] }], /fontes/);
  await denied('select editorial_save_content($1,$2)', [draftId, { ...content, blocks: [{ text: 'Texto sem suporte.', fact_ids: ['F99'] }] }], /Referência/);
  await denied('select editorial_approve($1,false)', [draftId], /Confirme/);
  await denied('select editorial_publish($1)', [draftId], /aprovada/);
  await q('select editorial_approve($1,true)', [draftId]);
  const editedId = await value('select editorial_save_content($1,$2) as value', [draftId, { ...content, title: 'Levantamento: 23 obras registradas como paralisadas' }]);
  assert.notEqual(editedId, draftId);
  assert.equal(await value('select approved_at as value from editorial_contents where id=$1', [editedId]), null);
  await denied('select editorial_approve($1,true)', [draftId], /versão atual/);
  await denied('select editorial_save_content($1,$2)', [draftId, content], /versão mais recente/);
  await q('select editorial_approve($1,true)', [editedId]);
  await as('authenticated', '00000000-0000-0000-0000-000000000003');
  assert.equal(await value('select count(*)::int as value from editorial_contents'), 0);
  await denied('select editorial_publish($1)', [editedId]);
  await as('authenticated', editor);
  const publishedId = await value('select editorial_publish($1) as value', [editedId]);
  assert.equal(await value('select editorial_publish($1) as value', [editedId]), publishedId);
  await denied('select editorial_save_content($1,$2)', [editedId, content], /responsável/);
  await as('editorial_test');
  assert.equal(await value('select count(*)::int as value from news'), 1);
  assert.equal(await value('select count(*)::int as value from news_public_works'), 23);
  assert.ok(await value(`select body like '%/obras-publicas/%' as value from news`));
  await q(`update public_works set title=title||' corrigida' where city_id=64`);
  await as('authenticated', editor);
  assert.equal((await value('select editorial_analyze(64) as value')).created, 0, 'Título corrigido não recria pauta');
  const scriptReservation = randomUUID();
  await q(`select editorial_reserve_generation($1,'video_60',$2,'',0)`, [candidate.id, scriptReservation]);
  await as('service_role');
  const scriptId = await value(`select editorial_finish_generation($1,$2,'modelo-teste') as value`, [scriptReservation, content]);
  await as('authenticated', editor);
  await q('select editorial_approve($1,true)', [scriptId]);
  assert.equal((await value('select editorial_export($1) as value', [scriptId])).id, scriptId);
  await as('editorial_test');
  await q(`update public_works set status='in-progress' where id in (select id from public_works where city_id=64 and is_complete and status='stalled' limit 3)`);
  await as('authenticated', editor);
  await denied('select editorial_export($1)', [scriptId], /dados mudaram/);
  const changed = await value('select editorial_analyze(64) as value');
  assert.ok(changed.created >= 1, 'Mudança material deve criar desdobramento');
  const newCandidate = (await q(`select * from editorial_candidates where city_id=64 and topic_key='works.stalled' and status='proposed'`)).rows[0];
  assert.equal(newCandidate.snapshot.selected, 20);
  await q(`select editorial_candidate_action($1,'dismiss','Já coberto pela equipe')`, [newCandidate.id]);
  assert.equal((await value('select editorial_analyze(64) as value')).created, 0, 'Descarte permanece na memória');
  // Duas conexões disputam a mesma produção: apenas uma reserva deve vencer.
  const unfinished = (await q(`select id from editorial_candidates where city_id=64 and topic_key='works.unfinished' and status='proposed'`)).rows[0].id;
  const parallelClient = new pg.Client({ host: '127.0.0.1', port, user: 'editorial_test', database: 'postgres' });
  await parallelClient.connect();
  let parallelRequest;
  try {
    await parallelClient.query(`select set_config('test.user_id',$1,false)`, [editor]);
    await parallelClient.query('set role authenticated');
    const requestA = randomUUID(), requestB = randomUUID();
    const race = await Promise.allSettled([
      q(`select editorial_reserve_generation($1,'news',$2,'',0) as value`, [unfinished, requestA]),
      parallelClient.query(`select editorial_reserve_generation($1,'news',$2,'',0) as value`, [unfinished, requestB]),
    ]);
    assert.equal(race.filter(result => result.status === 'fulfilled').length, 1);
    assert.match(race.find(result => result.status === 'rejected').reason.message, /andamento/);
    parallelRequest = race.find(result => result.status === 'fulfilled').value.rows[0].value.generation_id;
  } finally { await parallelClient.end(); }
  const unfinishedContent = { title: 'Levantamento de obras cadastradas como inacabadas', title_fact_ids: ['F2'], blocks: [{ text: 'O levantamento descreve os cadastros publicáveis da plataforma.', fact_ids: ['F1'] }] };
  await as('service_role');
  const unfinishedId = await value(`select editorial_finish_generation($1,$2,'modelo-teste') as value`, [parallelRequest, unfinishedContent]);
  await as('authenticated', editor);
  await q('select editorial_approve($1,true)', [unfinishedId]);
  await as('editorial_test');
  const withdrawn = await value(`update public_works set is_complete=false where id=(select id from public_works where city_id=64 and status='unfinished' limit 1) returning id as value`);
  await as('authenticated', editor);
  await denied('select editorial_publish($1)', [unfinishedId], /dados mudaram/);
  await as('editorial_test');
  await q('update public_works set is_complete=true where id=$1', [withdrawn]);
  // Falha de vínculo deve reverter inclusive a notícia inserida na transação.
  await q(`create function fail_editorial_link_test() returns trigger language plpgsql as $$ begin raise exception 'Falha simulada de vínculo'; end $$;
    create trigger fail_editorial_link before insert on news_public_works for each row execute function fail_editorial_link_test();`);
  await as('authenticated', editor);
  await denied('select editorial_publish($1)', [unfinishedId], /simulada/);
  await as('editorial_test');
  assert.equal(await value('select count(*)::int as value from news'), 1, 'Publicação parcial foi revertida');
  await q('drop trigger fail_editorial_link on news_public_works; drop function fail_editorial_link_test()');
  await as('authenticated', editor);
  await q('select editorial_publish($1)', [unfinishedId]);
  await denied('select editorial_set_daily(64,true)', [], /master/);
  await as('authenticated', '00000000-0000-0000-0000-000000000001');
  await denied('select editorial_set_daily(64,true)', [], /pg_cron/);
  await as('editorial_test');
  await q(`update editorial_settings set daily_ai_limit=1 where city_id=64`);
  await q(`delete from editorial_ai_usage where city_id=64`);
  await as('authenticated', editor);
  const quotaCandidate = (await q(`select id from editorial_candidates where city_id=64 and topic_key='works.completed' and status='proposed'`)).rows[0].id;
  await q(`select editorial_reserve_generation($1,'news',$2,'',0)`, [quotaCandidate, randomUUID()]);
  await denied(`select editorial_reserve_generation($1,'video_30',$2,'',0)`, [quotaCandidate, randomUUID()], /Limite diário/);
  await as('editorial_test');
  await q(`create table public.reports(id uuid primary key default gen_random_uuid(),city_id bigint,protocol text,status text,
    is_public boolean default true,moderation_status text default 'approved',signal_status text,category_id text,
    neighborhood text,created_at timestamptz default now(),title text,description text,author_id uuid,address text);
    create table public.pavement_streets(id uuid primary key default gen_random_uuid(),city_id bigint,name text,status text,pavement_type text,bairro_id uuid);
    create table public.city_trees(id uuid primary key default gen_random_uuid(),city_id bigint,public_code text,common_name text,status text,
      planted_at date,planting_year integer,bairro_id uuid,neighborhood text,address text,notes text);
    create table public.community_trees(id uuid primary key default gen_random_uuid(),city_id bigint,name text,status text,public_profile boolean,
      planted_on date,author_id uuid,address text,latitude numeric,longitude numeric);
    create table public.news_reports(news_id uuid references news(id),report_id uuid references reports(id),unique(news_id,report_id));
    alter table public.news_reports enable row level security;
    grant select on public.news_reports to anon,authenticated;
    create policy fixture_news_reports_read on public.news_reports for select using(true);
    update editorial_settings set daily_ai_limit=30 where city_id=64;
    delete from editorial_ai_usage;`);
  await q(await fs.readFile('supabase/migrations/412_editorial_city_subjects.sql', 'utf8'));
  await q(`update editorial_settings set last_analysis_at=now()-interval '1 day' where city_id=64`);
  await as('authenticated', editor);
  assert.equal((await value('select editorial_export($1) as value', [unfinishedId])).id, unfinishedId, 'A migração preserva versões aprovadas de obras');
  await denied(`select editorial_subject_rows(64,'reports')`);
  await denied(`select editorial_analyze_module(65,'reports')`);
  await denied(`select editorial_analyze_module(64,'unknown')`, [], /Assunto/);
  await as('editorial_test');
  await q(`insert into reports(city_id,protocol,status,category_id,neighborhood,title,description,address,author_id)
    select 64,'TC-'||n,case when n<=3 then 'pending' when n=4 then 'pending_resolution' when n=5 then 'in-progress' else 'resolved' end,
      case when n<=4 then 'iluminacao' else 'buracos' end,'Centro','PRIVATE_TITLE','PRIVATE_DESCRIPTION','PRIVATE_ADDRESS','00000000-0000-0000-0000-000000000004'::uuid
    from generate_series(1,6) n;
    insert into reports(city_id,protocol,status,is_public,moderation_status,signal_status,title) values
      (64,'PRIVATE_INTERNAL','pending',false,'internal',null,'PRIVATE_INTERNAL'),
      (64,'PRIVATE_PENDING','pending',true,'pending_approval',null,'PRIVATE_PENDING'),
      (64,'PRIVATE_DUPLICATE','duplicate',true,'approved',null,'PRIVATE_DUPLICATE'),
      (64,'PRIVATE_SIGNAL','pending',true,'approved','open','PRIVATE_SIGNAL'),
      (64,'PRIVATE_EMPTY','pending',true,'approved','empty','PRIVATE_EMPTY'),
      (65,'PRIVATE_OTHER_CITY','pending',true,'approved',null,'PRIVATE_OTHER_CITY');
    insert into pavement_streets(city_id,name,status,pavement_type,bairro_id)
      select 64,'Rua '||n,case when n<=2 then 'unpaved' when n=3 then 'partially_paved' else 'paved' end,
        case when n<=2 then 'asphalt' else 'granite' end,'10000000-0000-0000-0000-000000000001'::uuid from generate_series(1,5) n;
    insert into pavement_streets(city_id,name,status) values(65,'PRIVATE_OTHER_STREET','unpaved');
    insert into city_trees(city_id,public_code,common_name,status,planted_at,planting_year,bairro_id,address,notes) values
      (64,'AR1','Ipê','saudavel','2026-01-01',null,'10000000-0000-0000-0000-000000000001','PRIVATE_TREE_ADDRESS','PRIVATE_TREE_NOTE'),
      (64,'AR2','Ipê','atencao',null,null,'10000000-0000-0000-0000-000000000001',null,null),
      (64,'AR3','Nim','risco',null,null,null,null,null),
      (64,'AR4','Ipê','planejada',null,2027,null,null,null),
      (64,'AR5','Ipê','planejada',null,2028,null,null,null),
      (64,'AR6','Ipê','removida','2020-01-01',null,null,null,null),
      (65,'AR1','PRIVATE_OTHER_TREE','atencao',null,null,null,null,null);
    insert into community_trees(city_id,name,status,public_profile,planted_on,address,latitude,longitude,author_id) values
      (64,'PRIVATE_COMMUNITY_NAME','approved',true,'2026-01-01','PRIVATE_RESIDENCE',-8.6,-38.5,'00000000-0000-0000-0000-000000000004'),
      (64,'PRIVATE_NOT_PUBLIC','approved',false,null,null,null,null,null),
      (64,'PRIVATE_PENDING_TREE','pending',true,null,null,null,null,null),
      (64,'PRIVATE_REJECTED_TREE','rejected',true,null,null,null,null,null),
      (65,'PRIVATE_OTHER_COMMUNITY','approved',true,null,null,null,null,null);`);
  await as('authenticated', editor);
  const reportAnalysis = await value(`select editorial_analyze_module(64,'reports') as value`);
  assert.equal(reportAnalysis.created, 3);
  assert.equal(await value(`select last_analysis_at<now()-interval '1 hour' as value from editorial_settings where city_id=64`), true,
    'Análise filtrada não marca a análise diária geral como concluída');
  assert.equal((await value(`select editorial_analyze_module(64,'reports') as value`)).created, 0);
  const reportCandidates = (await q(`select * from editorial_candidates where city_id=64 and module='reports' order by topic_key`)).rows;
  assert.equal(reportCandidates.find(row => row.topic_key === 'reports.registered').snapshot.selected, 6);
  assert.equal(reportCandidates.find(row => row.topic_key === 'reports.active').snapshot.selected, 5);
  assert.equal(reportCandidates.find(row => row.topic_key === 'reports.resolved').snapshot.selected, 1);
  assert.ok(!JSON.stringify(reportCandidates).includes('PRIVATE_'), 'Títulos, descrições, autores e dados não públicos foram excluídos');
  assert.equal(await value(`select count(*)::int as value from editorial_candidates where module in ('streets','arborization')`), 0, 'Filtro não analisa outros assuntos');
  assert.equal((await value(`select editorial_analyze_module(64,'streets') as value`)).created, 3);
  const streets = (await q(`select * from editorial_candidates where city_id=64 and module='streets'`)).rows;
  const unpaved = streets.find(row => row.topic_key === 'streets.unpaved');
  assert.equal(unpaved.snapshot.total, 5); assert.equal(unpaved.snapshot.selected, 2); assert.equal(unpaved.snapshot.share, 40);
  assert.ok(unpaved.snapshot.facts.find(f => f.id === 'F5').text.includes('não se aplica'), 'Tipo residual não transforma rua de terra em asfaltada');
  assert.ok(streets.find(row => row.topic_key === 'streets.paved').snapshot.facts.find(f => f.id === 'F5').text.includes('Paralelepípedo: 2'));
  assert.equal((await value(`select editorial_analyze_module(64,'arborization') as value`)).created, 4);
  const trees = (await q(`select * from editorial_candidates where city_id=64 and module='arborization'`)).rows;
  assert.equal(trees.find(row => row.topic_key === 'arborization.attention').snapshot.total, 3);
  assert.equal(trees.find(row => row.topic_key === 'arborization.attention').snapshot.selected, 2);
  assert.equal(trees.find(row => row.topic_key === 'arborization.planned').snapshot.selected, 2);
  assert.equal(trees.find(row => row.topic_key === 'arborization.planned').snapshot.total, 5);
  assert.equal(trees.find(row => row.topic_key === 'arborization.planted').snapshot.selected, 1, 'Planejadas e removidas não entram como plantadas no inventário ativo');
  assert.equal(trees.find(row => row.topic_key === 'arborization.community').snapshot.selected, 1);
  assert.ok(!JSON.stringify(trees).includes('PRIVATE_'), 'Dados privados da comunidade e notas técnicas não entraram na análise');
  assert.equal((await value(`select editorial_analyze_module(64,'all') as value`)).created, 0, 'Análise geral usa a mesma memória');

  // Produzir/aprovar/publicar cada novo tipo, com rotas e vínculos corretos.
  const published = [];
  for (const item of [reportCandidates.find(row => row.topic_key === 'reports.active'), unpaved,
    trees.find(row => row.topic_key === 'arborization.attention'), trees.find(row => row.topic_key === 'arborization.community')]) {
    const req = randomUUID();
    await q(`select editorial_reserve_generation($1,'news',$2,'',0)`, [item.id, req]);
    await as('service_role');
    const currentContent = { title: item.title, title_fact_ids: ['F2'], blocks: [{ text: item.snapshot.facts.find(f => f.id === 'F2').text, fact_ids: ['F2'] }] };
    const id = await value(`select editorial_finish_generation($1,$2,'modelo-teste') as value`, [req, currentContent]);
    await as('authenticated', editor);
    await q('select editorial_approve($1,true)', [id]);
    const news = await value('select editorial_publish($1) as value', [id]);
    assert.equal(await value('select editorial_publish($1) as value', [id]), news);
    published.push({ module: item.module, topic: item.topic_key, content: id, news });
  }
  await as('editorial_test');
  const expectedRoutes = ['/bronca/', '/mapa-pavimentacao/rua/', '/arborizacao/arvore/', '/arvores-da-comunidade/'];
  for (const [index, item] of published.entries()) {
    assert.ok((await value('select body as value from news where id=$1', [item.news])).includes(expectedRoutes[index]));
    assert.ok(await value('select count(*)>0 as value from news_editorial_sources where news_id=$1', [item.news]));
    assert.equal(await value('select count(*)::int as value from news_public_works where news_id=$1', [item.news]), 0, 'Outros assuntos não vinculam IDs à tabela de obras');
  }
  assert.equal(await value('select count(*)::int as value from news_reports where news_id=$1', [published[0].news]), 5);
  const privateReport = await value(`update reports set is_public=false,moderation_status='internal' where id=(select source_id from news_editorial_sources where news_id=$1 limit 1) returning id as value`, [published[0].news]);
  await as('anon');
  assert.equal(await value('select count(*)::int as value from news_editorial_sources where news_id=$1 and source_id=$2', [published[0].news, privateReport]), 0);
  assert.equal(await value('select count(*)::int as value from news_reports where news_id=$1 and report_id=$2', [published[0].news, privateReport]), 0, 'Índice legado não revela vínculo de bronca interna');
  await as('authenticated', editor);
  await denied('select editorial_export($1)', [published[0].content], /dados mudaram/);
  await as('editorial_test');
  await q(`update community_trees set public_profile=false where id=(select source_id from news_editorial_sources where news_id=$1 limit 1)`, [published[3].news]);
  await as('anon');
  assert.equal(await value('select count(*)::int as value from news_editorial_sources where news_id=$1', [published[3].news]), 0);
  await as('authenticated', editor);
  await denied('select editorial_export($1)', [published[3].content], /dados mudaram/);
  await as('editorial_test');
  await q(`update pavement_streets set bairro_id=null where id=(select source_id from news_editorial_sources where news_id=$1 limit 1)`, [published[1].news]);
  await as('authenticated', editor);
  await denied('select editorial_export($1)', [published[1].content], /dados mudaram/);
  // A rotina antiga passa a cobrir todos os assuntos sem depender do navegador.
  await as('editorial_test');
  await q(`insert into reports(city_id,protocol,status) values(64,'NOVO','pending');
    update editorial_settings set daily_enabled=true,last_analysis_at=now()-interval '1 day' where city_id=64;
    select editorial_run_daily();`);
  assert.equal(await value(`select last_analysis_at>(now()-interval '1 minute') as value from editorial_settings where city_id=64`), true);
  assert.equal(await value(`select last_error as value from editorial_settings where city_id=64`), null);
  await q(await fs.readFile('supabase/migrations/413_editorial_styles_and_scripts.sql', 'utf8'));
  await as('authenticated', editor);
  assert.equal((await value('select editorial_export($1) as value', [unfinishedId])).id, unfinishedId, 'Migração de estilo preserva versão antiga aprovada');
  const styledCandidate = (await q(`select * from editorial_candidates where city_id=64 and topic_key='streets.paved' and status='proposed' order by created_at desc limit 1`)).rows[0];
  const beforeCandidateCount = await value('select count(*)::int as value from editorial_candidates');
  const humorous = { tone: 'humorous', news_style: 'explainer', video_style: 'dialogue', guidance: 'Abertura leve e próxima.' };
  const styleReq = randomUUID();
  const styledReserve = await value(`select editorial_reserve_generation_styled($1,'news',$2,$3,'',0) as value`, [styledCandidate.id, styleReq, humorous]);
  assert.equal(styledReserve.brief.tone, 'humorous');
  const styledText = { title: styledCandidate.title, title_fact_ids: ['F2'], blocks: [{ text: styledCandidate.snapshot.facts.find(f => f.id === 'F2').text, fact_ids: ['F2'] }] };
  await as('service_role');
  const styleId = await value(`select editorial_finish_generation($1,$2,'modelo-teste') as value`, [styleReq, styledText]);
  await as('authenticated', editor);
  assert.equal(await value(`select brief->>'tone' as value from editorial_contents where id=$1`, [styleId]), 'humorous');
  await q('select editorial_approve($1,true)', [styleId]);
  assert.equal((await value(`select editorial_reserve_generation_styled($1,'news',$2,$3,'',1) as value`, [styledCandidate.id, randomUUID(), { ...humorous, video_style: 'voiceover' }])).cached_content_id, styleId,
    'Mudar condução de vídeo não regenera notícia');
  await denied(`select editorial_reserve_generation_styled($1,'news',$2,$3,'',0)`, [styledCandidate.id, styleReq, { ...humorous, tone: 'light' }], /Solicitação inválida/);
  const informative = { ...humorous, tone: 'informative' };
  const nextStyleRequest = randomUUID();
  const nextReserve = await value(`select editorial_reserve_generation_styled($1,'news',$2,$3,'',1) as value`, [styledCandidate.id, nextStyleRequest, informative]);
  assert.ok(nextReserve.generation_id, 'Mudança de tom precisa de nova geração, sem reaproveitar texto antigo');
  await as('service_role');
  const nextStyleId = await value(`select editorial_finish_generation($1,$2,'modelo-teste') as value`, [nextStyleRequest, styledText]);
  await as('authenticated', editor);
  assert.equal(await value('select approved_at is null as value from editorial_contents where id=$1', [nextStyleId]), true);
  assert.equal(await value('select approved_at is not null as value from editorial_contents where id=$1', [styleId]), true);
  await denied('select editorial_approve($1,true)', [styleId], /versão atual/);
  const scriptRequest = randomUUID();
  await q(`select editorial_reserve_generation_styled($1,'video_60',$2,$3,'',0)`, [styledCandidate.id, scriptRequest, humorous]);
  const script = { ...styledText, blocks: [
    { text: styledText.blocks[0].text, fact_ids: ['F2'], speaker: 'presenter_a', scene: 'Apresentação com mapa das ruas consultadas.', screen_text: 'Pavimentação no cadastro' },
    { text: 'O que esses registros permitem acompanhar?', fact_ids: ['F1'], speaker: 'presenter_b', scene: 'Captar a segunda apresentação diante do mapa.', screen_text: '' },
  ] };
  await as('service_role');
  await denied(`select editorial_finish_generation($1,$2,'modelo-teste')`, [scriptRequest, { ...script, blocks: [{ ...script.blocks[0], scene: 'Mostrar 999999 ruas no mapa.' }, script.blocks[1]] }], /Número sem suporte/);
  await denied(`select editorial_finish_generation($1,$2,'modelo-teste')`, [scriptRequest, { ...script, blocks: [{ ...script.blocks[0], screen_text: '999999 ruas' }, script.blocks[1]] }], /Número sem suporte/);
  await denied(`select editorial_finish_generation($1,$2,'modelo-teste')`, [scriptRequest, { ...script, blocks: [script.blocks[0]] }], /dois apresentadores/);
  const scriptStyleId = await value(`select editorial_finish_generation($1,$2,'modelo-teste') as value`, [scriptRequest, script]);
  await as('authenticated', editor);
  const manualScript = { ...script, blocks: [{ ...script.blocks[0], scene: 'Captar apresentação e depois o mapa dos registros.' }, script.blocks[1]] };
  const manualScriptId = await value('select editorial_save_content($1,$2) as value', [scriptStyleId, manualScript]);
  assert.equal(await value(`select brief->>'video_style' as value from editorial_contents where id=$1`, [manualScriptId]), 'dialogue');
  await q('select editorial_approve($1,true)', [manualScriptId]);
  const scriptExport = await value('select editorial_export($1) as value', [manualScriptId]);
  assert.equal(scriptExport.content.blocks[1].speaker, 'presenter_b');
  assert.equal(scriptExport.content.blocks[0].scene, manualScript.blocks[0].scene);
  const narrationReq = randomUUID();
  await q(`select editorial_reserve_generation_styled($1,'video_60',$2,$3,'',2)`, [styledCandidate.id, narrationReq, { ...humorous, video_style: 'voiceover' }]);
  await as('service_role');
  const narrationId = await value(`select editorial_finish_generation($1,$2,'modelo-teste') as value`, [narrationReq, { ...script, blocks: [{ ...script.blocks[0], speaker: 'narrator' }] }]);
  await as('authenticated', editor);
  assert.equal(await value(`select brief->>'video_style' as value from editorial_contents where id=$1`, [narrationId]), 'voiceover');
  await denied(`select editorial_reserve_generation_styled($1,'video_30',$2,'{"tone":"invalid"}','',0)`, [styledCandidate.id, randomUUID()], /estilo válido/);
  assert.equal(await value('select count(*)::int as value from editorial_candidates'), beforeCandidateCount, 'Novo tom não cria pauta duplicada');
  await as('editorial_test');
  await denied(`update editorial_contents set brief=brief||'{"tone":"critical"}' where id=$1`, [narrationId], /imutáveis/);
  console.log(JSON.stringify({ migrations: ['411','412','413'], localOnly: true, aggregate: '23 / 60 = 38,3%', privateDrafts: true,
    sourceValidation: true, immutableVersions: true, approval: true, idempotentPublication: true,
    staleSourceBlocked: true, cityIsolation: true, dailyOptIn: true, quota: true,
    concurrentReservation: true, atomicRollback: true, subjects: ['works','reports','streets','arborization'],
    internalReportsExcluded: true, communityPrivacy: true, typedPublicationLinks: true, dailyAllSubjects: true,
    styleAwareCache: true, versionedTone: true, structuredDialogue: true, sceneAndScreenFactsChecked: true }, null, 2));
} finally {
  await client?.end();
  spawnSync(path.join(bin, 'pg_ctl.exe'), ['-D', cluster, 'stop', '-m', 'immediate', '-w'], { windowsHide: true, stdio: 'ignore' });
  server.kill();
}
