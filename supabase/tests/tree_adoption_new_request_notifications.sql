-- Apenas PostgreSQL local vazio e descartável. Os helpers de acesso usam
-- vínculos mínimos; o trigger, o envio idempotente e a RLS são os reais.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption_notifications.sql
reset role;

create table public.test_adoption_staff(user_id uuid,city_id bigint,role_name text,active boolean default true,allowed boolean default true);
create table public.tree_manager_cities(user_id uuid,city_id bigint,canal_id uuid,municipal_enabled boolean default false);
create function public.municipal_inventory_action(p_user uuid,p_city bigint,p_module text) returns boolean language sql as $$
  select p_module='arborization' and exists(select 1 from public.test_adoption_staff where user_id=p_user and city_id=p_city and role_name='inventory' and active and allowed)
$$;
create function public.tree_management_membership(p_user uuid,p_city bigint,p_channel uuid) returns boolean language sql as $$
  select exists(select 1 from public.test_adoption_staff where user_id=p_user and city_id=p_city and role_name='tree_manager' and active)
$$;
create function public.territorial_rule_allows(p_user uuid,p_module text,p_municipal boolean) returns boolean language sql as $$
  select p_module='arborization' and exists(select 1 from public.test_adoption_staff where user_id=p_user and allowed)
$$;
create or replace function public.pode_administrar_prefeitura(p_user uuid,p_city bigint) returns boolean language sql as $$
  select exists(select 1 from public.test_adoption_staff where user_id=p_user and city_id=p_city and role_name='administrator' and active)
$$;
create or replace function public.municipal_channel_action(p_user uuid,p_channel uuid,p_action text) returns boolean language sql as $$
  select p_action='receive' and exists(select 1 from public.test_adoption_staff s join public.orgao_categorias c on c.city_id=s.city_id
    where s.user_id=p_user and c.canal_id=p_channel and s.role_name='attendant' and s.active and s.allowed)
$$;
insert into public.profiles(id) select ('00000000-0000-0000-0000-'||lpad(i::text,12,'0'))::uuid from generate_series(6,13) i;
insert into public.test_adoption_staff(user_id,city_id,role_name,active,allowed) values
  ('00000000-0000-0000-0000-000000000003',64,'attendant',true,true), -- admin e atendente: um único aviso
  ('00000000-0000-0000-0000-000000000005',64,'administrator',true,true),
  ('00000000-0000-0000-0000-000000000006',64,'inventory',true,true),
  ('00000000-0000-0000-0000-000000000007',64,'tree_manager',true,true),
  ('00000000-0000-0000-0000-000000000008',64,'attendant',true,true),
  ('00000000-0000-0000-0000-000000000009',65,'administrator',true,true),
  ('00000000-0000-0000-0000-000000000010',64,'reader',true,true),
  ('00000000-0000-0000-0000-000000000011',64,'tree_manager',false,true),
  ('00000000-0000-0000-0000-000000000012',64,'tree_manager',true,false),
  ('00000000-0000-0000-0000-000000000013',65,'inventory',true,true);
insert into public.tree_manager_cities(user_id,city_id,canal_id)
  select user_id,city_id,'80000000-0000-0000-0000-000000000064' from public.test_adoption_staff where role_name='tree_manager';
\i supabase/migrations/414_tree_adoption_new_request_notifications.sql

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.submit_tree_adoption(public.test_notification_payload('b0000000-0000-0000-0000-000000000001','muda'));
select public.submit_tree_adoption(public.test_notification_payload('b0000000-0000-0000-0000-000000000001','muda'));
reset role;
select public.test_assert((select count(*)=6 and count(distinct user_id)=6 from public.notifications where type='tree_adoption_new_request'),'Destinatários incorretos ou reenvio duplicou notificações');
select public.test_assert((select array_agg(user_id order by user_id)=array[
  '00000000-0000-0000-0000-000000000003'::uuid,'00000000-0000-0000-0000-000000000004'::uuid,
  '00000000-0000-0000-0000-000000000005'::uuid,'00000000-0000-0000-0000-000000000006'::uuid,
  '00000000-0000-0000-0000-000000000007'::uuid,'00000000-0000-0000-0000-000000000008'::uuid]
  from public.notifications where type='tree_adoption_new_request'),'Aviso atingiu outra cidade, leitura, vínculo revogado ou cidadão');
select public.test_assert((select bool_and(not is_read and message like '%ARV-B0000000: Solicitação de mudas%' and message not like '%Maria%' and message not like '%99999%')
  from public.notifications where type='tree_adoption_new_request'),'Push perdeu protocolo ou expôs dados pessoais');
select public.test_assert((select bool_and(case when user_id='00000000-0000-0000-0000-000000000003' then link='/notificacoes'
  else link='/prefeitura/adote-uma-arvore/solicitacoes?cidade=64' end) from public.notifications where type='tree_adoption_new_request'),'Destino do aviso incorreto');

begin;
-- Uma revogação vale para o próximo envio; nem mesmo um solicitante que
-- também administra a prefeitura deve receber o aviso do próprio pedido.
update public.test_adoption_staff set active=false where user_id='00000000-0000-0000-0000-000000000007';
insert into public.test_adoption_staff values('00000000-0000-0000-0000-000000000002',64,'administrator',true,true);
set local role authenticated;
set local test.user_id='00000000-0000-0000-0000-000000000002';
select public.submit_tree_adoption(public.test_notification_payload('b0000000-0000-0000-0000-000000000002','plantio'));
reset role;
select public.test_assert((select count(*)=5 and bool_and(user_id not in ('00000000-0000-0000-0000-000000000007'::uuid,'00000000-0000-0000-0000-000000000002'::uuid))
  from public.notifications where type='tree_adoption_new_request' and message like '%Solicitação de plantio%'),'Plantio ignorou revogação ou notificou o próprio autor');
rollback;
select public.test_assert((select count(*)=6 from public.notifications where type='tree_adoption_new_request'),'Rollback deixou avisos sem pedido');
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.update_tree_adoption('b0000000-0000-0000-0000-000000000001','solicitada','em_analise','Análise pela equipe responsável.');
reset role;
select public.test_assert((select count(*)=6 from public.notifications where type='tree_adoption_new_request'),'Atualização de status reenviou alerta de novo pedido');
select public.test_assert((select count(*)=9 from public.notifications where type='tree_adoption_update'),'Aviso ao solicitante deixou de funcionar após ativar novos pedidos');
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_assert((select count(*)=0 from public.notifications where type='tree_adoption_new_request'),'Notificações da equipe vazaram para o solicitante');
select public.test_denied($q$select public.notify_tree_adoption_new_request()$q$);
reset role;
select 'Novos pedidos: admins, prefeitura, inventário e atendimento; escopo, revogação, privacidade, idempotência e rollback OK';
