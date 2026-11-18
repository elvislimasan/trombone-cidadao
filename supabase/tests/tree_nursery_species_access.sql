-- Executar somente em banco LOCAL vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption.sql
\i supabase/migrations/433_tree_nursery_species_access.sql

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_assert(public.can_manage_tree_adoption(64)
  and not public.pode_gerenciar_arborizacao(64), 'Fixture precisa de atendente sem edição do inventário');

update public.city_tree_species set common_name='Espécie revisada pelo viveiro',
  scientific_name='Nome científico revisado', aliases=array['Nome regional'], origin='nativa',
  summary='Características revisadas', sidewalk_suitability='com_restricoes',
  planting_guidance='Avaliar as raízes e o espaço', illustration_url='https://example.test/nova-foto.png'
  where id='70000000-0000-0000-0000-000000000064';
select public.test_assert((select common_name='Espécie revisada pelo viveiro'
  and summary='Características revisadas' and illustration_url='https://example.test/nova-foto.png'
  from public.city_tree_species where id='70000000-0000-0000-0000-000000000064'),
  'Atendente não conseguiu editar espécie e foto padrão');
select public.test_assert((select bool_and(common_name='Espécie revisada pelo viveiro')
  from public.city_trees where species_id='70000000-0000-0000-0000-000000000064'),
  'Catálogo não sincronizou o nome das árvores vinculadas');

insert into public.city_tree_species(id,city_id,common_name)
  values('72000000-0000-0000-0000-000000000064',64,'Nova espécie do viveiro');
update public.city_tree_species set illustration_url=null where id='70000000-0000-0000-0000-000000000064';
select public.test_assert((select illustration_url is null from public.city_tree_species
  where id='70000000-0000-0000-0000-000000000064'), 'Atendente não conseguiu remover foto padrão');

with edited as (update public.city_tree_species set summary='Indevido' where city_id=65 returning id)
  select public.test_assert((select count(*)=0 from edited), 'Atendente alterou outra cidade');
select public.test_denied($q$insert into public.city_tree_species(city_id,common_name) values(65,'Indevida')$q$);
select public.test_denied($q$update public.city_tree_species set city_id=65 where city_id=64$q$);
with edited as (update public.city_trees set common_name='Alteração direta indevida' where city_id=64 returning id)
  select public.test_assert((select count(*)=0 from edited), 'Gestão de viveiro concedeu edição direta do inventário');
select public.test_denied($q$select public.consume_tree_species_ai_quota(64)$q$);

-- Revogar o acesso ao viveiro também revoga a manutenção do catálogo.
reset role;
create or replace function public.municipal_channel_action(p_user uuid,p_channel uuid,p_action text)
  returns boolean language sql as $$select false$$;
set role authenticated;
with edited as (update public.city_tree_species set summary='Acesso revogado' where city_id=64 returning id)
  select public.test_assert((select count(*)=0 from edited), 'Vínculo revogado ainda edita espécies');
set test.user_id='00000000-0000-0000-0000-000000000002';
with edited as (update public.city_tree_species set summary='Cidadão' where city_id=64 returning id)
  select public.test_assert((select count(*)=0 from edited), 'Cidadão recebeu edição de espécies');
select public.test_denied($q$insert into public.city_tree_species(city_id,common_name) values(64,'Cidadão')$q$);
set role anon;
select public.test_denied($q$update public.city_tree_species set illustration_url=null$q$);
reset role;
select 'Viveiros: espécie, características e foto editáveis pela equipe; cidade, revogação e inventário protegidos';
