-- Executar somente no PostgreSQL local vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption_direct_statuses.sql
\i supabase/migrations/398_tree_nurseries.sql
\i supabase/migrations/400_tree_adoption_notifications.sql

reset role;
update public.tree_species_availability set status='disponivel';
create function public.test_notification_payload(p_id text,p_type text) returns jsonb language sql as $$
  select public.test_multiple_adoption(p_id,p_type)||jsonb_build_object(
    'species_id',a.species_id,'provider',a.provider,
    'items',jsonb_build_array(jsonb_build_object('species_id',a.species_id,'provider',a.provider,'quantity',1)))
  from public.tree_species_availability a join public.city_tree_species s on s.id=a.species_id
  where s.city_id=64 and a.status='disponivel' order by a.species_id,a.provider limit 1
$$;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.submit_tree_adoption(public.test_notification_payload('a0000000-0000-0000-0000-000000000001','muda'));
select public.submit_tree_adoption(public.test_notification_payload('a0000000-0000-0000-0000-000000000002','plantio'));
select public.submit_tree_adoption(public.test_notification_payload('a0000000-0000-0000-0000-000000000003','muda'));
select public.submit_tree_adoption(public.test_notification_payload('a0000000-0000-0000-0000-000000000004','muda'));
reset role;
select public.test_assert((select count(*)=0 from public.notifications where type='tree_adoption_update'),'Envio inicial notificou o próprio autor');

-- Atendente pode orientar; cada evento confirmado gera um aviso, inclusive
-- mensagens com o mesmo status. Um status + mensagem não pode gerar dois.
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','solicitada','em_analise','Analisando o pedido de mudas.');
reset role;
select public.test_assert((select count(*)=1 from public.notifications where type='tree_adoption_update'),'Mudança de status não gerou exatamente um aviso');
select public.test_assert((select user_id='00000000-0000-0000-0000-000000000002' and title='Atualização no pedido de mudas' and message like '%Em análise técnica%' and link='/adote-uma-arvore?cidade=64&aba=minhas&pedido=a0000000-0000-0000-0000-000000000001' and not is_read from public.notifications where type='tree_adoption_update'),'Aviso perdeu autor, status, título ou link direto');
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','em_analise','em_analise','Orientação adicional sobre o local de plantio.');
select public.test_denied($q$select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','em_analise','aprovada','Atendente tentando aprovar o pedido.')$q$);
reset role;
select public.test_assert((select count(*)=2 from public.notifications where type='tree_adoption_update'),'Orientação não notificou ou tentativa recusada gerou aviso');

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','em_analise','aguardando_informacao','Informe o número do imóvel e o espaço disponível.');
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','aguardando_informacao','aguardando_informacao','Informei a referência do local conforme solicitado.');
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000004','solicitada','cancelada','Não preciso mais das mudas neste momento.');
select public.submit_tree_adoption(public.test_notification_payload('a0000000-0000-0000-0000-000000000001','muda'));
reset role;
select public.test_assert((select count(*)=3 from public.notifications where type='tree_adoption_update'),'Resposta, cancelamento próprio ou reenvio gerou push indevido');

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','aguardando_informacao','aprovada','Espécies e local aprovados pela equipe.');
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','aprovada','pronta_retirada','Mudas separadas. Retire na Rua Privada, 10.');
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000002','solicitada','aprovada','Local e espécies aprovados para plantio.');
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000002','aprovada','agendada','Plantio confirmado para o agendamento.',jsonb_build_object('scheduled_at',now()+interval '2 days'));
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000003','solicitada','cancelada','Cancelado pela equipe responsável.');
select public.test_reject($q$select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','aprovada','concluida','Reenvio com status anterior desatualizado.',jsonb_build_object('fulfilled_on',current_date))$q$);
reset role;
select public.test_assert((select count(*)=8 from public.notifications where type='tree_adoption_update'),'Aprovação, retirada, agendamento ou cancelamento perdeu aviso');
select public.test_assert(exists(select 1 from public.notifications where type='tree_adoption_update' and message like '%Muda pronta para retirada%'),'Retirada pronta não aparece no push');
select public.test_assert(exists(select 1 from public.notifications where type='tree_adoption_update' and title='Atualização no pedido de plantio' and message like '%Plantio agendado%'),'Plantio perdeu status ou título');
select public.test_assert(not exists(select 1 from public.notifications where type='tree_adoption_update' and (message like '%Rua Privada%' or user_id<>'00000000-0000-0000-0000-000000000002')),'Push expôs texto do atendimento ou foi enviado a outro usuário');

-- A notificação e o evento são atômicos com a atualização do pedido.
begin;
set local role authenticated;
set local test.user_id='00000000-0000-0000-0000-000000000003';
select public.update_tree_adoption('a0000000-0000-0000-0000-000000000001','pronta_retirada','pronta_retirada','Orientação dentro de transação revertida.');
rollback;
select public.test_assert((select count(*)=8 from public.notifications where type='tree_adoption_update'),'Rollback deixou uma notificação sem atualização confirmada');

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000004';
select public.test_assert((select count(*)=0 from public.notifications where type='tree_adoption_update'),'Aviso vazou para outro cidadão');
select public.test_denied($q$insert into public.tree_adoption_events(request_id,author_id,status,message) values('a0000000-0000-0000-0000-000000000001',auth.uid(),'pronta_retirada','Evento de outra pessoa não pode ser forjado.')$q$);
select public.test_denied($q$select public.notify_tree_adoption_update()$q$);
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_assert((select count(*)=8 from public.notifications where type='tree_adoption_update'),'Solicitante não consegue ler os próprios avisos');
reset role;
select 'Notificações de mudas: status, orientações, destinatário, link direto, RLS, reenvio e rollback OK';
