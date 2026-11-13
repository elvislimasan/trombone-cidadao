import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

// Usa as migrações e o banco descartável dos testes de responsabilidades.
export async function validateStaffModules({ db, ids, asUser, check }) {
  await db.query("reset role;select set_config('request.jwt.claim.sub','',false)");
  await db.query(`
    create table auth.users(id uuid primary key,raw_app_meta_data jsonb default '{}',email text);
    insert into auth.users(id) select id from profiles;
    create table municipal_account_setup(user_id uuid primary key,created_by uuid,password_expires_at timestamptz default now()+interval '1 day');
    alter table profiles add column phone text,add column state_id bigint;
    alter table cities add column state_id bigint;
    alter table orgao_canais add column ativado_por uuid,add column ativado_em timestamptz;
  `);
  for (const number of [383,384,385]) {
    const file=(await fs.readdir('supabase/migrations')).find(name=>name.startsWith(number+'_'));
    await db.query(await fs.readFile('supabase/migrations/'+file,'utf8'));
  }
  const provisioning = await fs.readFile('supabase/migrations/391_municipal_temporary_access.sql','utf8');
  for(const name of ['validate_municipal_provisioning','provision_municipal_account']) {
    const definition=provisioning.match(new RegExp(`create function public\\.${name}\\([\\s\\S]*?end \\$\\$;`,'i'))?.[0];
    assert.ok(definition,name);await db.query(definition);
  }
  await db.query(await fs.readFile('supabase/migrations/415_operacao_pipa.sql','utf8'));
  const oid=(await db.query("select 'public.pipa_can(uuid,text)'::regprocedure::oid oid")).rows[0].oid;
  await db.query(await fs.readFile('supabase/migrations/426_municipal_staff_modules.sql','utf8'));
  assert.equal((await db.query("select 'public.pipa_can(uuid,text)'::regprocedure::oid oid")).rows[0].oid,oid,'Políticas RLS precisam manter o predicado atualizado');
  const channel=randomUUID(), sibling=randomUUID(), staff=randomUUID(), otherStaff=randomUUID();
  await db.query("insert into profiles(id,name,user_type,city_id) values($1,'Equipe Agricultura','public_official',1),($2,'Outro funcionário','public_official',1)",[staff,otherStaff]);
  await db.query('insert into auth.users(id) values($1),($2)',[staff,otherStaff]);
  await db.query("insert into prefeitura_membros(prefeitura_id,user_id,papel,ativo) values($1,$2,'colaborador',true),($1,$3,'colaborador',true)",[ids.pref,staff,otherStaff]);
  await db.query("insert into orgao_canais(id,city_id,nome,ativo,municipal_modules) values($1,1,'Agricultura e abastecimento',true,array['arborization','water_supply']),($2,1,'Outra secretaria de água',true,array['water_supply'])",[channel,sibling]);
  await db.query("insert into orgao_categorias(city_id,category_id,canal_id) values(1,'poda',$1)",[channel]);
  await asUser(ids.admin);
  const assigned=(await db.query("select municipal_assign_public_official_modules($1,$2,$3,array['gestor','executor'],array[]::text[]) result",[ids.pref,channel,staff])).rows[0].result;
  await db.query("select municipal_assign_public_official_modules($1,$2,$3,array['gestor'],array[]::text[])",[ids.pref,sibling,staff]);
  await db.query("select municipal_assign_public_official_modules($1,$2,$3,array['gestor'],array[]::text[])",[ids.pref,channel,otherStaff]);
  const member=assigned.member_id;
  const set = async modules => {
    await asUser(ids.admin);
    const version=(await db.query('select versao from orgao_membro_acessos where membro_id=$1',[member])).rows[0].versao;
    await db.query("select set_municipal_staff_access($1,array['gestor','executor'],true,$2,$3)",[member,version,modules]);
    return version;
  };
  const scalar=async(sql,args)=>(await db.query(sql,args)).rows[0].value;
  await check('funcionário herda Arborização e Pipa, inclusive nas políticas RLS reais',async()=>{
    await asUser(staff);
    assert.equal(await scalar("select pipa_can($1,'manage') value",[channel]),true);
    assert.equal(await scalar("select municipal_inventory_action($1,1,'arborization') value",[staff]),true);
    assert.equal(await scalar("select field_executor_can_work($1,$2,'arborizacao','poda') value",[staff,channel]),true);
    assert.ok((await db.query('select pipa_access(1) value')).rows[0].value.some(row=>row.id===channel));
  });
  await check('desativar Pipa bloqueia RPC e RLS sem remover Arborização nem outra secretaria',async()=>{
    await asUser(ids.admin);
    const tank={channel_id:channel,name:'Tanque Agricultura',locality:'Zona rural',latitude:-8.6,longitude:-38.5,capacity_liters:10000,provider:'prefeitura',responsible_name:'Maria da Silva',responsible_document:'52998224725',responsible_phone:'87999999999',responsible_address:'Rua do tanque, 10'};
    await db.query('select pipa_save_tank($1)',[tank]);
    await set(['water_supply']);await asUser(staff);
    assert.equal(await scalar("select pipa_can($1,'read') value",[channel]),false);
    assert.equal(await scalar("select pipa_can($1,'manage') value",[sibling]),true);
    assert.equal(await scalar("select municipal_inventory_action($1,1,'arborization') value",[staff]),true);
    assert.equal((await db.query('select * from pipa_tanks where channel_id=$1',[channel])).rowCount,0);
    await assert.rejects(db.query('select pipa_save_tank($1)',[tank]),/permiss|acesso/i);
    assert.ok(!(await db.query('select pipa_access(1) value')).rows[0].value.some(row=>row.id===channel));
    await asUser(otherStaff);assert.equal(await scalar("select pipa_can($1,'manage') value",[channel]),true);
  });
  await check('desativar Arborização bloqueia inventário, pedidos e execução e preserva Pipa',async()=>{
    await set(['arborization']);await asUser(staff);
    assert.equal(await scalar("select municipal_inventory_action($1,1,'arborization') value",[staff]),false);
    assert.equal(await scalar("select field_executor_can_work($1,$2,'arborizacao','poda') value",[staff,channel]),false);
    assert.equal(await scalar("select municipal_channel_action($1,$2,'read') value",[staff,channel]),false);
    assert.equal(await scalar('select can_manage_tree_adoption(1) value'),false);
    assert.equal(await scalar('select can_dispatch_tree_adoption(1) value'),false);
    assert.equal(await scalar("select pipa_can($1,'manage') value",[channel]),true);
    const workspace=(await db.query('select municipal_execution_workspace() value')).rows[0].value;
    assert.ok(!workspace.inventory_views.some(row=>row.canal_id===channel));
    assert.ok(!workspace.inventories.some(row=>row.canal_id===channel));
    assert.ok(!workspace.category_channels.some(row=>row.canal_id===channel));
    assert.ok(!workspace.execution_activities.some(row=>row.canal_id===channel));
    assert.equal(workspace.accesses.find(row=>row.canal_id===channel).atendimento,'nenhum');
    assert.deepEqual(workspace.accesses.find(row=>row.canal_id===channel).especialidades_execucao,[]);
  });
  await check('todos os módulos podem ser pausados e a herança pode ser restaurada',async()=>{
    await set(['arborization','water_supply']);await asUser(staff);
    assert.equal(await scalar("select pipa_can($1,'read') value",[channel]),false);
    assert.equal(await scalar("select municipal_inventory_action($1,1,'arborization') value",[staff]),false);
    await set([]);await asUser(staff);
    assert.equal(await scalar("select pipa_can($1,'read') value",[channel]),true);
    assert.equal(await scalar("select municipal_inventory_action($1,1,'arborization') value",[staff]),true);
  });
  await check('módulo bloqueado não reaparece por outra categoria da mesma secretaria',async()=>{
    await db.query('reset role');
    await db.query("insert into orgao_categorias(city_id,category_id,canal_id) values(1,'limpeza',$1)",[channel]);
    const report=randomUUID();
    await asUser(staff);
    await db.query("insert into reports(id,city_id,category_id,title,author_id,is_public,moderation_status,created_by_municipality) values($1,1,'poda','Solicitação privada de árvore',$2,false,'internal',$3) returning id",[report,staff,ids.pref]);
    await set(['arborization']);await asUser(staff);
    assert.equal(await scalar("select municipal_channel_action($1,$2,'read') value",[staff,channel]),true,'Limpeza continua acessível');
    assert.equal(await scalar('select municipal_report_access($1,$2) value',[staff,report]),false);
    assert.equal((await db.query('select * from reports where id=$1',[report])).rowCount,0);
    await assert.rejects(db.query("insert into reports(id,city_id,category_id,title,author_id,is_public,moderation_status,created_by_municipality) values($1,1,'poda','Pedido indevido',$2,false,'internal',$3)",[randomUUID(),staff,ids.pref]),/módulo|acesso/);
    const workspace=(await db.query('select municipal_execution_workspace() value')).rows[0].value;
    assert.ok(workspace.category_channels.some(row=>row.canal_id===channel&&row.category_id==='limpeza'));
    assert.ok(!workspace.category_channels.some(row=>row.canal_id===channel&&row.category_id==='poda'));
  });
  await check('controle individual exige administrador, versão atual e módulos válidos',async()=>{
    const oldVersion=await set(['water_supply']);
    await assert.rejects(db.query("select set_municipal_staff_access($1,array['gestor'],true,$2,array[]::text[])",[member,oldVersion]),/mudaram|Reabra/);
    await assert.rejects(db.query('select validate_municipal_staff_modules($1,$2,array[\'invalido\'])',[ids.pref,channel]),/válidos/);
    await assert.rejects(db.query('select validate_municipal_staff_modules($1,$2,array[\'water_supply\',\'water_supply\'])',[ids.pref,channel]),/válidos/);
    await asUser(staff);
    await assert.rejects(db.query("select set_municipal_staff_access($1,array['gestor'],true,0,array[]::text[])",[member]),/administrador/);
    await assert.rejects(db.query("update orgao_membro_acessos set disabled_modules='{}' where membro_id=$1",[member]),/permission denied/);
    await assert.rejects(db.query("select pipa_can_before_staff_modules($1,'manage')",[channel]),/permission denied/);
    await asUser(ids.admin);
    await assert.rejects(db.query('select validate_municipal_staff_modules($1,$2,array[]::text[])',[ids.otherPref,channel]),/administrador|Secretaria/);
    assert.equal(await scalar("select pipa_can($1,'manage') value",[channel]),true,'Administrador municipal não herda restrições de funcionário');
  });
  await check('provisionamento real grava os módulos junto com o vínculo da nova conta',async()=>{
    const created=randomUUID();
    await db.query('reset role');
    await db.query("insert into profiles(id,name,user_type) values($1,'Novo acesso','public_official')",[created]);
    await db.query("insert into auth.users(id,email,raw_app_meta_data) values($1,'novo@example.test',$2)",[created,JSON.stringify({municipal_created_by:ids.admin,municipal_provisioned:true})]);
    await asUser(ids.admin);
    const result=await db.query("select provision_municipal_account_modules($1,'staff',null,null,$2,$3,array['gestor'],array['water_supply']) value",[created,ids.pref,channel]);
    assert.equal(result.rows[0].value.user_id,created);
    await asUser(created);
    assert.equal(await scalar("select pipa_can($1,'read') value",[channel]),false);
    assert.equal(await scalar("select municipal_inventory_action($1,1,'arborization') value",[created]),true);
    const workspace=(await db.query('select municipal_workspace_access() value')).rows[0].value;
    assert.deepEqual(workspace.accesses.find(row=>row.canal_id===channel).disabled_modules,['water_supply']);
  });
}
