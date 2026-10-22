-- Fixtures institucionais mínimas em PostgreSQL LOCAL descartável.
\set ON_ERROR_STOP on
\i supabase/tests/arborization_inventory.sql
\i supabase/migrations/368_city_tree_public_code.sql
create table public.orgao_canais(id uuid primary key,city_id bigint references cities,nome text,ativo boolean,canal_triagem boolean default false);
create table public.orgao_membros(canal_id uuid references orgao_canais,user_id uuid references profiles,ativo boolean default true);
create table public.prefeituras(id uuid primary key,city_id bigint references cities,nome text,status text default 'ativa');
create table public.prefeitura_membros(prefeitura_id uuid references prefeituras,user_id uuid references profiles,papel text default 'colaborador',ativo boolean default true);
insert into public.orgao_canais values('80000000-0000-0000-0000-000000000064',64,'Produção Rural e Meio Ambiente',true,false),('80000000-0000-0000-0000-000000000065',65,'Meio Ambiente',true,false);
insert into public.prefeituras(id,city_id,nome) values('90000000-0000-0000-0000-000000000064',64,'Prefeitura'),('90000000-0000-0000-0000-000000000065',65,'Outra prefeitura');
insert into public.orgao_membros values('80000000-0000-0000-0000-000000000064','00000000-0000-0000-0000-000000000002',true);
insert into public.prefeitura_membros(prefeitura_id,user_id) values('90000000-0000-0000-0000-000000000064','00000000-0000-0000-0000-000000000002');
\i supabase/migrations/369_territorial_responsibilities.sql
\i supabase/migrations/370_arborization_independent_access.sql

select public.test_assert((select count(*)=0 from public.tree_manager_cities),'Migração copiou gestores de ruas');
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.set_territorial_responsibilities('00000000-0000-0000-0000-000000000002','{}',
  '[{"city_id":64,"canal_id":"80000000-0000-0000-0000-000000000064"}]');
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Admin sem cargo ganhou escrita');
select public.test_reject($q$select public.set_territorial_responsibilities('00000000-0000-0000-0000-000000000002',array[65]::bigint[],
  '[{"city_id":65,"canal_id":"80000000-0000-0000-0000-000000000064"}]')$q$);
reset role;
select public.test_assert(not exists(select 1 from public.urban_planner_cities where user_id='00000000-0000-0000-0000-000000000002'),'Falha do vínculo alterou ruas');
select public.test_assert(exists(select 1 from public.tree_manager_cities where user_id='00000000-0000-0000-0000-000000000002' and city_id=64),'Falha apagou concessão anterior');

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_assert(not public.can_write(auth.uid(),'arborization'),'Novo módulo começou liberado');
select public.test_denied($q$insert into public.tree_manager_cities(user_id,city_id,canal_id) values(auth.uid(),65,'80000000-0000-0000-0000-000000000065')$q$);
select public.test_denied($q$select public.set_territorial_responsibilities(auth.uid(),array[64]::bigint[],'[]')$q$);
select public.test_denied($q$select public.tree_management_channels(auth.uid())$q$);
reset role;
update public.permission_rules set allowed=true where role_name='tree_manager';

-- Ruas não escreve árvores, mesmo com o cliente antigo.
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_assert(public.pode_gerenciar_mapa_ruas(64) and not public.pode_gerenciar_arborizacao(64),'Ruas herdou arborização');
select public.test_denied($q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(64,'Indevida',0,0)$q$);
select public.test_denied($q$insert into public.city_tree_species(city_id,common_name) values(64,'Indevida')$q$);
select public.test_denied($q$insert into public.city_tree_care(tree_id,service_type,performed_on) values('30000000-0000-0000-0000-000000000064','poda',current_date)$q$);

-- Arborização pode gerir árvores, sem editar ruas/bairros.
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_assert(public.pode_gerenciar_arborizacao(64) and not public.pode_gerenciar_mapa_ruas(64),'Arborização herdou ruas');
select public.test_assert(not public.pode_gerenciar_arborizacao(65),'Arborização atravessou cidade');
insert into public.city_trees(city_id,common_name,latitude,longitude) values(64,'Permitida',0,0);
insert into public.city_tree_care(tree_id,service_type,performed_on) values('30000000-0000-0000-0000-000000000064','vistoria',current_date);
select public.test_denied($q$insert into public.pavement_streets(city_id,name) values(64,'Indevida')$q$);
select public.test_denied($q$insert into public.bairros(city_id,name) values(64,'Indevido')$q$);
select public.test_denied($q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(65,'Indevida',0,0)$q$);
select public.test_assert(public.territorial_workspace()->'tree_assignments'->0->>'secretaria'='Produção Rural e Meio Ambiente','Workspace perdeu secretaria');
reset role;

-- Revogações institucionais e individuais valem no próximo comando SQL.
update public.orgao_membros set ativo=false;
set role authenticated;
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Vínculo revogado continuou escrevendo');
select public.test_assert(jsonb_array_length(public.territorial_workspace()->'tree_assignments')=0,'Workspace expôs concessão inativa');
reset role;
update public.orgao_membros set ativo=true;
update public.prefeitura_membros set ativo=false;
set role authenticated;
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Prefeitura revogada continuou escrevendo');
reset role;
update public.prefeitura_membros set ativo=true;
update public.orgao_canais set ativo=false where city_id=64;
set role authenticated;
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Secretaria inativa continuou escrevendo');
reset role;
update public.orgao_canais set ativo=true;
insert into public.permission_rules(scope,user_id,module,allowed) values('user','00000000-0000-0000-0000-000000000002','arborization',false);
set role authenticated;
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Bloqueio individual ignorado');
reset role;
delete from public.permission_rules where scope='user' and module='arborization';
update public.profiles set user_type='citizen' where id='00000000-0000-0000-0000-000000000002';
set role authenticated;
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Tipo cidadão recebeu escrita de gestão');
-- Exceção cidadã de cadastro atômico é preservada.
insert into public.reports(city_id,author_id,category_id,location,tree_registration)
values(64,auth.uid(),'poda',point(-38.66,-8.7),'{"latitude":-8.7,"longitude":-38.66}');
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.test_assert(public.pode_gerenciar_arborizacao(65) and public.pode_gerenciar_mapa_ruas(65),'Master perdeu acesso global');
reset role;
set role anon;
set test.user_id='';
select public.test_assert(exists(select 1 from public.city_trees where public_code is not null),'Consulta pública perdeu códigos AR');
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Anônimo recebeu escrita');
reset role;
select 'Gestão territorial: concessões independentes, RPC atômica, cidade, secretaria, revogação, cidadão e master OK';
