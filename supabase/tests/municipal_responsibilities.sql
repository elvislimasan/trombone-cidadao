-- Contratos reais de concessão/convite e barreiras de ação em banco descartável.
\set ON_ERROR_STOP on
\i supabase/tests/municipal_team_territorial.sql
alter table public.prefeituras add column categorias_habilitadas text[] default array['iluminacao'];
create table public.orgao_categorias(canal_id uuid,city_id bigint,category_id text);
insert into public.orgao_categorias select id,city_id,'iluminacao' from public.orgao_canais;
create function public.pode_acessar_prefeitura(p_user uuid,p_city_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.prefeitura_membros m join public.prefeituras p on p.id=m.prefeitura_id
    where m.user_id=p_user and m.ativo and p.city_id=p_city_id and p.status='ativa')
$$;
create table public.orgao_casos(report_id uuid primary key,canal_id uuid,atribuido_a uuid,status text,prioridade text,prazo_em timestamptz);
create table public.orgao_caso_eventos(id uuid primary key,report_id uuid,canal_id uuid);
create table public.orgao_respostas(id uuid primary key,report_id uuid,canal_id uuid,visibilidade text);
create table public.demandas_municipais(id uuid primary key default gen_random_uuid(),prefeitura_id uuid,
  status text default 'aberta' constraint demandas_municipais_status_check check(status in ('aberta','em_andamento','concluida')),
  canal_id uuid,category_id text,atribuido_a uuid,criado_por uuid,previsto_em timestamptz,executada_em timestamptz,
  resultado text,registro_execucao text,prioridade text default 'normal',titulo text,executada_por uuid);
create table public.demanda_broncas(demanda_id uuid,report_id uuid);
alter table public.demandas_municipais enable row level security;
alter table public.orgao_casos enable row level security;
create policy test_order_read on public.demandas_municipais for select to authenticated using(true);
create policy test_case_read on public.orgao_casos for select to authenticated using(true);
grant select,insert,update on public.demandas_municipais to authenticated;
create policy test_order_insert on public.demandas_municipais for insert to authenticated with check(true);
create policy test_order_update on public.demandas_municipais for update to authenticated using(true);
grant select on public.orgao_casos to authenticated;
update public.prefeitura_membros set ativo=true;
update public.prefeituras set status='ativa';
update public.orgao_canais set ativo=true;
\i supabase/migrations/372_municipal_responsibility_access.sql
\i supabase/migrations/373_municipal_workflow_boundaries.sql

select id as tree_member from public.orgao_membros where user_id='00000000-0000-0000-0000-000000000008' and canal_id='80000000-0000-0000-0000-000000000064' \gset
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.set_municipal_staff_responsibilities(:'tree_member','{"atendimento":"nenhum","especialidades_execucao":[],"inventario_iluminacao":false}',true,array['urban_planning'],1);
select public.test_reject(format('select public.set_municipal_staff_responsibilities(%L,%L,true,array[%L],1)',:'tree_member','{"atendimento":"gestor","especialidades_execucao":[],"inventario_iluminacao":false}','urban_planning'));
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(public.pode_gerenciar_mapa_ruas(64),'Inventário exclusivo perdeu ruas');
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'read'),'Inventário ganhou leitura de atendimento');
select public.test_assert(public.papel_no_orgao(auth.uid(),'80000000-0000-0000-0000-000000000064') is null,'Papel legado liberou atendimento');
select public.test_denied($q$insert into public.demandas_municipais(prefeitura_id,canal_id,category_id,criado_por,status) values('90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064','iluminacao',auth.uid(),'aberta')$q$);
select public.test_denied($q$select public.set_municipal_staff_access(gen_random_uuid(),'gestor',true,'{}')$q$);
select public.test_assert(jsonb_array_length(public.municipal_workspace_access()->'memberships')>0,'Inventário perdeu contexto municipal');

reset role;
insert into public.reports(id,city_id,author_id,category_id,is_public,moderation_status,location)
values('70000000-0000-0000-0000-000000000064',64,'00000000-0000-0000-0000-000000000008','poda',false,'internal',point(-38,-8));
insert into public.orgao_casos(report_id,canal_id) values('70000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064');
set role authenticated;
select public.test_assert(not exists(select 1 from public.reports where id='70000000-0000-0000-0000-000000000064'),'Autor com inventário exclusivo leu solicitação interna');
select public.test_assert(not public.can_view_municipal_report_media('70000000-0000-0000-0000-000000000064'),'Mídia privada vazou');
select public.test_assert(not public.can_access_municipal_report_receipt('70000000-0000-0000-0000-000000000064',false),'Comprovante vazou');

set test.user_id='00000000-0000-0000-0000-000000000006';
select public.set_municipal_staff_responsibilities(:'tree_member','{"atendimento":"atendente","especialidades_execucao":[],"inventario_iluminacao":false}',true,array['urban_planning'],2);
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(public.municipal_city_action(auth.uid(),64,'receive') and not public.municipal_city_action(auth.uid(),64,'dispatch'),'Atendente ganhou despacho');
insert into public.demandas_municipais(id,prefeitura_id,canal_id,category_id,criado_por,status,titulo)
values('60000000-0000-0000-0000-000000000064','90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064','iluminacao',auth.uid(),'rascunho','Rascunho');
select public.test_denied($q$update public.demandas_municipais set status='programada' where id='60000000-0000-0000-0000-000000000064'$q$);
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.set_municipal_staff_responsibilities(:'tree_member','{"atendimento":"gestor","especialidades_execucao":["eletricista"],"inventario_iluminacao":true}',true,array['urban_planning'],3);
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(public.municipal_city_action(auth.uid(),64,'dispatch') and public.eletricista_ativo_municipio(auth.uid(),64) and public.municipal_city_action(auth.uid(),64,'lighting'),'Funções acumuladas perderam atividade');
update public.demandas_municipais set status='aberta',atribuido_a=auth.uid() where id='60000000-0000-0000-0000-000000000064';
update public.demandas_municipais set status='em_andamento' where id='60000000-0000-0000-0000-000000000064';
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.set_municipal_staff_responsibilities(:'tree_member','{"atendimento":"gestor","especialidades_execucao":["eletricista"],"inventario_iluminacao":true}',false,array['urban_planning'],4);
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'dispatch') and not public.eletricista_ativo_municipio(auth.uid(),64),'Suspensão não revogou funções acumuladas');
select public.test_assert(not exists(select 1 from public.demandas_municipais),'Ordens continuaram visíveis após suspensão');
reset role;
select public.test_assert((select count(*)>=5 from public.municipal_access_audit where membro_id=:'tree_member'),'Auditoria ausente');
select 'Responsabilidades municipais: inventário exclusivo, privacidade, rascunho, versões, acúmulo e suspensão OK';
