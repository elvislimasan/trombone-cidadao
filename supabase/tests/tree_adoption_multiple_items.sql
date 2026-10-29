-- Somente banco local vazio e descartável; inclui regressões anteriores.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption_pickup_alerts.sql
reset role;
\i supabase/migrations/395_tree_adoption_multiple_items.sql
update public.tree_species_availability set status='disponivel';
insert into public.tree_species_availability(species_id,provider,status)
values('71000000-0000-0000-0000-000000000064','instituto_florestar','disponivel')
on conflict(species_id,provider) do update set status='disponivel';

create function public.test_multiple_adoption(p_id text,p_type text default 'plantio') returns jsonb language sql as $$
  select public.test_adoption_payload(p_id,p_type)||jsonb_build_object(
    'requester_name','Maria da Silva','requester_phone','(87) 99999-9999','requester_email','maria@example.test',
    'items',jsonb_build_array(
      jsonb_build_object('species_id','70000000-0000-0000-0000-000000000064','provider','viveiro_municipal','quantity',3),
      jsonb_build_object('species_id','71000000-0000-0000-0000-000000000064','provider','instituto_florestar','quantity',2)))
$$;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_reject($q$select public.submit_tree_adoption(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001')||'{"city_id":65}')$q$);
select public.test_reject($q$select public.submit_tree_adoption(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001')||'{"requester_name":""}')$q$);
select public.test_reject($q$select public.submit_tree_adoption(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001')||'{"requester_phone":"abc"}')$q$);
select public.test_reject($q$select public.submit_tree_adoption(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001')||'{"items":null}')$q$);
select public.test_reject($q$select public.submit_tree_adoption(jsonb_set(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001'),'{items,1,quantity}','0'))$q$);
select public.test_reject($q$select public.submit_tree_adoption(jsonb_set(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001'),'{items,1,quantity}','1.5'))$q$);
select public.test_reject($q$select public.submit_tree_adoption(jsonb_set(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001'),'{items,1,provider}','"inexistente"'))$q$);
select public.test_reject($q$select public.submit_tree_adoption(jsonb_set(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001'),'{items,1,species_id}','"70000000-0000-0000-0000-000000000064"'))$q$);
select public.submit_tree_adoption(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001'));
select public.submit_tree_adoption(public.test_multiple_adoption('95000000-0000-0000-0000-000000000001'));
select public.test_assert((select count(*)=1 from public.tree_adoption_events where request_id='95000000-0000-0000-0000-000000000001'),'Reenvio duplicou evento');
select public.test_assert((select requester_phone='(87) 99999-9999' and jsonb_array_length(items)=2 from public.tree_adoption_requests where id='95000000-0000-0000-0000-000000000001'),'Perdeu contato ou espécies');
select public.test_denied($q$select public.update_tree_adoption('95000000-0000-0000-0000-000000000001','solicitada','concluida','Cidadão tentando concluir.',jsonb_build_object('fulfilled_on',current_date))$q$);
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_denied($q$select public.update_tree_adoption('95000000-0000-0000-0000-000000000001','solicitada','concluida','Atendente tentando concluir.',jsonb_build_object('fulfilled_on',current_date))$q$);
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_reject($q$select public.update_tree_adoption('95000000-0000-0000-0000-000000000001','solicitada','concluida','Data futura.',jsonb_build_object('fulfilled_on',current_date+1))$q$);
select public.update_tree_adoption('95000000-0000-0000-0000-000000000001','solicitada','concluida','Cinco árvores plantadas após avaliação técnica.',jsonb_build_object('fulfilled_on',current_date));
select public.test_assert((select count(*)=5 from public.city_trees where adoption_request_id='95000000-0000-0000-0000-000000000001'),'Não criou uma árvore por unidade');
select public.test_assert((select count(*)=3 from public.city_trees where adoption_request_id='95000000-0000-0000-0000-000000000001' and species_id='70000000-0000-0000-0000-000000000064'),'Quantidade por espécie incorreta');
select public.test_reject($q$select public.update_tree_adoption('95000000-0000-0000-0000-000000000001','solicitada','concluida','Repetir atendimento.',jsonb_build_object('fulfilled_on',current_date))$q$);
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.submit_tree_adoption(public.test_multiple_adoption('95000000-0000-0000-0000-000000000002','muda'));
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.update_tree_adoption('95000000-0000-0000-0000-000000000002','solicitada','concluida','Cinco mudas entregues ao solicitante.',jsonb_build_object('fulfilled_on',current_date));
select public.test_assert((select count(*)=0 from public.city_trees where adoption_request_id='95000000-0000-0000-0000-000000000002'),'Entrega criou inventário');
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.test_assert((select count(*)=0 from public.tree_adoption_requests where id::text like '95000000%'),'Contatos vazaram a outro usuário');
reset role;
select 'Múltiplas espécies, contatos privados, restrição de cidade, conclusão direta e inventário por quantidade OK';
