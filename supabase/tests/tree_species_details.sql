-- Executar somente em banco LOCAL vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/tree_species_image_edit.sql
create table if not exists auth.users(id uuid primary key);
insert into auth.users(id) values ('00000000-0000-0000-0000-000000000001') on conflict do nothing;
\i supabase/migrations/390_tree_species_details.sql
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
update public.city_tree_species set common_name='Nome principal atualizado', scientific_name='Nome científico',
  aliases=array['Nome regional', 'Outro nome'], summary='Características e usos tradicionais',
  sidewalk_suitability='com_restricoes', planting_guidance='Conferir espaço disponível'
  where id='70000000-0000-0000-0000-000000000064';
select public.test_assert((select bool_and(common_name='Nome principal atualizado' and scientific_name='Nome científico')
  from public.city_trees where species_id='70000000-0000-0000-0000-000000000064'),'Nome não propagado ao inventário');
select public.test_assert((select aliases=array['Nome regional','Outro nome'] and summary is not null
  from public.city_tree_species where id='70000000-0000-0000-0000-000000000064'),'Dados da espécie não foram salvos');
with edited as (update public.city_tree_species set common_name='Indevido' where city_id=65 returning id)
  select public.test_assert((select count(*)=0 from edited),'Gestor alterou outra cidade');
select public.test_denied($q$update public.city_tree_species set city_id=65$q$);
select public.test_reject($q$update public.city_tree_species set sidewalk_suitability='invalida' where city_id=64$q$);
select public.test_reject($q$update public.city_tree_species set summary=repeat('x',5001) where city_id=64$q$);
select public.test_denied($q$select public.consume_tree_species_ai_quota(65)$q$);
do $$begin
  for i in 1..30 loop
    perform public.test_assert(public.consume_tree_species_ai_quota(64),'Cota recusou geração válida');
  end loop;
  perform public.test_assert(not public.consume_tree_species_ai_quota(64),'Cota excedeu 30 gerações');
end $$;
set test.user_id='00000000-0000-0000-0000-000000000002';
with edited as (update public.city_tree_species set summary='Indevido' where city_id=64 returning id)
  select public.test_assert((select count(*)=0 from edited),'Cidadão alterou espécie');
select public.test_denied($q$select public.consume_tree_species_ai_quota(64)$q$);
set role anon;
select public.test_denied($q$update public.city_tree_species set summary=null$q$);
select public.test_assert((select common_name='Nome principal atualizado' and aliases[1]='Nome regional'
  from public.city_tree_species where id='70000000-0000-0000-0000-000000000064'),'Consulta pública não recebeu nomes');
reset role;
select 'Espécies: nomes, resumo, sincronização, RLS e cota de IA OK';
