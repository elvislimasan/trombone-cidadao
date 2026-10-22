import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import pg from 'pg';

export async function validateExecutor({ db, ids, asUser, saved, check }) {
  await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");
  await db.query(`create table city_trees(id uuid primary key,city_id bigint,common_name text,status text default 'saudavel');
    alter table orgao_canais add column email text,add column emails_copia text[],add column reply_to text,add column criado_por uuid;
    create table city_tree_care(id uuid primary key default gen_random_uuid(),tree_id uuid,service_type text,performed_on date,notes text,recorded_by uuid,created_at timestamptz default now());
    create table pavement_streets(id uuid primary key,city_id bigint,name text);
    grant select on city_tree_care to authenticated;
    alter table reports add column tree_id uuid,add column tree_service text;
    insert into categories values('poda','Poda'),('buracos','Buracos'),('limpeza','Limpeza') on conflict do nothing;
    update prefeituras set categorias_habilitadas=array['iluminacao','poda','buracos','limpeza'] where id='${ids.pref}';`);
  for (const number of [377,378,379,380,381,382]) {
    const file=(await fs.readdir('supabase/migrations')).find(name=>name.startsWith(number+'_'));
    await db.query(await fs.readFile('supabase/migrations/'+file,'utf8'));
  }
  const agri='30000000-0000-0000-0000-000000000103';
  const tree='90000000-0000-0000-0000-000000000101';
  const report='40000000-0000-0000-0000-000000000201';
  const second='40000000-0000-0000-0000-000000000202';
  const order='60000000-0000-0000-0000-000000000201';
  await asUser(ids.admin);
  const version=(await db.query('select access_version from orgao_canais where id=$1',[agri])).rows[0].access_version;
  await db.query("select salvar_secretaria_execucao($1,1,$2,array['poda'],array['arborization'],$3)", [agri,JSON.stringify({nome:'Agricultura',email:'agri@municipio.gov.br',reply_to:'agri@municipio.gov.br'}),version]);
  await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");
  await db.query("insert into prefeitura_membros(prefeitura_id,user_id,papel,ativo) values($1,$2,'colaborador',true) on conflict(prefeitura_id,user_id) do update set ativo=true",[ids.pref,ids.other]);
  const member=(await db.query("insert into orgao_membros(canal_id,user_id,papel,ativo) values($1,$2,'leitura',true) returning id",[agri,ids.other])).rows[0].id;
  await db.query("insert into city_trees(id,city_id,common_name) values($1,1,'Ipê')",[tree]);
  for(const id of [report,second]) await db.query("insert into reports(id,city_id,category_id,title,location,tree_id,tree_service,status,is_public,moderation_status,created_by_municipality) values($1,1,'poda','Poda da praça',point(-8.6,-38.5),$2,'poda','pending',false,'internal',$3)",[id,tree,ids.pref]);
  await asUser(ids.admin);
  await db.query("select set_municipal_staff_roles($1,array['executor'],true,0)",[member]);
  await check('executor de Agricultura herda arborização, categorias corretas e nenhum poder elétrico',async()=>{
    await asUser(ids.other);
    const w=(await db.query('select municipal_execution_workspace() value')).rows[0].value;
    assert.deepEqual(w.execution_activities.filter(a=>a.canal_id===agri).map(a=>a.specialty),['arborizacao']);
    assert.equal((await db.query("select municipal_channel_action($1,$2,'execute') allowed",[ids.other,agri])).rows[0].allowed,false);
    const page=(await db.query("select listar_painel_executor($1,'arborizacao',$2,'disponiveis') value",[ids.pref,agri])).rows[0].value;
    assert.ok(page.items.some(r=>r.id===report));
    assert.ok(page.items.every(r=>r.category_id==='poda'));
    await assert.rejects(db.query("select aceitar_servico_executor($1,'arborizacao','ordem',$2)",[ids.pref,ids.order]),/acesso/);
  });
  await check('gestor cria ordem de arborização com executor e duas solicitações',async()=>{
    await asUser(ids.admin);
    await saved(order,{titulo:'Poda com duas solicitações',category_id:'poda',canal_id:agri,execution_specialty:'arborizacao',status:'aberta',atribuido_a:ids.other},{reports:[report,second]});
    await asUser(ids.other);
    const detail=(await db.query("select detalhar_ordem_executor($1,$2,'arborizacao') value",[ids.pref,order])).rows[0].value;
    assert.equal(detail.reports.length,2);assert.ok(detail.reports.every(r=>r.latitude!=null&&r.longitude!=null));
    const listing=(await db.query("select listar_painel_executor($1,'arborizacao',$2) value",[ids.pref,agri])).rows[0].value;assert.ok(listing.items.find(r=>r.id===order)?.latitude!=null,'Ordem perdeu coordenadas das solicitações vinculadas');
    await assert.rejects(db.query("select detalhar_ordem_executor($1,$2,'ruas') value",[ids.pref,order]),/atividade/);
  });
  const record=async(action,reportId,operation,data={})=>{
    const version=(await db.query('select versao from demandas_municipais where id=$1',[order])).rows[0].versao;
    return (await db.query("select registrar_execucao_executor($1,$2,'arborizacao',$3,$4,$5,$6,$7) value",[ids.pref,order,version,operation,action,reportId,JSON.stringify(data)])).rows[0].value;
  };
  await check('início, impedimento e execução parcial preservam a outra solicitação',async()=>{
    await record('iniciar',null,'a0000000-0000-0000-0000-000000000001');
    await record('impedimento',null,'a0000000-0000-0000-0000-000000000002',{resultado:'Aguardando isolamento da área.'});
    const result=await record('concluir',report,'a0000000-0000-0000-0000-000000000003',{service_types:['poda'],resultado:'Galhos removidos com segurança.',registro_execucao:'Área isolada e resíduos recolhidos pela equipe.'});
    assert.equal(result.status,'em_andamento');
    assert.equal((await db.query('select status from reports where id=$1',[second])).rows[0].status,'pending');
    assert.equal((await db.query('select count(*)::int total from city_tree_care')).rows[0].total,1);
  });
  await check('repetição não duplica cuidados; versão antiga e serviço elétrico são rejeitados',async()=>{
    const data={service_types:['poda'],resultado:'Galhos removidos com segurança.',registro_execucao:'Área isolada e resíduos recolhidos pela equipe.'};
    assert.equal((await record('concluir',report,'a0000000-0000-0000-0000-000000000003',data)).repeated,true);
    assert.equal((await db.query('select count(*)::int total from city_tree_care')).rows[0].total,1);
    await assert.rejects(record('concluir',second,'a0000000-0000-0000-0000-000000000004',{...data,service_types:['lamp_replacement']}),/serviços válidos/);
    await assert.rejects(db.query("select registrar_execucao_executor($1,$2,'arborizacao',1,gen_random_uuid(),'impedimento',null,'{\"resultado\":\"Falha de versão\"}')",[ids.pref,order]),/ordem mudou/);
    const result=await record('concluir',second,'a0000000-0000-0000-0000-000000000005',data);
    assert.equal(result.status,'concluida');
  });
  await check('escrita direta e RPC antiga não substituem resultado técnico auditado',async()=>{
    await asUser(ids.admin);await saved(order,{status:'triagem'},{reports:[report,second],reason:'Nova vistoria solicitada pelo gestor.'});
    await asUser(ids.other);
    assert.equal((await db.query('select status from reports where id=$1',[report])).rows[0].status,'in-progress');
    await assert.rejects(saved(order,{status:'concluida'},{reports:[report,second]}),/painel do executor|secretaria que você pode operar/);
    await assert.rejects(db.query("update demandas_municipais set status='concluida' where id=$1",[order]),/painel do executor|permission denied/);
    await record('iniciar',null,'a0000000-0000-0000-0000-000000000006');
    await record('concluir',report,'a0000000-0000-0000-0000-000000000007',{service_types:['vistoria']});
    const optional=(await db.query('select result,technical_note from municipal_execution_results where id=$1',["a0000000-0000-0000-0000-000000000007"])).rows[0];
    assert.equal(optional.result,'');assert.equal(optional.technical_note,null);
    assert.equal((await db.query('select count(*)::int total from city_tree_care')).rows[0].total,3);
    assert.ok((await db.query('select notes from city_tree_care')).rows.every(row=>!row.notes.includes('Equipe')),'Nota interna vazou para cuidados públicos');
  });
  await check('oferta de Poda aceita uma única atribuição e mantém a secretaria',async()=>{
    await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");
    const offer='40000000-0000-0000-0000-000000000203';
    await db.query("insert into reports(id,city_id,category_id,title,location,tree_id,status,is_public,moderation_status,created_by_municipality) values($1,1,'poda','Poda em oferta',point(-8.6,-38.5),$2,'pending',false,'internal',$3)",[offer,tree,ids.pref]);
    await asUser(ids.other);
    const accepted=(await db.query("select aceitar_servico_executor($1,'arborizacao','solicitacao',$2,$3) id",[ids.pref,offer,agri])).rows[0].id;
    assert.equal((await db.query("select aceitar_servico_executor($1,'arborizacao','solicitacao',$2,$3) id",[ids.pref,offer,agri])).rows[0].id,accepted);
    assert.equal((await db.query('select canal_id from demandas_municipais where id=$1',[accepted])).rows[0].canal_id,agri);
    await asUser(ids.admin);const otherMember=(await db.query('select m.id,a.versao from orgao_membros m join orgao_membro_acessos a on a.membro_id=m.id where m.canal_id=$1 and m.user_id=$2',[agri,ids.reader])).rows[0];
    await db.query("select set_municipal_staff_roles($1,array['gestor','executor'],true,$2)",[otherMember.id,otherMember.versao]);
    await asUser(ids.reader);
    await assert.rejects(db.query("select aceitar_servico_executor($1,'arborizacao','solicitacao',$2,$3)",[ids.pref,offer,agri]),/já assumida/);
    await assert.rejects(db.query("select detalhar_ordem_executor($1,$2,'arborizacao')",[ids.pref,accepted]),/atribuição/);
  });
  await check('aceites concorrentes em duas conexões têm um vencedor e uma única ordem',async()=>{
    await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");
    const offer='40000000-0000-0000-0000-000000000206';
    await db.query("insert into reports(id,city_id,category_id,title,location,tree_id,status,is_public,moderation_status) values($1,1,'poda','Oferta concorrente',point(-8.6,-38.5),$2,'pending',true,'approved')",[offer,tree]);
    const config=db.connectionParameters;
    const clients=[ids.other,ids.reader].map(()=>new pg.Client({host:config.host,port:config.port,user:config.user,password:config.password,database:config.database}));
    try {
      for(let i=0;i<clients.length;i++){await clients[i].connect();await clients[i].query("select set_config('request.jwt.claim.sub',$1,false)",[[ids.other,ids.reader][i]]);await clients[i].query('set role authenticated');}
      const results=await Promise.allSettled(clients.map(client=>client.query("select aceitar_servico_executor($1,'arborizacao','solicitacao',$2,$3) id",[ids.pref,offer,agri])));
      assert.equal(results.filter(result=>result.status==='fulfilled').length,1);
      assert.equal(results.find(result=>result.status==='rejected').reason.code,'23505');
      assert.equal((await db.query('select count(*)::int count from demanda_broncas where report_id=$1',[offer])).rows[0].count,1);
    } finally {await Promise.all(clients.map(client=>client.end()));}
  });
  await check('ruas e qualquer categoria sem mapa possuem executor com evidência privada e conferência',async()=>{
    await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");
    const roads='30000000-0000-0000-0000-000000000104', general='30000000-0000-0000-0000-000000000105';
    for(const [channel,category,modules] of [[roads,'buracos',['urban_planning']],[general,'limpeza',[]]]) {
      await db.query("insert into orgao_canais(id,city_id,nome,ativo,municipal_modules) values($1,1,'Secretaria sem nome de especialidade',true,$2)",[channel,modules]);
      await db.query('insert into orgao_categorias(canal_id,city_id,category_id) values($1,1,$2)',[channel,category]);
      const m=(await db.query("insert into orgao_membros(canal_id,user_id,papel,ativo) values($1,$2,'leitura',true) returning id",[channel,ids.other])).rows[0].id;
      await asUser(ids.admin);await db.query("select set_municipal_staff_roles($1,array['executor'],true,0)",[m]);await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");
    }
    await asUser(ids.other);
    const w=(await db.query('select municipal_execution_workspace() value')).rows[0].value;
    assert.ok(w.execution_activities.some(a=>a.canal_id===roads&&a.specialty==='ruas'));
    assert.ok(w.execution_activities.some(a=>a.canal_id===general&&a.specialty==='servicos_gerais'&&a.category_ids.includes('limpeza')));
    assert.equal((await db.query("select field_executor_can_work($1,$2,'servicos_gerais',null) allowed",[ids.other,general])).rows[0].allowed,false);
    await asUser(ids.admin);
    const standalone='60000000-0000-0000-0000-000000000204';
    await saved(standalone,{titulo:'Limpeza da praça',category_id:'limpeza',canal_id:general,status:'aberta'});
    await asUser(ids.other);await assert.rejects(db.query("select aceitar_servico_executor($1,'ruas','ordem',$2,$3)",[ids.pref,standalone,roads]),/acesso/);
    await db.query("select aceitar_servico_executor($1,'servicos_gerais','ordem',$2,$3)",[ids.pref,standalone,general]);
    await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");await db.query("insert into prefeitura_servico_regras(prefeitura_id,category_id,conferir_execucao) values($1,'limpeza',true) on conflict(prefeitura_id,category_id) do update set conferir_execucao=true",[ids.pref]);
    const operation='a0000000-0000-0000-0000-000000000009';
    const path=ids.pref+'/'+ids.other+'/'+operation+'/foto.jpg';
    await db.query("insert into storage.objects(bucket_id,name) values('municipal-demand-files',$1)",[path]);await asUser(ids.other);
    const version=(await db.query('select versao from demandas_municipais where id=$1',[standalone])).rows[0].versao;
    const result=(await db.query("select registrar_execucao_executor($1,$2,'servicos_gerais',$3,$4,'concluir',null,$5,$6) value",[ids.pref,standalone,version,operation,JSON.stringify({service_types:['limpeza'],resultado:'Limpeza concluída e resíduos recolhidos.'}),JSON.stringify([{storage_path:path,mime_type:'image/jpeg',nome:'Foto da limpeza',tamanho:10}])])).rows[0].value;
    assert.equal(result.status,'aguardando_confirmacao');
    assert.equal((await db.query('select visibilidade from demanda_anexos where demanda_id=$1',[standalone])).rows[0].visibilidade,'interna');
    await assert.rejects(db.query('select conferir_ordem_municipal($1,$2,$3,$4)',[ids.pref,standalone,result.versao,'Conferindo minha própria execução.']),/outro gestor/);
    await asUser(ids.admin);await db.query('select conferir_ordem_municipal($1,$2,$3,$4)',[ids.pref,standalone,result.versao,'Conferência da execução aprovada.']);
    assert.equal((await db.query('select executada_por from demandas_municipais where id=$1',[standalone])).rows[0].executada_por,ids.other);
    await asUser(ids.other);const stats=(await db.query("select estatisticas_executor($1,'servicos_gerais',$2) value",[ids.pref,general])).rows[0].value;assert.equal(stats.completed,1);assert.equal(stats.ranking[0].user_id,ids.other);assert.equal(stats.services[0].total,1);
    assert.equal((await db.query("select estatisticas_executor($1,'servicos_gerais',$2) value",[ids.otherPref,general])).rows[0].value.completed,0);
  });
  await check('suspensão bloqueia detalhe, fila e escrita na próxima chamada',async()=>{
    await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");await db.query('update orgao_membros set ativo=false where id=$1',[member]);await asUser(ids.other);
    await assert.rejects(db.query("select detalhar_ordem_executor($1,$2,'arborizacao')",[ids.pref,order]),/atividade/);
    assert.equal((await db.query("select listar_painel_executor($1,'arborizacao',$2) value",[ids.pref,agri])).rows[0].value.total,0);
  });
}
