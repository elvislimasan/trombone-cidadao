-- Executar somente em PostgreSQL LOCAL vazio e descartável, da raiz do projeto.
\set ON_ERROR_STOP on
\i supabase/tests/department_scope.sql
create role authenticator;
create role service_role;
create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',encrypted_password text);
insert into auth.users(id) select id from public.profiles;
alter table public.profiles add column name text,add column phone text,add column state_id bigint,add column terms_accepted_at timestamptz;
alter table public.cities add column state_id bigint default 26;
alter table public.prefeituras alter column id set default gen_random_uuid();
alter table public.prefeituras add unique(city_id);
alter table public.prefeituras add column criado_por uuid,add column aprovado_por uuid,add column aprovado_em timestamptz,add column updated_at timestamptz;
create function public.garantir_triagem_prefeitura(bigint,uuid) returns void language sql as $$select$$;
\i supabase/migrations/383_categoryless_department_inventory.sql
\i supabase/migrations/385_assign_existing_public_officials.sql
\i supabase/migrations/391_municipal_temporary_access.sql

insert into auth.users(id,email,encrypted_password,raw_app_meta_data) values
 ('10000000-0000-0000-0000-000000000001','novo@prefeitura.test','temporary-hash','{"municipal_provisioned":true,"municipal_created_by":"00000000-0000-0000-0000-000000000006"}'),
 ('10000000-0000-0000-0000-000000000002','admin@prefeitura.test','temporary-hash','{"municipal_provisioned":true,"municipal_created_by":"00000000-0000-0000-0000-000000000004"}'),
 ('10000000-0000-0000-0000-000000000003','existente@prefeitura.test','existing-hash','{}');
insert into public.profiles(id) select id from auth.users where id::text like '10000000%';

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.test_denied($q$select public.validate_municipal_provisioning('administrator',64)$q$);
select public.test_denied($q$select public.validate_municipal_provisioning('staff',null,'90000000-0000-0000-0000-000000000065','80000000-0000-0000-0000-000000000065',array['gestor'])$q$);
select public.test_reject($q$select public.validate_municipal_provisioning('staff',null,'90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000065',array['gestor'])$q$);
select public.test_denied($q$select public.provision_municipal_account('10000000-0000-0000-0000-000000000003','staff',null,null,'90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064',array['gestor'])$q$);
select public.provision_municipal_account('10000000-0000-0000-0000-000000000001','staff',null,null,'90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064',array['gestor']);
select public.test_denied($q$select public.provision_municipal_account('10000000-0000-0000-0000-000000000001','staff',null,null,'90000000-0000-0000-0000-000000000064','80000000-0000-0000-0000-000000000064',array['gestor'])$q$);
select public.test_denied($q$select * from public.municipal_account_setup$q$);
select public.test_denied($q$update public.municipal_account_setup set password_changed_at=now()$q$);
reset role;
select public.test_assert((select password_expires_at-created_at=interval '24 hours' from public.municipal_account_setup),'Prazo não corresponde a 24 horas da geração');
select public.test_assert((select user_type='public_official' and city_id=64 and state_id=26 from public.profiles where id='10000000-0000-0000-0000-000000000001'),'Cidade/tipo incorretos');
select public.test_assert(exists(select 1 from public.orgao_membros where user_id='10000000-0000-0000-0000-000000000001' and ativo),'Funcionário não foi vinculado');

set role authenticated;
set test.user_id='10000000-0000-0000-0000-000000000001';
select public.test_assert((public.municipal_account_status()->>'profile_required')::boolean,'Primeiro acesso não exige cadastro');
select public.test_assert(not (public.municipal_account_status()->>'password_required')::boolean,'Senha exigida antes de 24h');
set request.method='POST';
set request.path='/rpc/municipal_workspace_access';
select public.test_denied($q$select public.check_municipal_account()$q$);
set request.path='/rpc/complete_municipal_account';
select public.check_municipal_account();
select public.test_reject($q$select public.complete_municipal_account('Servidor','81999999999',false)$q$);
select public.test_reject($q$select public.complete_municipal_account('Servidor','123',true)$q$);
select public.complete_municipal_account('Servidor Municipal','81999999999',true);
select public.test_assert(not (public.municipal_account_status()->>'profile_required')::boolean,'Cadastro não concluído');
set request.path='/rpc/municipal_workspace_access';
select public.check_municipal_account();
reset role;
-- Mantém o mesmo usuário/sessão: o bloqueio consulta o prazo no banco.
update public.municipal_account_setup set password_expires_at=now() where user_id='10000000-0000-0000-0000-000000000001';
set role authenticated;
select public.test_assert((public.municipal_account_status()->>'password_required')::boolean,'Limite exato de 24h não bloqueou');
select public.test_denied($q$select public.check_municipal_account()$q$);
set request.path='/profiles';
select public.test_denied($q$select public.check_municipal_account()$q$);
set request.method='GET';
select public.check_municipal_account();
set request.path='/rpc/municipal_account_status';
select public.check_municipal_account();
reset role;
update auth.users set raw_app_meta_data=raw_app_meta_data||'{"password_changed":true}' where id='10000000-0000-0000-0000-000000000001';
select public.test_assert((select password_changed_at is null from public.municipal_account_setup),'Metadados contornaram a troca de senha');
update auth.users set encrypted_password='new-personal-hash' where id='10000000-0000-0000-0000-000000000001';
set role authenticated;
select public.test_assert(not (public.municipal_account_status()->>'password_required')::boolean,'Senha pessoal não liberou a sessão');
set request.path='/rpc/municipal_workspace_access';
select public.check_municipal_account();
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.provision_municipal_account('10000000-0000-0000-0000-000000000002','administrator',64,'Prefeitura de teste');
reset role;
select public.test_assert(exists(select 1 from public.prefeitura_membros where user_id='10000000-0000-0000-0000-000000000002' and papel='administrador' and ativo),'Administrador não recebeu acesso');
select public.test_assert((select encrypted_password='existing-hash' from auth.users where id='10000000-0000-0000-0000-000000000003'),'Conta existente foi alterada');
set role anon;
set test.user_id='';
select public.check_municipal_account();
select public.test_denied($q$select public.municipal_account_status()$q$);
reset role;
select 'Acesso municipal: autorização, isolamento, cadastro, prazo de 24h, sessão aberta e troca de senha OK';
