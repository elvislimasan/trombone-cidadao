\set ON_ERROR_STOP on
\i supabase/tests/municipal_responsibilities.sql
alter table public.orgao_canais add column email text default 'secretaria@municipio.gov.br',add column emails_copia text[] default '{}',
  add column reply_to text default 'secretaria@municipio.gov.br',add column criado_por uuid;
alter table public.orgao_categorias add unique(city_id,category_id);
create policy test_report_permission_dependency on public.reports as restrictive for select
  using(public.can_write(auth.uid(),'reports') or auth.uid() is null);
\i supabase/migrations/374_department_scope_and_staff_roles.sql
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.test_denied($q$select * from public.city_tree_request_counts(64)$q$);
reset role;
\i supabase/migrations/376_department_policy_dependencies_and_workspace_identity.sql
set role authenticated;
select public.test_assert(public.municipal_workspace_access()->>'actor_user_id'=auth.uid()::text,'Workspace não identifica a conta consultada');
select public.test_assert((select count(*)>0 from public.city_tree_request_counts(64)),'Indicadores não carregaram após reparar a policy');
select public.test_denied($q$select public.can_write_before_departments(auth.uid(),'reports')$q$);
reset role;
set role anon;
set test.user_id='';
select public.test_assert((select total=1 and poda=1 and remocao=0 from public.city_tree_request_counts(64) where tree_id='30000000-0000-0000-0000-000000000064'),'Correção dos indicadores expôs solicitações privadas');
reset role;
update public.prefeituras set categorias_habilitadas=array['iluminacao','poda'];
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.salvar_secretaria_municipal(null,64,'{"nome":"Agricultura","email":"agri@municipio.gov.br","reply_to":"agri@municipio.gov.br","emails_copia":[]}',array['poda'],array['arborization'],'{}') as agri_channel \gset
reset role;
update public.orgao_canais set ativo=true where id=:'agri_channel';
set role authenticated;
select public.convidar_funcionario_secretaria('90000000-0000-0000-0000-000000000064',:'agri_channel','agricultura@municipio.gov.br',array['gestor']) as invitation \gset
select (:'invitation'::jsonb->>'token') as agri_token \gset
select public.test_reject(format('select public.convidar_funcionario_secretaria(%L,%L,%L,array[%L])',
  '90000000-0000-0000-0000-000000000064',:'agri_channel','campo@municipio.gov.br','executor'));
set test.user_id='00000000-0000-0000-0000-000000000009';
set test.email='agricultura@municipio.gov.br';
select public.aceitar_convite_prefeitura(:'agri_token');
select public.test_assert(public.pode_gerenciar_arborizacao(64),'Gestor não herdou o inventário da secretaria');
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'lighting'),'Agricultura ganhou postes');
select public.test_assert(not public.eletricista_ativo_municipio(auth.uid(),64),'Agricultura ganhou execução elétrica');
select public.test_assert(public.can_write(auth.uid(),'arborization'),'Cliente não reconheceu inventário herdado');
select public.test_assert(exists(select 1 from jsonb_array_elements(public.municipal_workspace_access()->'inventories') j where j->>'module'='arborization'),'Workspace não recebeu o inventário herdado');
select public.test_denied($q$select public.set_municipal_staff_responsibilities(gen_random_uuid(),'{}',true,'{}',1)$q$);
select public.test_denied($q$select public.convidar_responsavel_municipal(gen_random_uuid(),gen_random_uuid(),'a@municipio.gov.br','{}','{}')$q$);
reset role;
select id as agri_member from public.orgao_membros where canal_id=:'agri_channel' and user_id='00000000-0000-0000-0000-000000000009' \gset
select versao as agri_version from public.orgao_membro_acessos where membro_id=:'agri_member' \gset
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.set_municipal_staff_roles(:'agri_member',array['leitura'],true,:'agri_version');
select public.test_reject(format('select public.set_municipal_staff_roles(%L,array[%L],true,%s)',:'agri_member','gestor',:'agri_version'));
select public.test_reject(format('select public.salvar_secretaria_municipal(%L,64,%L,array[%L],array[%L],%L,1)',
  :'agri_channel','{"nome":"Agricultura","email":"agri@municipio.gov.br","reply_to":"agri@municipio.gov.br"}','poda','lighting','{}'));
set test.user_id='00000000-0000-0000-0000-000000000009';
select public.aceitar_convite_prefeitura(:'agri_token');
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Reaceite restaurou o cargo removido');
select public.test_assert(exists(select 1 from jsonb_array_elements(public.municipal_workspace_access()->'inventory_views') j where j->>'module'='arborization'),'Somente leitura perdeu consulta do inventário');
reset role;
select public.test_assert((select municipal_modules=array['arborization'] from public.orgao_canais where id=:'agri_channel'),'Falha de configuração deixou alteração parcial');
select 'Secretaria determina o escopo; cargo determina ações; convite, leitura, versão e Agricultura OK';
