-- Somente banco local vazio e descartável. Usa o inventário e sua RLS reais;
-- os helpers municipais são adaptados à fixture mínima de cidades e perfis.
\set ON_ERROR_STOP on
\i supabase/tests/tree_species_details.sql
set timezone='America/Fortaleza';
update public.permission_rules set allowed=true where module='urban_planning';
create table public.orgao_categorias(city_id bigint,category_id text,canal_id uuid);
insert into public.orgao_categorias values(64,'poda','80000000-0000-0000-0000-000000000064');
create function public.pode_administrar_prefeitura(uuid,bigint) returns boolean language sql as $$select false$$;
create function public.municipal_channel_action(p_user uuid,p_channel uuid,p_action text) returns boolean language sql as $$
  select p_user='00000000-0000-0000-0000-000000000003'::uuid
    and p_channel='80000000-0000-0000-0000-000000000064'::uuid and p_action='receive'$$;
\i supabase/migrations/392_tree_adoption.sql
\i supabase/migrations/393_tree_adoption_explicit_availability.sql

create function public.test_adoption_payload(p_id text,p_type text default 'plantio') returns jsonb language sql as $$
  select jsonb_build_object('id',p_id,'city_id',64,'species_id','70000000-0000-0000-0000-000000000064',
    'request_type',p_type,'zone','urbana','planting_place','calcada','purpose','sombra','overhead_wiring','sim',
    'provider','viveiro_municipal','address','Rua do plantio, 20','latitude',-8.6,'longitude',-38.57,'commitment',true)
$$;
set role anon;
select public.test_denied($q$select * from public.tree_adoption_requests$q$);
select public.test_denied($q$select public.submit_tree_adoption('{}')$q$);
reset role;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_assert(not public.can_manage_tree_adoption(64),'Cidadão recebeu gestão');
-- Sem cadastro e sob consulta não são ofertas disponíveis.
select public.test_reject($q$select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000001'))$q$);
select public.test_assert((select count(*)=0 from public.tree_adoption_requests),'Falta de disponibilidade gravou pedido');
select public.test_assert((select count(*)=0 from public.tree_adoption_events),'Falta de disponibilidade gravou histórico');
reset role;
insert into public.tree_species_availability(species_id,provider,status) values('70000000-0000-0000-0000-000000000064','viveiro_municipal','sob_consulta');
set role authenticated;
select public.test_reject($q$select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000001'))$q$);
reset role;
update public.tree_species_availability set status='disponivel';
set role authenticated;
select public.test_reject($q$select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000001') || '{"provider":"instituto_florestar"}')$q$);
select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000001'));
select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000001'));
select public.test_assert((select count(*)=1 from public.tree_adoption_requests),'Reenvio duplicou pedido');
select public.test_assert((select count(*)=1 from public.tree_adoption_events),'Reenvio duplicou evento');
select public.test_denied($q$update public.tree_adoption_requests set status='concluida'$q$);
select public.test_reject($q$select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000002') || '{"city_id":65}')$q$);
select public.test_reject($q$select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000002') || '{"commitment":false}')$q$);
select public.test_denied($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','solicitada','aprovada','Aprovação indevida')$q$);

set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_assert(public.can_manage_tree_adoption(64) and not public.can_manage_tree_adoption(65),'Escopo de cidade incorreto');
select public.test_reject($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','solicitada','concluida','Pular análise')$q$);
select public.test_reject($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001',null,'em_analise','Sem etapa esperada')$q$);
select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','solicitada','em_analise','Análise do local e da rede aérea.');
select public.test_reject($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','solicitada','em_analise','Atualização concorrente')$q$);
select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','em_analise','aguardando_informacao','Informe a largura da calçada.');
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','aguardando_informacao','aguardando_informacao','A calçada tem quatro metros de largura.');
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_assert(public.can_manage_tree_adoption(64) and not public.can_manage_tree_adoption(65),'Atendente fora do escopo');
select public.test_assert(not public.can_dispatch_tree_adoption(64),'Atendente recebeu poder de aprovação');
select public.test_denied($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','aguardando_informacao','aprovada','Atendente tentando aprovar','{"species_id":"70000000-0000-0000-0000-000000000064","provider":"instituto_florestar"}')$q$);
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_reject($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','aguardando_informacao','aprovada','Fornecedor sem disponibilidade cadastrada.',
  '{"species_id":"70000000-0000-0000-0000-000000000064","provider":"instituto_florestar"}')$q$);
insert into public.tree_species_availability(species_id,provider,status) values('70000000-0000-0000-0000-000000000064','instituto_florestar','disponivel');
select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','aguardando_informacao','aprovada','Espécie adequada. Fornecedor confirmou disponibilidade.',
  '{"species_id":"70000000-0000-0000-0000-000000000064","provider":"instituto_florestar"}');
select public.test_reject($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','aprovada','pronta_retirada','Plantio não é retirada')$q$);
select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','aprovada','agendada','Equipe agendada para o local solicitado.',jsonb_build_object('scheduled_at',now()+interval '2 days'));
select public.test_reject($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','agendada','concluida','Data futura indevida',jsonb_build_object('fulfilled_on',current_date+1))$q$);
select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','agendada','concluida','Plantio executado no local com a espécie aprovada.',jsonb_build_object('fulfilled_on',current_date));
select public.test_assert((select tree_id is not null from public.tree_adoption_requests),'Plantio não entrou no inventário');
select public.test_assert((select t.city_id=r.city_id and t.species_id=r.approved_species_id and t.latitude=r.latitude and t.longitude=r.longitude
  from public.tree_adoption_requests r join public.city_trees t on t.id=r.tree_id),'Plantio perdeu a espécie, cidade ou localização');
select public.test_reject($q$select public.update_tree_adoption('90000000-0000-0000-0000-000000000001','concluida','concluida','Duplicar o plantio',jsonb_build_object('fulfilled_on',current_date))$q$);

set test.user_id='00000000-0000-0000-0000-000000000002';
select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000002','muda'));
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.update_tree_adoption('90000000-0000-0000-0000-000000000002','solicitada','em_analise','Analisando local e disponibilidade.');
select public.update_tree_adoption('90000000-0000-0000-0000-000000000002','em_analise','aprovada','Espécie aprovada e muda disponível.',
  '{"species_id":"70000000-0000-0000-0000-000000000064","provider":"viveiro_municipal"}');
select public.update_tree_adoption('90000000-0000-0000-0000-000000000002','aprovada','pronta_retirada','Retire no viveiro municipal das 8h às 12h.');
select public.update_tree_adoption('90000000-0000-0000-0000-000000000002','pronta_retirada','concluida','Muda entregue ao cidadão.',jsonb_build_object('fulfilled_on',current_date));
select public.test_assert((select tree_id is null from public.tree_adoption_requests where request_type='muda'),'Entrega criou árvore antes de plantada');

update public.tree_species_availability set status='indisponivel' where provider='viveiro_municipal';
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_reject($q$select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000003'))$q$);
-- Reenvio idempotente ainda retorna o pedido já registrado após a revogação.
select public.submit_tree_adoption(public.test_adoption_payload('90000000-0000-0000-0000-000000000001'));
select public.test_assert((select count(*)=2 from public.tree_adoption_requests),'Reenvio após revogação alterou os pedidos');
select public.test_denied($q$insert into public.tree_species_availability(species_id,provider,status) values('70000000-0000-0000-0000-000000000064','instituto_florestar','disponivel')$q$);
set test.user_id='00000000-0000-0000-0000-000000000004';
-- Usuário sem concessão neste teste não pode ler pedidos e eventos alheios.
reset role;
create or replace function public.pode_gerenciar_arborizacao(p_city_id bigint) returns boolean language sql stable security definer as $$
  select auth.uid()='00000000-0000-0000-0000-000000000001'::uuid and p_city_id=64$$;
set role authenticated;
select public.test_assert((select count(*)=0 from public.tree_adoption_requests),'Pedido vazou para outro cidadão');
select public.test_assert((select count(*)=0 from public.tree_adoption_events),'Histórico vazou para outro cidadão');
reset role;
select 'Adote uma árvore: permissões, privacidade, idempotência, concorrência, resposta, disponibilidade, retirada e inventário OK';
