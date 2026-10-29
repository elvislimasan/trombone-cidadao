-- Banco local vazio e descartável; inclui regressões das migrações anteriores.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption_multiple_items.sql
\i supabase/migrations/396_tree_adoption_direct_statuses.sql
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.submit_tree_adoption(public.test_multiple_adoption('96000000-0000-0000-0000-000000000001'));
select public.submit_tree_adoption(public.test_multiple_adoption('96000000-0000-0000-0000-000000000002','muda'));
select public.submit_tree_adoption(public.test_multiple_adoption('96000000-0000-0000-0000-000000000003','muda'));
select public.submit_tree_adoption(public.test_multiple_adoption('96000000-0000-0000-0000-000000000004','muda'));
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_reject($q$select public.update_tree_adoption('96000000-0000-0000-0000-000000000001','solicitada','agendada','Agendar sem informar data.')$q$);
select public.test_reject($q$select public.update_tree_adoption('96000000-0000-0000-0000-000000000001','solicitada','pronta_retirada','Status não aplicável ao plantio.')$q$);
select public.update_tree_adoption('96000000-0000-0000-0000-000000000001','solicitada','agendada','Plantio agendado diretamente.',jsonb_build_object('scheduled_at',now()+interval '2 days'));
select public.test_assert((select status='agendada' and approved_species_id=species_id and confirmed_provider=provider and scheduled_at is not null from public.tree_adoption_requests where id='96000000-0000-0000-0000-000000000001'),'Agendamento direto perdeu a confirmação');
select public.update_tree_adoption('96000000-0000-0000-0000-000000000001','agendada','aguardando_informacao','Aguardando orientação sobre acesso.');
select public.test_assert((select scheduled_at is null from public.tree_adoption_requests where id='96000000-0000-0000-0000-000000000001'),'Agendamento obsoleto mantido');
select public.update_tree_adoption('96000000-0000-0000-0000-000000000001','aguardando_informacao','solicitada','Pedido devolvido à fila de entrada.');
select public.update_tree_adoption('96000000-0000-0000-0000-000000000001','solicitada','aguardando_disponibilidade','Aguardando o fornecedor confirmar o lote.');
select public.update_tree_adoption('96000000-0000-0000-0000-000000000001','aguardando_disponibilidade','concluida','Plantio realizado e conferido.',jsonb_build_object('fulfilled_on',current_date));
select public.test_assert((select count(*)=5 from public.city_trees where adoption_request_id='96000000-0000-0000-0000-000000000001'),'Conclusão direta perdeu quantidades');
select public.test_reject($q$select public.update_tree_adoption('96000000-0000-0000-0000-000000000002','solicitada','agendada','Muda não tem agendamento de plantio.',jsonb_build_object('scheduled_at',now()+interval '2 days'))$q$);
select public.update_tree_adoption('96000000-0000-0000-0000-000000000002','solicitada','pronta_retirada','Mudas separadas no viveiro para retirada.');
select public.test_assert((select approved_species_id is not null and confirmed_provider is not null from public.tree_adoption_requests where id='96000000-0000-0000-0000-000000000002'),'Retirada direta não confirmou espécies e fornecedor');
select public.update_tree_adoption('96000000-0000-0000-0000-000000000002','pronta_retirada','em_analise','Reavaliando o local informado no pedido.');
select public.update_tree_adoption('96000000-0000-0000-0000-000000000003','solicitada','aprovada','Todas as espécies aprovadas diretamente.');
select public.test_reject($q$select public.update_tree_adoption('96000000-0000-0000-0000-000000000003','solicitada','concluida','Versão de status desatualizada.',jsonb_build_object('fulfilled_on',current_date))$q$);
select public.test_reject($q$select public.update_tree_adoption('96000000-0000-0000-0000-000000000003','aprovada','inventado','Status inexistente não permitido.')$q$);
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_denied($q$select public.update_tree_adoption('96000000-0000-0000-0000-000000000004','solicitada','pronta_retirada','Atendente tentando confirmar retirada.')$q$);
select public.test_denied($q$select public.update_tree_adoption('96000000-0000-0000-0000-000000000004','solicitada','aprovada','Atendente tentando aprovar.')$q$);
select public.update_tree_adoption('96000000-0000-0000-0000-000000000004','solicitada','aguardando_informacao','Informe a referência do local.');
reset role;
update public.tree_species_availability set status='indisponivel' where species_id='71000000-0000-0000-0000-000000000064';
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_reject($q$select public.update_tree_adoption('96000000-0000-0000-0000-000000000004','aguardando_informacao','pronta_retirada','Não pode ignorar a disponibilidade.')$q$);
reset role;
select 'Status diretos, agendamento, retirada, permissões e validações de atendimento OK';
