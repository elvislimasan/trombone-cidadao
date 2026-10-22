import fs from 'node:fs/promises';
import assert from 'node:assert/strict';

export async function validateResponsibilities({ db, ids, asUser, saved, check }) {
  await db.query('reset role');
  // Somente as tabelas territoriais estão reduzidas neste fixture. As ordens,
  // ofertas, validações e RPCs de execução acima são as migrações reais.
  await db.query(`
    alter table profiles add column user_type text default 'public_official', add column city_id bigint, add column is_ambassador boolean default false;
    update orgao_membros set ativo=true;
    update prefeitura_membros set ativo=true;
    create table permission_rules(scope text,role_name text,module text,allowed boolean,user_id uuid);
    create table urban_planner_cities(user_id uuid,city_id bigint,primary key(user_id,city_id));
    create table tree_manager_cities(user_id uuid,city_id bigint,canal_id uuid,granted_by uuid,primary key(user_id,city_id));
    create table prefeitura_convites(id uuid primary key default gen_random_uuid(),prefeitura_id uuid,canal_id uuid,email_convidado text,
      papel_prefeitura text,papel_orgao text,token uuid unique,status text default 'pendente',convidado_por uuid,
      aceito_por uuid,aceito_em timestamptz,expires_at timestamptz);
    create function public.tree_management_membership(p_user uuid,p_city bigint,p_channel uuid) returns boolean
      language sql stable security definer set search_path=public,pg_temp as $$
      select exists(select 1 from orgao_membros m join orgao_canais c on c.id=m.canal_id
        join prefeituras p on p.city_id=c.city_id and p.status='ativa'
        join prefeitura_membros pm on pm.prefeitura_id=p.id and pm.user_id=m.user_id and pm.ativo
        where m.user_id=p_user and m.canal_id=p_channel and m.ativo and c.ativo and c.city_id=p_city) $$;
  `);
  await db.query("insert into prefeitura_membros(prefeitura_id,user_id,papel,ativo) values($1,$2,'colaborador',true) on conflict(prefeitura_id,user_id) do update set ativo=true", [ids.pref, ids.reader]);
  await db.query("insert into orgao_membros(canal_id,user_id,papel,ativo) values($1,$2,'leitura',true) on conflict(canal_id,user_id) do update set ativo=true", [ids.channel, ids.reader]);
  for (const number of [371, 372, 373, 374, 375, 376]) {
    const file = (await fs.readdir('supabase/migrations')).find(name => name.startsWith(number + '_'));
    await db.query(await fs.readFile('supabase/migrations/' + file, 'utf8'));
  }
  const memberId = (await db.query('select id from orgao_membros where user_id=$1 and canal_id=$2', [ids.reader, ids.channel])).rows[0].id;
  const electricianId = (await db.query('select id from orgao_membros where user_id=$1 and canal_id=$2', [ids.operator, ids.channel])).rows[0].id;
  const access = async (member, attendance, specialties = []) => {
    await asUser(ids.admin);
    const version = (await db.query('select versao from orgao_membro_acessos where membro_id=$1', [member])).rows[0].versao;
    const cargos = [...(attendance === 'nenhum' ? [] : [attendance === 'atendente' ? 'atendente' : attendance]), ...(specialties.length ? ['executor'] : [])];
    await db.query('select set_municipal_staff_roles($1,$2,true,$3)', [member, cargos, version]);
  };
  const draft = '60000000-0000-0000-0000-000000000101';
  await check('RPC real permite rascunho, mas bloqueia despacho pelo atendente', async () => {
    await access(memberId, 'atendente');
    await asUser(ids.reader);
    const result = await saved(draft, { titulo: 'Rascunho do atendimento', canal_id: ids.channel, category_id: 'iluminacao', status: 'rascunho' });
    assert.equal(result.status, 'rascunho');
    await assert.rejects(saved(draft, { status: 'programada', previsto_em: new Date().toISOString() }), error => ['P0001', '42501'].includes(error.code));
  });
  const order = '60000000-0000-0000-0000-000000000102';
  const report = '40000000-0000-0000-0000-000000000102';
  await check('executor exclusivo recebe atividade elétrica no workspace sem leitura de atendimento', async () => {
    await access(electricianId, 'nenhum', ['eletricista']);
    await asUser(ids.operator);
    const workspace = (await db.query('select municipal_workspace_access() result')).rows[0].result;
    assert.equal(workspace.actor_user_id, ids.operator);
    const effective = workspace.accesses.find(row => row.canal_id === ids.channel);
    assert.ok(workspace.memberships.some(row => row.prefeitura.id === ids.pref));
    assert.equal(effective.atendimento, 'nenhum');
    assert.ok(effective.cargos.includes('executor'));
    assert.deepEqual(effective.especialidades_execucao, ['eletricista']);
    assert.equal((await db.query("select municipal_channel_action($1,$2,'read') allowed", [ids.operator, ids.channel])).rows[0].allowed, false);
  });
  await check('gestor prepara ordem sem poder declarar execução técnica', async () => {
    await asUser(ids.admin);
    await db.query('reset role');
    await db.query(`insert into reports(id,city_id,category_id,title,location,pole_id,status) values($1,1,'iluminacao','Solicitação nova',point(-8.6,-38.5),1,'pending')`, [report]);
    // A cidade do fixture vem da prefeitura existente.
    await db.query('update reports set city_id=(select city_id from prefeituras where id=$1) where id=$2', [ids.pref, report]);
    await asUser(ids.admin);
    const result = await saved(order, { titulo: 'Serviço para execução', category_id: 'iluminacao', canal_id: ids.channel, status: 'aberta' }, { reports: [report] });
    assert.equal(result.status, 'aberta');
    await assert.rejects(saved(order, { status: 'em_andamento' }, { reports: [report] }), /executor|execução/);
  });
  await check('gestor com execução acumulada conserva as ofertas e assume ordem', async () => {
    await access(electricianId, 'gestor', ['eletricista']);
    await asUser(ids.operator);
    const page = (await db.query("select listar_painel_eletricista($1,'disponiveis','fazer','Serviço para execução') result", [ids.pref])).rows[0].result;
    assert.ok(JSON.stringify(page).includes(order), 'Papel de gestor ocultou a oferta de execução');
    const accepted = (await db.query("select aceitar_oferta_eletricista($1,'ordem',$2) id", [ids.pref, order])).rows[0].id;
    assert.equal(accepted, order);
  });
  await check('RPC real conclui a solicitação pelo executor atribuído', async () => {
    await asUser(ids.operator);
    const version = (await db.query('select versao from demandas_municipais where id=$1', [order])).rows[0].versao;
    const pole = (await db.query('select updated_at::text from poles where id=1')).rows[0];
    const result = (await db.query('select atender_solicitacao_ordem_eletricista($1,$2,$3,$4,1,$5,$6,$7) result', [ids.pref, order, report, version, pole.updated_at,
      JSON.stringify({ identifier: 'P001', lamp_type: 'LED', lamp_power_w: 50, lamp_count: 1, service_type: 'lamp_replacement', service_types: ['lamp_replacement'], resultado: 'Lâmpada substituída.' }), '[]'])).rows[0].result;
    assert.equal(result.status, 'concluida');
    assert.equal((await db.query('select status from reports where id=$1', [report])).rows[0].status, 'resolved');
  });
  const reviewOrder = '60000000-0000-0000-0000-000000000104';
  const reviewReport = '40000000-0000-0000-0000-000000000104';
  await check('conferência configurada exige outro gestor e preserva o executor', async () => {
    await asUser(ids.admin);
    const rules = (await db.query('select * from prefeitura_servico_regras where prefeitura_id=$1', [ids.pref])).rows;
    if (!rules.some(rule => rule.category_id === 'iluminacao')) rules.push({ category_id: 'iluminacao', prioridade: 'normal' });
    await db.query('select salvar_configuracao_atendimento($1,$2)', [ids.pref, JSON.stringify(rules.map(rule => ({ ...rule, conferir_execucao: true })))]);
    assert.equal((await db.query("select conferir_execucao from prefeitura_servico_regras where prefeitura_id=$1 and category_id='iluminacao'", [ids.pref])).rows[0].conferir_execucao, true);
    await db.query('reset role');
    await db.query("insert into reports(id,city_id,category_id,title,location,pole_id,status) select $1,city_id,'iluminacao','Serviço com conferência',point(-8.6,-38.5),1,'pending' from prefeituras where id=$2", [reviewReport, ids.pref]);
    await asUser(ids.admin);
    await saved(reviewOrder, { titulo: 'Serviço com conferência', category_id: 'iluminacao', canal_id: ids.channel, status: 'aberta', atribuido_a: ids.operator }, { reports: [reviewReport] });
    await asUser(ids.operator);
    await saved(reviewOrder, { status: 'em_andamento' }, { reports: [reviewReport] });
    const version = (await db.query('select versao from demandas_municipais where id=$1', [reviewOrder])).rows[0].versao;
    const pole = (await db.query('select updated_at::text from poles where id=1')).rows[0];
    const executed = (await db.query('select atender_solicitacao_ordem_eletricista($1,$2,$3,$4,1,$5,$6,$7) result', [ids.pref, reviewOrder, reviewReport, version, pole.updated_at,
      JSON.stringify({ identifier: 'P001', lamp_type: 'LED', lamp_power_w: 50, lamp_count: 1, service_type: 'lamp_replacement', service_types: ['lamp_replacement'], resultado: 'Serviço executado para conferência.' }), '[]'])).rows[0].result;
    assert.equal(executed.status, 'aguardando_confirmacao');
    const current = (await db.query('select versao from demandas_municipais where id=$1', [reviewOrder])).rows[0].versao;
    await assert.rejects(db.query('select conferir_ordem_municipal($1,$2,$3,$4)', [ids.pref, reviewOrder, current, 'Conferência do próprio executor.']), /outro gestor/);
    await asUser(ids.admin);
    await assert.rejects(saved(reviewOrder, { status: 'concluida' }, { reports: [reviewReport] }), /conferência/);
    const reviewed = (await db.query('select conferir_ordem_municipal($1,$2,$3,$4) result', [ids.pref, reviewOrder, current, 'Execução conferida pelo gestor.'])).rows[0].result;
    assert.equal(reviewed.status, 'concluida');
    assert.equal((await db.query('select executada_por from demandas_municipais where id=$1', [reviewOrder])).rows[0].executada_por, ids.operator);
  });
  await check('Agricultura herda arborização, sem postes nem execução elétrica', async () => {
    await access(memberId, 'leitura');
    await db.query('reset role');
    await db.query("update orgao_membro_acessos set cargos=array['leitura'] where membro_id in (select id from orgao_membros where user_id=$1)", [ids.reader]);
    const channel = '30000000-0000-0000-0000-000000000103';
    await db.query("insert into orgao_canais(id,city_id,nome,ativo,municipal_modules) select $1,city_id,'Agricultura',true,array['arborization'] from prefeituras where id=$2", [channel, ids.pref]);
    const member = (await db.query("insert into orgao_membros(canal_id,user_id,papel,ativo) values($1,$2,'leitura',true) returning id", [channel, ids.reader])).rows[0].id;
    await asUser(ids.admin);
    await db.query("select set_municipal_staff_roles($1,array['gestor'],true,0)", [member]);
    await asUser(ids.reader);
    assert.equal((await db.query("select municipal_channel_action($1,$2,'lighting') allowed", [ids.reader, channel])).rows[0].allowed, false);
    const city = (await db.query('select city_id from prefeituras where id=$1', [ids.pref])).rows[0].city_id;
    assert.equal((await db.query('select pode_gerenciar_arborizacao($1) allowed', [city])).rows[0].allowed, true);
    assert.equal((await db.query("select municipal_city_action($1,$2,'lighting') allowed", [ids.reader, city])).rows[0].allowed, false);
    assert.equal((await db.query('select eletricista_ativo_municipio($1,$2) allowed', [ids.reader, city])).rows[0].allowed, false);
  });
  const { validateExecutor } = await import('./municipal-executor-flow-cases.mjs');
  await validateExecutor({ db, ids, asUser, saved, check });
  const { validateMunicipalReportInsert } = await import('./municipal-report-insert-flow-cases.mjs');
  await validateMunicipalReportInsert({ db, ids, asUser, check });
}
