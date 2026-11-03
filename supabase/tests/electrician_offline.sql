\set ON_ERROR_STOP on
-- Disposable PostgreSQL fixture: real sync wrapper, deterministic operation stubs.
create role anon; create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.user',true),'')::uuid $$;
create table public.prefeituras(id uuid primary key,city_id bigint,status text);
create table public.demandas_municipais(id uuid primary key,prefeitura_id uuid,atribuido_a uuid,category_id text,versao integer);
create table public.poles(id bigint primary key,updated_at timestamptz);
create table public.test_operations(kind text);
create function public.pode_acessar_prefeitura(u uuid,c bigint) returns boolean language sql as $$
  select u='10000000-0000-0000-0000-000000000001'::uuid and c=64
$$;
create function public.salvar_demanda_municipal(p_prefeitura uuid,p_id uuid,p_dados jsonb,p_versao integer)
returns jsonb language plpgsql as $$ begin
  if p_versao is distinct from (select versao from demandas_municipais where id=p_id) then raise exception 'Changed' using errcode='40001'; end if;
  update demandas_municipais set versao=versao+1 where id=p_id;
  insert into test_operations values('start'); return '{"status":"em_andamento"}';
end $$;
create function public.resolver_ordem_eletricista(p_prefeitura uuid,p_ordem uuid,p_versao integer,p_poste_id bigint,p_poste_atualizado_em timestamptz,p_poste jsonb,p_anexos jsonb)
returns jsonb language plpgsql as $$ begin
  if p_versao is distinct from (select versao from demandas_municipais where id=p_ordem)
    or p_poste_atualizado_em is distinct from (select updated_at from poles where id=p_poste_id) then raise exception 'Changed' using errcode='40001'; end if;
  update demandas_municipais set versao=versao+1 where id=p_ordem;
  insert into test_operations values('finish'); return '{"status":"concluida"}';
end $$;
create function public.atender_solicitacao_ordem_eletricista(uuid,uuid,uuid,integer,bigint,timestamptz,jsonb,jsonb)
returns jsonb language sql as $$ select public.resolver_ordem_eletricista($1,$2,$4,$5,$6,$7,$8) $$;
create function public.concluir_ordem_eletricista(uuid,uuid,integer) returns jsonb language sql as $$ select '{"status":"concluida"}'::jsonb $$;
create function public.registrar_visita_poste_eletricista_v2(uuid,bigint,timestamptz,text,text,numeric,text[],text,uuid,uuid)
returns jsonb language plpgsql as $$ begin insert into test_operations values('visit'); return '{}'; end $$;
insert into auth.users values('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002');
insert into prefeituras values('20000000-0000-0000-0000-000000000001',64,'ativa');
insert into demandas_municipais values('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','iluminacao',1);
insert into poles values(1,'2026-01-01');
\i supabase/migrations/409_electrician_offline_operations.sql
grant usage on schema public,auth to authenticated,anon;
set role authenticated;
set test.user='10000000-0000-0000-0000-000000000001';
select public.sync_electrician_operation('40000000-0000-0000-0000-000000000001','salvar_demanda_municipal',
  '{"p_prefeitura":"20000000-0000-0000-0000-000000000001","p_id":"30000000-0000-0000-0000-000000000001","p_versao":1,"p_dados":{"status":"em_andamento"}}');
-- Identical retry returns receipt, does not rerun the operation.
select public.sync_electrician_operation('40000000-0000-0000-0000-000000000001','salvar_demanda_municipal',
  '{"p_prefeitura":"20000000-0000-0000-0000-000000000001","p_id":"30000000-0000-0000-0000-000000000001","p_versao":1,"p_dados":{"status":"em_andamento"}}');
select public.sync_electrician_operation('40000000-0000-0000-0000-000000000002','resolver_ordem_eletricista',
  '{"p_prefeitura":"20000000-0000-0000-0000-000000000001","p_ordem":"30000000-0000-0000-0000-000000000001","p_versao":1,"p_poste_id":1,"p_poste_atualizado_em":"2026-01-01","p_poste":{}}',
  '40000000-0000-0000-0000-000000000001');
reset role;
do $$ begin
  if (select count(*) from test_operations)<>2 or (select versao from demandas_municipais)<>3 then raise exception 'Duplicate or dependency failure'; end if;
end $$;
set role authenticated;
do $$ begin
  begin
    perform public.sync_electrician_operation('40000000-0000-0000-0000-000000000003','resolver_ordem_eletricista',
      '{"p_prefeitura":"20000000-0000-0000-0000-000000000001","p_ordem":"30000000-0000-0000-0000-000000000001","p_versao":1,"p_poste_id":1,"p_poste_atualizado_em":"2026-01-01","p_poste":{}}');
    raise exception 'Stale version accepted';
  exception when serialization_failure then null; end;
  if public.electrician_offline_receipt('40000000-0000-0000-0000-000000000003') is not null then raise exception 'Failed operation has receipt'; end if;
  begin
    perform public.sync_electrician_operation(gen_random_uuid(),'unapproved_function','{"p_prefeitura":"20000000-0000-0000-0000-000000000001"}');
    raise exception 'Unsupported RPC accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.sync_electrician_operation(gen_random_uuid(),'salvar_demanda_municipal','{"p_prefeitura":"20000000-0000-0000-0000-000000000001","p_id":"30000000-0000-0000-0000-000000000001","p_dados":{"status":"cancelada"}}');
    raise exception 'Unexpected action accepted';
  exception when invalid_parameter_value then null; end;
end $$;
set test.user='10000000-0000-0000-0000-000000000002';
do $$ begin
  if public.electrician_offline_receipt('40000000-0000-0000-0000-000000000001') is not null then raise exception 'Receipt leaked to another account'; end if;
  begin
    perform public.sync_electrician_operation(gen_random_uuid(),'salvar_demanda_municipal','{"p_prefeitura":"20000000-0000-0000-0000-000000000001","p_id":"30000000-0000-0000-0000-000000000001","p_dados":{"status":"em_andamento"}}');
    raise exception 'Inactive membership accepted';
  exception when insufficient_privilege then null; end;
  begin
    perform count(*) from public.electrician_offline_operations;
    raise exception 'Receipt table exposed';
  exception when insufficient_privilege then null; end;
end $$;
select 'Offline SQL: receipts, dependencies, conflicts, ownership and authorization OK';
