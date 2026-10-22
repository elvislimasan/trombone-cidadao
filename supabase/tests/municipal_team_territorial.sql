-- Banco local vazio e descartável; inclui a regressão territorial anterior.
\set ON_ERROR_STOP on
\i supabase/tests/territorial_access.sql
alter table public.profiles add column city_id bigint references public.cities;
alter table public.orgao_membros add column id uuid default gen_random_uuid() primary key,
  add column papel text default 'leitura',add column convidado_por uuid,add column updated_at timestamptz default now();
alter table public.orgao_membros add unique(canal_id,user_id);
alter table public.prefeitura_membros add column convidado_por uuid,add column updated_at timestamptz default now();
alter table public.prefeitura_membros add unique(prefeitura_id,user_id);
create table public.prefeitura_convites(id uuid primary key default gen_random_uuid(),prefeitura_id uuid references prefeituras,
  canal_id uuid references orgao_canais,email_convidado text,papel_prefeitura text,papel_orgao text,token uuid unique default gen_random_uuid(),
  status text default 'pendente',convidado_por uuid,aceito_por uuid,expires_at timestamptz default now()+interval '7 days',aceito_em timestamptz);
create function auth.jwt() returns jsonb language sql stable as $$select jsonb_build_object('email',current_setting('test.email',true))$$;
create function public.pode_administrar_prefeitura(p_user uuid,p_city_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select p_user is not null and not(public.is_admin(p_user) or public.is_master(p_user))
    and exists(select 1 from prefeitura_membros m join prefeituras p on p.id=m.prefeitura_id
      where m.user_id=p_user and m.papel='administrador' and m.ativo and p.city_id=p_city_id and p.status='ativa')
$$;
\i supabase/migrations/371_municipal_team_territorial_onboarding.sql
insert into public.profiles(id,user_type) values
  ('00000000-0000-0000-0000-000000000006','public_official'),
  ('00000000-0000-0000-0000-000000000007','public_official'),
  ('00000000-0000-0000-0000-000000000008','citizen'),
  ('00000000-0000-0000-0000-000000000009','citizen');
insert into public.prefeitura_membros(prefeitura_id,user_id,papel) values
  ('90000000-0000-0000-0000-000000000064','00000000-0000-0000-0000-000000000006','administrador'),
  ('90000000-0000-0000-0000-000000000065','00000000-0000-0000-0000-000000000007','administrador'),
  ('90000000-0000-0000-0000-000000000065','00000000-0000-0000-0000-000000000008','colaborador');
insert into public.orgao_membros(canal_id,user_id) values
  ('80000000-0000-0000-0000-000000000065','00000000-0000-0000-0000-000000000008');
update public.profiles set city_id=65 where id='00000000-0000-0000-0000-000000000009';
insert into public.urban_planner_cities(user_id,city_id) values('00000000-0000-0000-0000-000000000008',65);
insert into public.tree_manager_cities(user_id,city_id,canal_id) values
  ('00000000-0000-0000-0000-000000000008',65,'80000000-0000-0000-0000-000000000065');
update public.permission_rules set allowed=false where role_name in ('tree_manager','urban_planner');
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
-- Município deriva da prefeitura/secretaria, não de um campo livre de cidade.
select public.convidar_funcionario_municipal('90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064',
  'arvores@municipio.gov.br','leitura',array['arborization']) as invitation \gset
select (:'invitation'::jsonb->>'token') as tree_token \gset
select public.test_denied($q$select public.convidar_funcionario_municipal('90000000-0000-0000-0000-000000000065',
 '80000000-0000-0000-0000-000000000065','fora@municipio.gov.br','leitura','{}')$q$);
select public.test_denied($q$select public.convidar_funcionario_municipal('90000000-0000-0000-0000-000000000064',
 '80000000-0000-0000-0000-000000000065','fora@municipio.gov.br','leitura','{}')$q$);
select public.test_reject($q$select public.convidar_funcionario_municipal('90000000-0000-0000-0000-000000000064',
 '80000000-0000-0000-0000-000000000064','fora@municipio.gov.br','leitura',array['moderation'])$q$);
select public.convidar_funcionario_municipal('90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064',
  'equipe@municipio.gov.br','operador','{}') as invitation \gset
select (:'invitation'::jsonb->>'token') as plain_token \gset

set test.user_id='00000000-0000-0000-0000-000000000008';
set test.email='outro@municipio.gov.br';
select public.test_reject(format('select public.aceitar_convite_prefeitura(%L)',:'tree_token'));
reset role;
select public.test_assert((select user_type='citizen' and city_id is null from profiles where id='00000000-0000-0000-0000-000000000008'),'E-mail errado alterou perfil');
set role authenticated;
set test.email='arvores@municipio.gov.br';
select public.aceitar_convite_prefeitura(:'tree_token') as accepted \gset
select public.test_assert(:'accepted'::jsonb->>'redirect_to'='/prefeitura/gestao-territorial/arborizacao?cidade=64','Destino incorreto');
select public.test_assert(public.pode_gerenciar_arborizacao(64),'Convite dependeu da liberação do master');
select public.test_assert(not public.pode_gerenciar_mapa_ruas(64),'Convite só de árvores liberou ruas');
select public.test_assert(not public.pode_gerenciar_arborizacao(65) and not public.pode_gerenciar_mapa_ruas(65),'Concessão municipal desbloqueou outra cidade');
select public.test_assert(public.territorial_workspace()->'street_city_ids'='[]'::jsonb,'Workspace incluiu ruas bloqueadas');
select public.test_assert(jsonb_array_length(public.territorial_workspace()->'tree_assignments')=1,'Workspace expôs outra cidade');
insert into public.city_trees(city_id,common_name,latitude,longitude) values(64,'Servidor convidado',0,0);
select public.test_denied($q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(65,'Fora da cidade',0,0)$q$);
select public.test_denied($q$update public.tree_manager_cities set municipal_enabled=true where city_id=65$q$);
select public.test_denied($q$select public.listar_gestao_equipe_municipal('90000000-0000-0000-0000-000000000064')$q$);
reset role;
select public.test_assert((select user_type='public_official' and city_id=64 and not is_admin and not is_master from profiles where id='00000000-0000-0000-0000-000000000008'),'Tipo/cidade padrão incorretos');
select public.test_assert(not exists(select 1 from permission_rules where scope='user' and user_id='00000000-0000-0000-0000-000000000008'),'Convite alterou regra global individual');
select id as tree_member from public.orgao_membros where user_id='00000000-0000-0000-0000-000000000008' and canal_id='80000000-0000-0000-0000-000000000064' \gset

-- Alteração pela Equipe é atômica e restrita ao município do administrador.
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000007';
select public.test_denied(format('select public.set_municipal_staff_access(%L,%L,true,array[%L])',:'tree_member','leitura','urban_planning'));
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.set_municipal_staff_access(:'tree_member','leitura',true,array['urban_planning','arborization']);
select public.test_assert((select asset_modules @> array['urban_planning','arborization'] from public.listar_gestao_equipe_municipal('90000000-0000-0000-0000-000000000064') where user_id='00000000-0000-0000-0000-000000000008'),'Equipe perdeu as escolhas');
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(public.pode_gerenciar_mapa_ruas(64) and public.pode_gerenciar_arborizacao(64),'Duas responsabilidades não foram liberadas');
insert into public.pavement_streets(city_id,name) values(64,'Cadastrada pela equipe');
select public.test_assert(public.territorial_workspace()->'street_city_ids'='[64]'::jsonb,'Workspace de ruas extrapolou o município');
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.set_urban_planner_cities('00000000-0000-0000-0000-000000000008',array[64,65]::bigint[]);
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(public.pode_gerenciar_mapa_ruas(64) and not public.pode_gerenciar_mapa_ruas(65),'Editar concessão da plataforma perdeu a origem municipal ou liberou outra cidade');
reset role;
-- Bloqueio individual explícito prevalece sobre a escolha municipal.
insert into public.permission_rules(scope,user_id,module,allowed) values('user','00000000-0000-0000-0000-000000000008','arborization',false);
set role authenticated;
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Concessão municipal ignorou bloqueio individual');
reset role;
delete from public.permission_rules where user_id='00000000-0000-0000-0000-000000000008';
-- Suspender e reativar preserva escolhas, sem permitir escrita suspensa.
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.set_municipal_staff_access(:'tree_member','leitura',false,array['urban_planning','arborization']);
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(not public.pode_gerenciar_mapa_ruas(64) and not public.pode_gerenciar_arborizacao(64),'Suspensão não revogou escrita');
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.set_municipal_staff_access(:'tree_member','leitura',true,array['urban_planning']);
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.aceitar_convite_prefeitura(:'tree_token');
select public.test_assert(public.pode_gerenciar_mapa_ruas(64) and not public.pode_gerenciar_arborizacao(64),'Reabrir convite restaurou permissão revogada');
reset role;
select public.test_assert(exists(select 1 from public.tree_manager_cities where user_id='00000000-0000-0000-0000-000000000008' and city_id=65),'Equipe apagou atribuição de outro município');

-- Funcionário comum também nasce Órgão Público com cidade padrão, sem módulos.
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000009';
set test.email='equipe@municipio.gov.br';
select public.aceitar_convite_prefeitura(:'plain_token');
select public.test_assert(not public.can_write(auth.uid(),'urban_planning') and not public.can_write(auth.uid(),'arborization'),'Funcionário comum recebeu módulos não escolhidos');
reset role;
select public.test_assert((select user_type='public_official' and city_id=65 from profiles where id='00000000-0000-0000-0000-000000000009'),'Aceite sobrescreveu cidade existente no perfil pessoal');

insert into public.prefeitura_convites(prefeitura_id,canal_id,email_convidado,papel_prefeitura,papel_orgao,token,expires_at,asset_modules)
 values('90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064','equipe@municipio.gov.br',
 'colaborador','leitura','70000000-0000-0000-0000-000000000001',now()-interval '1 day',array['arborization']);
set role authenticated;
select public.test_reject($q$select public.aceitar_convite_prefeitura('70000000-0000-0000-0000-000000000001')$q$);
select public.test_assert(not public.pode_gerenciar_arborizacao(64),'Convite expirado concedeu arborização');
reset role;

-- Canais/prefeituras inativos removem acesso de rua mesmo com flag municipal.
update public.orgao_canais set ativo=false where city_id=64;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(not public.pode_gerenciar_mapa_ruas(64),'Secretaria suspensa continuou gerindo ruas');
reset role;
update public.orgao_canais set ativo=true where city_id=64;
update public.prefeitura_membros set ativo=false where user_id='00000000-0000-0000-0000-000000000008' and prefeitura_id='90000000-0000-0000-0000-000000000064';
set role authenticated;
select public.test_assert(not public.pode_gerenciar_mapa_ruas(64),'Vínculo municipal revogado continuou gerindo ruas');
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.test_assert(public.pode_gerenciar_mapa_ruas(65) and public.pode_gerenciar_arborizacao(65),'Master perdeu acesso');
reset role;
select 'Equipe municipal: convite, tipo/cidade padrão, permissões por cidade, edição, bloqueio e suspensão OK';
