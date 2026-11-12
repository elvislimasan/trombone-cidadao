-- Banco local vazio e descartável. Inclui as regressões anteriores.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption_direct_statuses.sql
reset role;
\i supabase/migrations/398_tree_nurseries.sql
\i supabase/migrations/420_tree_adoption_monthly_cpf_limit.sql
\i supabase/migrations/421_tree_adoption_request_edit.sql
\i supabase/migrations/424_tree_adoption_edit_consultation.sql

update public.tree_species_availability set status='disponivel';
insert into public.tree_nurseries(id,city_id,provider,name)
values('a4240000-0000-0000-0000-000000000064',64,'viveiro_consulta','Viveiro sob consulta');
insert into public.tree_species_availability(species_id,nursery_id,provider,status)
values('71000000-0000-0000-0000-000000000064','a4240000-0000-0000-0000-000000000064','viveiro_consulta','sob_consulta');
create function public.test_consultation_changes() returns jsonb language sql as $$
  select public.test_multiple_adoption('a4240000-0000-0000-0000-000000000001') || jsonb_build_object('items',jsonb_build_array(
    jsonb_build_object('species_id','71000000-0000-0000-0000-000000000064','provider','viveiro_consulta','quantity',1)))
$$;

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.submit_tree_adoption(public.test_multiple_adoption('a4240000-0000-0000-0000-000000000001') || jsonb_build_object('items',jsonb_build_array(
  jsonb_build_object('species_id','70000000-0000-0000-0000-000000000064','provider',
    (select provider from public.tree_species_availability where species_id='70000000-0000-0000-0000-000000000064' and status='disponivel' order by provider limit 1),'quantity',1))));
-- Somente a edição permite a oferta sob consulta.
select public.test_reject($q$select public.submit_tree_adoption(public.test_consultation_changes() || '{"id":"a4240000-0000-0000-0000-000000000002"}')$q$);
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.test_denied($q$select public.edit_tree_adoption('a4240000-0000-0000-0000-000000000001',now(),public.test_consultation_changes())$q$);
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_reject($q$select public.edit_tree_adoption('a4240000-0000-0000-0000-000000000001','2000-01-01',public.test_consultation_changes())$q$);
select public.edit_tree_adoption('a4240000-0000-0000-0000-000000000001',
  (select updated_at from public.tree_adoption_requests where id='a4240000-0000-0000-0000-000000000001'),public.test_consultation_changes());
select public.test_assert((select provider='viveiro_consulta' and species_id='71000000-0000-0000-0000-000000000064'
  and status='em_analise' and approved_species_id is null and confirmed_provider is null and scheduled_at is null
  from public.tree_adoption_requests where id='a4240000-0000-0000-0000-000000000001'),'Edição perdeu a preferência ou confirmou o estoque');
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_reject($q$select public.update_tree_adoption('a4240000-0000-0000-0000-000000000001','em_analise','aprovada','Aprovar sem disponibilidade confirmada.')$q$);
reset role;
update public.tree_species_availability set status='indisponivel' where provider='viveiro_consulta';
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_reject($q$select public.edit_tree_adoption('a4240000-0000-0000-0000-000000000001',
  (select updated_at from public.tree_adoption_requests where id='a4240000-0000-0000-0000-000000000001'),public.test_consultation_changes())$q$);
reset role;
update public.tree_species_availability set status='disponivel' where provider='viveiro_consulta';
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.update_tree_adoption('a4240000-0000-0000-0000-000000000001','em_analise','aprovada','Disponibilidade confirmada com o viveiro.');
select public.test_assert((select status='aprovada' and confirmed_provider='viveiro_consulta'
  from public.tree_adoption_requests where id='a4240000-0000-0000-0000-000000000001'),'Não aprovou após confirmar disponibilidade');
reset role;
select 'Edição sob consulta, autorização, concorrência e confirmação de disponibilidade OK';
