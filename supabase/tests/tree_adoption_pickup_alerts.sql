-- Somente banco local vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption.sql
alter table public.cities add column if not exists name text;
update public.cities set name=case id when 64 then 'Floresta' else 'Recife' end;
create table public.notifications(id uuid primary key default gen_random_uuid(),user_id uuid references public.profiles(id),type text,title text,message text,link text,is_read boolean,created_at timestamptz);
alter table public.notifications enable row level security;
grant select on public.notifications to authenticated;
create policy own_notifications on public.notifications for select to authenticated using(user_id=auth.uid());
\i supabase/migrations/394_tree_adoption_pickup_and_alerts.sql

select public.test_assert(public.valid_tree_pickup_details('{"address":"Rua Um, 20","latitude":-8.6,"longitude":-38.57,"notes":"Leve documento.","schedule":[{"days":[1,2,3,4,5],"from":"08:00","to":"12:00"},{"days":[1,2,3,4,5],"from":"14:00","to":"17:00"}]}'),'Retirada válida recusada');
select public.test_assert(not public.valid_tree_pickup_details('{"latitude":-8.6}'),'Coordenada incompleta aceita');
select public.test_assert(not public.valid_tree_pickup_details('{"schedule":[{"days":[],"from":"08:00","to":"12:00"}]}'),'Período sem dias aceito');
select public.test_assert(not public.valid_tree_pickup_details('{"schedule":[{"days":[1],"from":"12:00","to":"08:00"}]}'),'Horário invertido aceito');
select public.test_assert(not public.valid_tree_pickup_details('{"schedule":[{"days":[1],"from":"08:00","to":"12:00"},{"days":[1],"from":"11:00","to":"13:00"}]}'),'Sobreposição aceita');
update public.tree_species_availability set status='indisponivel';
set role anon;
select public.test_denied($q$select public.set_tree_adoption_availability_alert(64,true)$q$);
select public.test_denied($q$select * from public.tree_adoption_availability_alerts$q$);
reset role;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_assert((public.set_tree_adoption_availability_alert(64,true)->>'enabled')::boolean,'Aviso não ativou');
select public.set_tree_adoption_availability_alert(64,true);
select public.test_assert((select count(*)=1 from public.tree_adoption_availability_alerts),'Aviso duplicou');
select public.test_denied($q$insert into public.tree_adoption_availability_alerts(user_id,city_id) values('00000000-0000-0000-0000-000000000001',64)$q$);
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_assert((select count(*)=0 from public.tree_adoption_availability_alerts),'Lista de avisos vazou');
select public.set_tree_adoption_availability_alert(65,true);
select public.set_tree_adoption_availability_alert(65,false);
select public.test_assert((select count(*)=0 from public.tree_adoption_availability_alerts),'Cancelamento falhou');
select public.set_tree_adoption_availability_alert(65,true);
set test.user_id='00000000-0000-0000-0000-000000000001';
insert into public.city_tree_species(id,city_id,common_name) values('71000000-0000-0000-0000-000000000064',64,'Espécie criada pela equipe');
insert into public.tree_species_availability(species_id,provider,status,pickup_details)
  values('71000000-0000-0000-0000-000000000064','viveiro_municipal','sob_consulta','{"address":"Rua Um, 20","latitude":-8.6,"longitude":-38.57,"schedule":[{"days":[1,2,3,4,5],"from":"08:00","to":"12:00"}],"notes":"Leve documento."}');
select public.test_assert((select count(*)=0 from public.notifications),'Sob consulta enviou aviso');
update public.tree_species_availability set status='disponivel' where species_id='71000000-0000-0000-0000-000000000064';
update public.tree_species_availability set status='disponivel' where species_id='71000000-0000-0000-0000-000000000064';
select public.test_reject($q$update public.tree_species_availability set pickup_details='{"schedule":[{"days":[1],"from":"17:00","to":"08:00"}]}' where species_id='71000000-0000-0000-0000-000000000064'$q$);
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_assert((select count(*)=1 from public.notifications),'Aviso ausente ou duplicado');
select public.test_assert((select link='/adote-uma-arvore?cidade=64' and type='system' from public.notifications),'Aviso perdeu cidade');
select public.test_assert((select notified_at is not null from public.tree_adoption_availability_alerts),'Aviso não foi consumido');
select public.test_assert((public.set_tree_adoption_availability_alert(64,true)->>'available')::boolean,'Oferta existente deixou cidadão esperando');
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_assert((select count(*)=0 from public.notifications),'Aviso enviado para outra cidade');
select public.test_assert((select notified_at is null from public.tree_adoption_availability_alerts),'Aviso de outra cidade foi consumido');
reset role;
select 'Retirada estruturada, horários, cadastro de espécie, alertas por cidade, privacidade, cancelamento e deduplicação OK';
