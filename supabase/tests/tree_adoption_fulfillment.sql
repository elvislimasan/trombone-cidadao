-- Somente PostgreSQL local vazio e descartável, com as regressões anteriores.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption_edit_consultation.sql
reset role;
\i supabase/migrations/408_tree_adoption_citizen_receipt.sql
create table if not exists auth.users(id uuid primary key);
insert into auth.users(id) select id from public.profiles on conflict do nothing;
\i supabase/migrations/425_tree_adoption_planting_settings.sql
\i supabase/migrations/427_tree_adoption_seedlings_settings.sql
\i supabase/migrations/432_tree_adoption_fulfillment.sql
update public.tree_species_availability set status='disponivel';
insert into public.profiles(id) values('a4320000-0000-0000-0000-000000000005');
insert into auth.users(id) values('a4320000-0000-0000-0000-000000000005');
create function public.test_fulfillment_payload(p_id text,p_method text default 'entrega') returns jsonb language sql as $$
  select public.test_multiple_adoption(p_id,'muda') || jsonb_build_object('requester_cpf','52998224725','fulfillment_method',p_method,
    'items',jsonb_build_array(jsonb_build_object('species_id','70000000-0000-0000-0000-000000000064','provider',
      (select provider from public.tree_species_availability where species_id='70000000-0000-0000-0000-000000000064' and status='disponivel' order by provider limit 1),'quantity',1)))
$$;
set role anon;
select public.test_denied($q$select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001'))$q$);
reset role;
set role authenticated;
set test.user_id='a4320000-0000-0000-0000-000000000005';
select public.test_reject($q$select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001','inventada'))$q$);
select public.test_reject($q$select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001',null))$q$);
select public.test_reject($q$select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001') || '{"request_type":"plantio"}')$q$);
select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001'));
select public.test_assert((select fulfillment_method='entrega' and address='Rua do plantio, 20' from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000001'),'Entrega perdeu a modalidade ou o endereço');
-- Reenvio mantém a escolha original e não duplica eventos.
select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001','retirada'));
select public.test_assert((select fulfillment_method='entrega' from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000001'),'Reenvio alterou a modalidade');
select public.test_assert((select count(*)=1 from public.tree_adoption_events where request_id='a4320000-0000-0000-0000-000000000001'),'Reenvio duplicou histórico');
-- Compatibilidade com clientes anteriores: ausência da chave conserva retirada.
select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000002') - 'fulfillment_method');
select public.test_assert((select fulfillment_method='retirada' from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000002'),'Cliente antigo perdeu a retirada');
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.test_denied($q$select public.edit_tree_adoption('a4320000-0000-0000-0000-000000000001',now(),public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001','retirada'))$q$);
set test.user_id='a4320000-0000-0000-0000-000000000005';
select public.test_reject($q$select public.edit_tree_adoption('a4320000-0000-0000-0000-000000000001','2000-01-01',public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001','retirada'))$q$);
select public.edit_tree_adoption('a4320000-0000-0000-0000-000000000001',(select updated_at from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000001'),public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001','retirada'));
select public.test_assert((select fulfillment_method='retirada' and status='em_analise' and approved_species_id is null and scheduled_at is null from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000001'),'Troca não retornou à análise');
select public.edit_tree_adoption('a4320000-0000-0000-0000-000000000001',(select updated_at from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000001'),public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000001','entrega'));
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_reject($q$select public.update_tree_adoption('a4320000-0000-0000-0000-000000000001','em_analise','pronta_retirada','Não mandar o cidadão retirar um pedido de entrega.')$q$);
select public.update_tree_adoption('a4320000-0000-0000-0000-000000000001','em_analise','concluida','Uma muda entregue no endereço cadastrado.',jsonb_build_object('fulfilled_on',current_date));
select public.test_assert((select status='concluida' and fulfillment_method='entrega' from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000001'),'Entrega não foi concluída');
select public.test_assert((select count(*)=0 from public.city_trees where adoption_request_id='a4320000-0000-0000-0000-000000000001'),'Entrega criou árvore sem comprovação de plantio');
set test.user_id='a4320000-0000-0000-0000-000000000005';
select public.submit_tree_adoption(jsonb_set(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000003','retirada'),'{items,0,quantity}','5'));
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.update_tree_adoption('a4320000-0000-0000-0000-000000000003','solicitada','concluida','Cinco mudas retiradas no viveiro municipal.',jsonb_build_object('fulfilled_on',current_date));
select public.update_tree_adoption('a4320000-0000-0000-0000-000000000002','solicitada','pronta_retirada','Retirar a muda no viveiro municipal após confirmação.');
set test.user_id='a4320000-0000-0000-0000-000000000005';
-- Cinco mudas retiradas e uma entrega: a retirada adicional deve falhar.
select public.test_reject($q$select public.confirm_tree_adoption_receipt('a4320000-0000-0000-0000-000000000002')$q$);
select public.test_assert((select status='pronta_retirada' from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000002'),'Falha da cota deixou conclusão parcial');
select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000005','entrega'));
-- Só o gestor da cidade pode pausar a entrega; mudas e plantio não mudam.
select public.test_denied($q$insert into public.tree_adoption_settings(city_id,delivery_enabled) values(64,false)$q$);
set test.user_id='00000000-0000-0000-0000-000000000001';
insert into public.tree_adoption_settings(city_id,planting_enabled,seedlings_enabled,delivery_enabled) values(64,true,true,false);
select public.test_assert((select planting_enabled and seedlings_enabled and not delivery_enabled from public.tree_adoption_settings where city_id=64),'Pausa de entrega alterou outra modalidade');
set test.user_id='a4320000-0000-0000-0000-000000000005';
select public.test_reject($q$select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000004','entrega'))$q$);
select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000004','retirada'));
select public.test_reject($q$select public.edit_tree_adoption('a4320000-0000-0000-0000-000000000004',(select updated_at from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000004'),public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000004','entrega'))$q$);
-- Entrega anterior à pausa permanece editável e o reenvio não duplica pedido.
select public.edit_tree_adoption('a4320000-0000-0000-0000-000000000005',(select updated_at from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000005'),public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000005','entrega'));
select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000005','entrega'));
select public.test_assert((select fulfillment_method='entrega' and status='em_analise' from public.tree_adoption_requests where id='a4320000-0000-0000-0000-000000000005'),'Pausa cancelou uma entrega existente');
set test.user_id='00000000-0000-0000-0000-000000000001';
update public.tree_adoption_settings set delivery_enabled=true where city_id=64;
set test.user_id='a4320000-0000-0000-0000-000000000005';
select public.submit_tree_adoption(public.test_fulfillment_payload('a4320000-0000-0000-0000-000000000006','entrega'));
reset role;
select 'Entrega/retirada: persistência, idempotência, autorização, concorrência, transições e cota compartilhada OK';
