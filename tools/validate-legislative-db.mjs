// Disposable PostgreSQL. No .env, Supabase remote writes or production access.
import fs from 'node:fs/promises';
import path from 'node:path';
import net from 'node:net';
import { spawn, spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import pg from 'pg';
import { buildSaplPlan, normalizeSaplRow } from '../supabase/functions/_shared/legislative/sapl.js';
import { startLegislativeRun, collectLegislativeSlice } from '../supabase/functions/_shared/legislative/collector.js';

const bin = process.env.POSTGRES_BIN || 'C:/Program Files/PostgreSQL/17/bin';
const root = path.resolve('.tmp', `legislative-db-${Date.now()}`);await fs.mkdir(root, { recursive: true });
const cluster = path.join(root, 'data');
const init = spawnSync(path.join(bin, 'initdb.exe'), ['-D', cluster, '-U', 'legislative_test', '-A', 'trust', '--no-locale', '-E', 'UTF8'], { windowsHide: true, encoding: 'utf8' });
assert.equal(init.status, 0, init.stderr);
const listener = net.createServer();await new Promise(r => listener.listen(0, '127.0.0.1', r));const port = listener.address().port;await new Promise(r => listener.close(r));
const server = spawn(path.join(bin, 'postgres.exe'), ['-D', cluster, '-h', '127.0.0.1', '-p', String(port), '-c', 'fsync=off'], { windowsHide: true, stdio: 'ignore' });
const admin = '10000000-0000-4000-8000-000000000001', citizen = '10000000-0000-4000-8000-000000000002';
const councilor = '20000000-0000-4000-8000-000000000001', other = '20000000-0000-4000-8000-000000000002';
let client;
try {
  for (let i = 0; i < 60; i++) { const candidate = new pg.Client({ host: '127.0.0.1', port, user: 'legislative_test', database: 'postgres', connectionTimeoutMillis: 500 });try { await candidate.connect();client = candidate;break; } catch { await candidate.end();await new Promise(r => setTimeout(r, 100)); } }
  assert.ok(client);
  const q = (text, values) => client.query(text, values);
  const value = async (text, values) => (await q(text, values)).rows[0]?.value;
  await q(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
    create function auth.role() returns text language sql stable as $$select coalesce(nullif(current_setting('test.role',true),''),'authenticated')$$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    create table cities(id bigint primary key,name text);insert into cities values(64,'Floresta'),(65,'Recife');
    create table profiles(id uuid primary key,is_admin boolean default false,is_master boolean default false);
    insert into profiles values('${admin}',true,false),('${citizen}',false,false);
    create table permission_rules(scope text,role_name text,module text constraint permission_rules_module_check check(module in('pavement')),allowed boolean);
    create function can_write(uuid,text)returns boolean language sql stable as $$select true$$;
    create function normalized_councilor_name(text)returns text language sql immutable as $$select trim(regexp_replace(lower($1),'[^a-z0-9]+',' ','g'))$$;
    create function councilor_slug(text)returns text language sql immutable as $$select replace(normalized_councilor_name($1),' ','-')$$;
    create table councilors(id uuid primary key default gen_random_uuid(),city_id bigint,name text,nickname text,normalized_name text,slug text,photo_url text,party text,unique(city_id,normalized_name));
    insert into councilors values('${councilor}',64,'Pessoa de teste',null,'pessoa de teste','pessoa-de-teste',null,null),('${other}',65,'Outra cidade',null,'outra cidade','outra-cidade',null,null);
    create table pavement_streets(id uuid primary key,city_id bigint,name text);
    create table reports(id uuid primary key,city_id bigint,is_public boolean,moderation_status text,status text,signal_status text,protocol text);
  `);
  const migrations=(await fs.readdir('supabase/migrations')).filter(name=>/^\d+_legislative_.*\.sql$/.test(name)).sort();
  assert.equal(migrations.length, 14, 'A suíte deve executar todas as migrações legislativas.');
  for (const name of migrations) await q(await fs.readFile(`supabase/migrations/${name}`, 'utf8'));
  const source = (await q('select * from legislative_sources')).rows[0];assert.equal(source.daily_enabled, false);
  assert.equal((await value("select legislative_public(65) value")).state, 'unconfigured');
  const rpc = async (name, args) => {
    assert.match(name, /^legislative_[a-z_]+$/);
    const keys = Object.keys(args);for (const key of keys) assert.match(key, /^p_[a-z_]+$/);
    const params = Object.values(args).map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
    try { return { data: await value(`select public.${name}(${keys.map((k, i) => `${k}=>$${i + 1}`).join(',')}) value`, params), error: null }; } catch (error) { return { data: null, error }; }
  };
  const bridge = { rpc, from(table) { const filters = [];return { select() { return this; }, eq(k, v) { filters.push([k, v]);return this; }, async single() { assert.ok(['legislative_runs', 'legislative_sources'].includes(table));try { return { data: (await q(`select * from ${table} where ${filters.map(([k], i) => `${k}=$${i + 1}`).join(' and ')}`, filters.map(([, v]) => v))).rows[0] }; } catch (error) { return { error }; } } }; } };
  const initial = await rpc('legislative_begin_run', { p_source: source.id, p_plan: buildSaplPlan(2025, 2025) });assert.ifError(initial.error);
  const run = initial.data;assert.equal((await value('select legislative_public(64) value')).state, 'pending');
  await assert.rejects(q('select legislative_publish_run($1)', [run]), /Sem permissão/);
  const fixtures = {
    parliamentarians: [{ id: 1, nome_completo: 'Pessoa de teste', nome_parlamentar: 'Pessoa', ativo: true, ip: 'not-public', user: 123 },{id:2,nome_completo:'Outra pessoa de teste',nome_parlamentar:'Outra',ativo:true}],
    authors: [{ id: 11, nome: 'Pessoa', tipo: 1, autor_related: { value: 1 } }],
    matter_types: [{ id: 1, descricao: 'Projeto de Lei Ordinária', sigla: 'PLO' }, { id: 21, descricao: 'Pedido de Providência', sigla: 'PPROV' }],
    matters: Array.from({ length: 4 }, (_, i) => ({ id: i + 1, numero: i + 1, ano: 2025, tipo: i ? 21 : 1, data_apresentacao: `2025-02-0${i + 1}`, ementa: `Matéria ${i + 1}`, autores: [11], ip: 'not-public' })),
    sessions: [{ id: 1, numero: 1, data_inicio: '2025-02-01', tipo: 1, __str__: 'Sessão de teste' }, { id: 2, numero: 2, data_inicio: '2025-03-01', tipo: 1 }, { id: 3, numero: 3, data_inicio: '2026-02-01', tipo: 1 }],
    agenda: [{ id: 1, sessao_plenaria: 1, materia: 1, tipo_votacao: 2 }],
    ballot_types: [{ id: 0, nome: 'Não informado' }, { id: 1, nome: 'Aprovado' }],
    ballots: [{ id: 1, materia: 1, ordem: 1, tipo_resultado_votacao: 1, numero_votos_sim: 1, numero_votos_nao: 0, numero_abstencoes: 0 }],
    votes: [{ id: 1, votacao: 1, parlamentar: 1, voto: 'Sim', ip: 'not-public', user: 123 }],
    attendance: [{ id: 1, sessao_plenaria: 1, parlamentar: 1 }],
    absence_justifications: [{ id: 1, sessao_plenaria: 2, parlamentar: 1, ausencia: 2 }, { id: 2, sessao_plenaria: 2, parlamentar: 1, ausencia: 2 }, { id: 3, sessao_plenaria: 1, parlamentar: 1, ausencia: 2 }, { id: 4, sessao_plenaria: 2, parlamentar: 2, ausencia: 1 }, { id: 5, sessao_plenaria: 3, parlamentar: 1, ausencia: 2 }],
  };
  for (const job of (await q('select * from legislative_jobs where run_id=$1 order by resource_key', [run])).rows) {
    const claim = await rpc('legislative_claim_job', { p_run: run });assert.ifError(claim.error);assert.equal(claim.data.id, job.id);
    const rows = (fixtures[job.kind] || []).map(row => normalizeSaplRow(job.kind, row));
    const page = await rpc('legislative_store_page', { p_job: job.id, p_token: claim.data.lease_token, p_page: 1, p_total: rows.length, p_next: null, p_rows: rows });assert.ifError(page.error);
    if (job.kind === 'matters') { const duplicate = await rpc('legislative_store_page', { p_job: job.id, p_token: claim.data.lease_token, p_page: 1, p_total: rows.length, p_next: null, p_rows: rows });assert.ok(duplicate.error); }
  }
  assert.equal((await rpc('legislative_finish_run', { p_run: run })).data.matters, 4);
  await q("select set_config('test.uid',$1,false)", [admin]);
  await q('select legislative_publish_run($1)', [run]);
  const publicRpc = (view, filters = {}) => value('select legislative_public(64,$1,$2) value', [view, JSON.stringify(filters)]);
  const attendanceRpc = (person = null) => value("select legislative_attendance(64,'2025-01-01','2025-12-31',$1) value", [person]);
  const attendance = await attendanceRpc();
  const highlights = await value("select legislative_profile_highlights(64,'2025-01-01','2025-12-31',1) value");
  assert.equal(highlights.state, 'ready');
  assert.equal(highlights.votes_complete, true);
  assert.deepEqual(highlights.votes, { total: 1, yes: 1, no: 0, abstentions: 0, other: 0 });
  assert.equal((await value("select legislative_profile_highlights(65,'2025-01-01','2025-12-31',1) value")).state, 'unconfigured');
  assert.equal((await value("select legislative_profile_highlights(64,'2025-01-01','2025-12-31',999) value")).state, 'missing');
  assert.equal((await value("select legislative_profile_highlights(64,'2025-01-01','2025-12-31',null,$1) value", [other])).state, 'unlinked');
  assert.equal((await value("select legislative_profile_highlights(64,'2026-01-01','2026-12-31',1) value")).votes.total, 0);
  await q('begin');
  await q(`with added as (insert into legislative_versions(source_id,kind,external_id,hash,payload,source_url)
    select $1,'votes',i,'highlight-test-'||i,jsonb_build_object('ballot_id',1,'parliamentarian_id',1,'choice',case i%3 when 0 then 'Sim' when 1 then 'Não' else 'Abstenção' end),
      'https://sapl.floresta.pe.leg.br/api/sessao/votoparlamentar/'||i||'/' from generate_series(100,159)i returning *)
    insert into legislative_run_items(run_id,source_id,kind,external_id,version_id) select $2,source_id,kind,external_id,id from added`, [source.id, run]);
  const manyVotes = await value("select legislative_profile_highlights(64,'2025-01-01','2025-12-31',1) value");
  assert.deepEqual(manyVotes.votes, { total: 61, yes: 21, no: 20, abstentions: 20, other: 0 }, 'The summary counts all votes beyond the 50-item preview');
  await q("delete from legislative_jobs where run_id=$1 and kind='votes'", [run]);
  const incompleteVotes = await value("select legislative_profile_highlights(64,'2025-01-01','2025-12-31',1) value");
  assert.equal(incompleteVotes.votes_complete, false);
  assert.equal(incompleteVotes.votes, null, 'Missing coverage cannot become zero votes');
  await q('rollback');
  const sessionMetrics = (await publicRpc('sessions', { start: '2025-01-01', end: '2025-12-31' })).session_metrics;
  assert.equal(sessionMetrics.total, 2);
  assert.deepEqual(sessionMetrics.months, [{ month: '2025-02', total: 1 }, { month: '2025-03', total: 1 }]);
  assert.equal(sessionMetrics.types.reduce((sum,row) => sum + row.total,0), 2);
  assert.equal(attendance.sessions, 2);
  const personAttendance = attendance.people.find(person => person.id === 1);
  assert.equal(personAttendance.presences, 1);
  assert.equal(personAttendance.justified, 1, 'Duplicate, conflicting, matter-only and out-of-period justifications cannot inflate session absences');
  assert.equal(personAttendance.conflicts, 1);
  assert.equal(personAttendance.unexcused, null, 'Missing presences are not unexcused absences');
  assert.equal(attendance.people.find(person => person.id === 2).justified, 0, 'A matter-only absence is not absence from a session');
  assert.equal((await attendanceRpc(1)).people.length, 1);
  assert.equal((await value("select legislative_attendance(65,'2025-01-01','2025-12-31') value")).state, 'unconfigured');
  await q('begin');
  await q("delete from legislative_jobs where run_id=$1 and kind='absence_justifications'", [run]);
  const legacyAttendance = await attendanceRpc();
  assert.equal(legacyAttendance.absence_complete, false);
  assert.equal(legacyAttendance.totals.justified, null, 'Old published snapshots have unknown absence coverage rather than zero absences');
  await q('rollback');
  let overview = await publicRpc('overview');assert.equal(overview.total, 4);assert.equal(overview.metrics.normative, 1);assert.equal(overview.metrics.requests, 3);
  assert.equal((await publicRpc('matters', { search: 'Matéria 2' })).total, 1);
  assert.equal((await publicRpc('matters', { start: '2025-02-03' })).total, 2);
  assert.equal((await publicRpc('parliamentarian', { parliamentarian_id: 1 })).total, 4, 'The official profile does not require an account/profile binding');
  assert.equal((await publicRpc('parliamentarian', { parliamentarian_id: 999 })).state, 'missing');
  assert.equal((await publicRpc('matters', { parliamentarian_id: 999 })).total, 0);
  assert.equal(Object.values(overview.groups).reduce((sum,n)=>sum+n,0),overview.total);
  assert.equal((await publicRpc('matters',{group_key:'leis'})).total,1);
  for (const [type,summary,expected] of [
    ['PLO','Denomina Maria de Souza a Rua 1.','homenagens'],
    ['REQ','Moção de pesar pelo falecimento.','homenagens'],
    ['MOC','Moção de repúdio à interrupção do serviço.','cobrancas'],
    ['REQ','Requer esclarecimentos e informações da obra.','cobrancas'],
    ['PLO','Autoriza obras de limpeza urbana.','leis'],
    ['PPROV','Solicita limpeza da Rua São José.','melhorias'],
    ['PAR','Parecer sobre denominação de rua.','outros'],
    ['AUT','Autógrafo sobre denominação da Rua 1.','outros']
  ]) assert.equal(await value('select legislative_group($1,$2) value',[type,summary]),expected);
  const place=await value('select legislative_place($1) value',['Solicita limpeza e poda na Rua São José, bairro Três Marias.']);
  assert.equal(place.street,'Rua São José');assert.equal(place.neighborhood,'Três Marias');assert.deepEqual(place.services,['poda','limpeza']);
  assert.equal((await value('select legislative_place($1) value',['Limpeza na Rua A e na Rua B.'])).street,null);
  assert.equal(await value('select legislative_text($1) value',['São José / TRÊS MARIAS']),'sao jose tres marias');
  const wrongCity = await rpc('legislative_decide', { p_city: 64, p_action: 'bind', p_data: { parliamentarian_id: 1, councilor_id: other } });assert.ok(wrongCity.error);
  const bind = await rpc('legislative_decide', { p_city: 64, p_action: 'bind', p_data: { parliamentarian_id: 1, councilor_id: councilor } });assert.ifError(bind.error);
  const created = await rpc('legislative_decide', {p_city:64,p_action:'bind',p_data:{parliamentarian_id:2,create:true}});assert.ifError(created.error);assert.ok(created.data.councilor_id);
  assert.equal(await value('select name value from councilors where id=$1',[created.data.councilor_id]),'Outra pessoa de teste');
  assert.ok((await rpc('legislative_decide',{p_city:64,p_action:'bind',p_data:{parliamentarian_id:2,councilor_id:councilor}})).error,'A profile cannot represent two distinct official parliamentarians');
  assert.equal((await publicRpc('councilor', { councilor_id: councilor })).total, 4);
  assert.equal((await publicRpc('councilor', { councilor_id: other })).state, 'unlinked');
  assert.equal((await publicRpc('overview', { search: 'Matéria 2' })).metrics.requests, 1);
  for (const id of [2, 3, 4]) {
    const matter = (await publicRpc('matter', { id })).matter;
    const annotation = await rpc('legislative_decide', { p_city: 64, p_action: 'classify', p_data: { matter_id: id, version_hash: matter.hash, topic: 'servicos_urbanos', location: id === 2 ? 'Rua de teste' : 'RUA DE TESTE', service: 'poda', note: 'Local e serviço conferidos no documento.' } });assert.ifError(annotation.error);
  }
  assert.equal((await publicRpc('recurrences')).groups[0].total, 3);
  const secondMatter=(await publicRpc('matter',{id:2})).matter;
  assert.ifError((await rpc('legislative_decide',{p_city:64,p_action:'classify',p_data:{matter_id:2,version_hash:secondMatter.hash,group_key:'cobrancas',location:'Rua São José',neighborhood:'Três Marias',service:'poda',note:'Revisão da categoria e do bairro no texto oficial.'}})).error);
  assert.equal((await publicRpc('matters',{territory:'sao jose'})).total,1);
  assert.equal((await publicRpc('matters',{territory:'TRES MARIAS',group_key:'cobrancas'})).total,1);
  assert.equal((await publicRpc('matter',{id:2})).matter.data.group_method,'revisado');
  await q(`insert into reports values($1,64,true,'approved','resolved',null,'TC-001'),($2,65,true,'approved','pending',null,'TC-002')`, [councilor, other]);
  await q('insert into pavement_streets values($1,64,$2)', [councilor, 'Rua de teste']);
  const firstMatter = (await publicRpc('matter', { id: 1 })).matter;
  const relatedData = { matter_id: 1, version_hash: firstMatter.hash, kind: 'report', target_id: councilor, note: 'Mesmo local, conforme conferência do documento.' };
  assert.ifError((await rpc('legislative_decide', { p_city: 64, p_action: 'relate', p_data: relatedData })).error);
  assert.ok((await rpc('legislative_decide', { p_city: 64, p_action: 'relate', p_data: { ...relatedData, target_id: other } })).error, 'Relations cannot cross city boundaries');
  assert.ok((await rpc('legislative_decide', { p_city: 64, p_action: 'relate', p_data: { ...relatedData, version_hash: 'old' } })).error, 'A changed document requires review');
  let related = (await publicRpc('matter', { id: 1 })).related;
  assert.equal(related[0].title, 'Bronca TC-001');assert.equal(related[0].status, 'resolved');
  await q('update reports set is_public=false where id=$1', [councilor]);
  assert.equal((await publicRpc('matter', { id: 1 })).related.length, 0, 'A newly private report disappears from public relations');
  await q('update reports set is_public=true,moderation_status=$2 where id=$1', [councilor, 'pending']);
  assert.equal((await publicRpc('matter', { id: 1 })).related.length, 0, 'Unapproved reports stay private');
  await q('update reports set moderation_status=$2 where id=$1', [councilor, 'approved']);
  assert.ifError((await rpc('legislative_decide', { p_city: 64, p_action: 'relate', p_data: { ...relatedData, kind: 'street' } })).error);
  assert.equal((await publicRpc('matter', { id: 1 })).related.length, 2);
  await rpc('legislative_decide', { p_city: 64, p_action: 'unrelate', p_data: { matter_id: 1, version_hash: firstMatter.hash, id: related[0].id } });
  assert.equal((await publicRpc('matter', { id: 1 })).related.length, 1);
  assert.equal((await publicRpc('matter', { id: 1 })).ballots[0].votes[0].choice, 'Sim');
  assert.equal((await publicRpc('session', { id: 1 })).attendance.length, 1);
  const activity = await value("select legislative_activity(64,$1,'2025-01-01','2025-12-31') value", [councilor]);
  assert.equal(activity.votes.total, 1);assert.equal(activity.attendance.total, 1);
  assert.equal(activity.votes.items[0].matter.id, 1);
  assert.equal(activity.votes.items[0].matter.type_abbreviation, 'PLO');
  assert.equal(activity.votes.items[0].matter.summary, 'Matéria 1');
  const missingVote = await value("select legislative_vote_context($1,$2) value", [run, JSON.stringify({ state:'ready', votes:{ items:[{id:9999,matter_id:9999}] } })]);
  assert.equal(missingVote.votes.items[0].matter, null);
  assert.equal(missingVote.votes.items[0].matter_url, 'https://sapl.floresta.pe.leg.br/materia/9999');
  assert.equal((await publicRpc('matter', { id: 999 })).state, 'missing');
  await q('set role anon');
  await assert.rejects(q('select * from legislative_versions'), /permission denied/);
  await assert.rejects(q("select legislative_records($1,'votes')", [run]), /permission denied/);
  await assert.rejects(q("select legislative_public_base(64)"), /permission denied/);
  await assert.rejects(q("select legislative_public_details(64)"), /permission denied/);
  await assert.rejects(q("select legislative_summary(64,'overview','{}')"), /permission denied/);
  await assert.rejects(q("select legislative_decide_base(64,'publish','{}')"), /permission denied/);
  await assert.rejects(q('select * from legislative_related_records'), /permission denied/);
  const anonymous = await publicRpc('overview');assert.equal(anonymous.total, 4);assert.ok(!JSON.stringify(anonymous).includes('not-public'));
  await q('reset role');await q("select set_config('test.uid',$1,false)", [citizen]);
  await assert.rejects(q('select legislative_admin(64)'), /Sem permissão/);
  await assert.rejects(q('select legislative_publish_run($1)', [run]), /Sem permissão/);
  await q("select legislative_report_error(64,1,'Uma correção precisa ser conferida.')");
  await q("select set_config('test.uid',$1,false)", [admin]);
  await assert.rejects(q('select legislative_set_daily(64,true)'), /agendador/);
  await assert.rejects(q("select legislative_configure_worker('https://xxdletrjyjajtrmhwzev.supabase.co/functions/v1/collect-legislative-data',repeat('x',32))"), /operador/);
  const next = await startLegislativeRun(bridge, source, admin);
  assert.equal(await startLegislativeRun(bridge, source, admin), next, 'Simultaneous start returns the same running job');
  assert.equal((await publicRpc('overview')).total, 4, 'Staging does not replace published records');
  await q("select set_config('test.role','service_role',false)");
  const fakeFetch = async url => {
    const endpoint = new URL(url);const job = buildSaplPlan(2025).find(j => endpoint.pathname === `/api/${j.path}/`);
    let rows = fixtures[job?.kind] || [];
    if (job?.kind === 'matters' && endpoint.searchParams.get('ano') !== '2025') rows = [];
    return new Response(JSON.stringify({ pagination: { page: 1, total_entries: rows.length, total_pages: rows.length ? 1 : 0, next_page: null }, results: rows }), { headers: { 'content-type': 'application/json' } });
  };
  const processed = await collectLegislativeSlice(bridge, next, { maxPages: 100, maxMs: 30000, requestDelayMs: 0, fetchImpl: fakeFetch });assert.deepEqual(processed.errors, []);
  assert.equal(await value('select status value from legislative_runs where id=$1', [next]), 'ready');
  assert.equal((await value('select summary value from legislative_runs where id=$1',[next])).quality.blocked,false);
  assert.equal((await publicRpc('overview')).source.run_id, run, 'Completed collection still requires first publication decision');
  const missingTypes = await rpc('legislative_begin_run', { p_source: source.id, p_plan: buildSaplPlan(2025) });assert.ifError(missingTypes.error);
  const claim = (await rpc('legislative_claim_job', { p_run: missingTypes.data })).data;
  await rpc('legislative_fail_job', { p_job: claim.id, p_token: claim.lease_token, p_error: 'Falha simulada', p_retry_after: null });
  assert.equal((await publicRpc('overview')).source.run_id, run, 'Failed collection preserves publication');
  assert.equal(Number(await value('select count(*) value from legislative_versions')), Object.values(fixtures).reduce((sum, rows) => sum + rows.length, 0), 'Identical collections reuse the same record versions');
  await q('update legislative_sources set auto_publish=true where id=$1',[source.id]);
  const partial=await startLegislativeRun(bridge,source,admin);
  const withoutAttendance=async url=>new URL(url).pathname.includes('sessaoplenariapresenca')
    ? new Response(JSON.stringify({pagination:{page:1,total_entries:0,total_pages:0,next_page:null},results:[]}),{headers:{'content-type':'application/json'}}) : fakeFetch(url);
  assert.deepEqual((await collectLegislativeSlice(bridge,partial,{maxPages:100,maxMs:30000,requestDelayMs:0,fetchImpl:withoutAttendance})).errors,[]);
  const blocked=await value('select summary value from legislative_runs where id=$1',[partial]);assert.equal(blocked.quality.blocked,true);
  assert.ok(blocked.quality.issues.some(issue=>issue.kind==='attendance'&&issue.missing===1));
  assert.equal((await publicRpc('overview')).source.run_id,run,'Suspicious but complete pages must not publish automatically');
  await assert.rejects(q('select legislative_publish_run($1)',[partial]),/conferência/);
  await q("select set_config('test.uid','',false)");
  await assert.rejects(q('select legislative_review_collection(64,$1,$2)',[partial,'Tentativa do worker sem identidade administrativa.']),/Sem permissão/);
  await q("select set_config('test.uid',$1,false)",[citizen]);await q("select set_config('test.role','authenticated',false)");
  await assert.rejects(q('select legislative_review_collection(64,$1,$2)',[partial,'Tentativa de cidadão sem permissão administrativa.']),/Sem permissão/);
  await q("select set_config('test.uid',$1,false)",[admin]);
  await q('select legislative_review_collection(64,$1,$2)',[partial,'Conferido na fonte oficial: registro removido e correção documentada.']);
  await q('select legislative_publish_run($1)',[partial]);assert.equal((await publicRpc('overview')).source.run_id,partial);
  const empty=await startLegislativeRun(bridge,source,admin);
  const emptyFetch=async()=>new Response(JSON.stringify({pagination:{page:1,total_entries:0,total_pages:0,next_page:null},results:[]}),{headers:{'content-type':'application/json'}});
  assert.ok((await collectLegislativeSlice(bridge,empty,{maxPages:100,maxMs:30000,requestDelayMs:0,fetchImpl:emptyFetch})).errors.length);
  assert.equal(await value('select status value from legislative_runs where id=$1',[empty]),'failed');
  assert.equal((await publicRpc('overview')).source.run_id,partial,'An empty source never replaces a valid publication');
  console.log(JSON.stringify({ migrations: migrations.length, atomicPublication: true, idempotency: true, privateSnapshots: true, cityIsolation: true, roles: true, classification: true, recurrences: true, reviewedRelations: true, pipeline: true, localDatabase: root }));
} finally { await client?.end();spawnSync(path.join(bin, 'pg_ctl.exe'), ['-D', cluster, 'stop', '-m', 'immediate', '-w'], { windowsHide: true, stdio: 'ignore' });server.kill(); }
