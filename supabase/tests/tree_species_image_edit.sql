-- Executar somente em banco LOCAL vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/tree_species_illustration.sql
-- Adaptador da fixture antiga para o helper de arborização da migração 369.
create function public.pode_gerenciar_arborizacao(p_city_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$select public.pode_gerenciar_mapa_ruas(p_city_id)$$;
\i supabase/migrations/389_tree_species_image_edit.sql

insert into public.city_tree_species(id,city_id,common_name,illustration_url)
values('71000000-0000-0000-0000-000000000065',65,'Outra cidade','https://example.test/original.png');
create temp table image_edit_original_trees as select * from public.city_trees;

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
update public.city_tree_species set illustration_url='https://example.test/editada.png'
where id='70000000-0000-0000-0000-000000000064';
select public.test_assert((select illustration_url='https://example.test/editada.png' from public.city_tree_species where id='70000000-0000-0000-0000-000000000064'),'Gestor não conseguiu editar ilustração');
with edited as (update public.city_tree_species set illustration_url='https://example.test/indevida.png' where city_id=65 returning id)
select public.test_assert((select count(*)=0 from edited),'Gestor alterou ilustração de outra cidade');
select public.test_denied($q$update public.city_tree_species set city_id=65 where id='70000000-0000-0000-0000-000000000064'$q$);
select public.test_denied($q$update public.city_tree_species set common_name='Nome indevido' where id='70000000-0000-0000-0000-000000000064'$q$);
select public.test_reject($q$update public.city_tree_species set illustration_url=' ' where id='70000000-0000-0000-0000-000000000064'$q$);
update public.city_tree_species set illustration_url=null where id='70000000-0000-0000-0000-000000000064';
select public.test_assert((select illustration_url is null from public.city_tree_species where id='70000000-0000-0000-0000-000000000064'),'Remoção da ilustração falhou');
update public.city_tree_species set illustration_url='https://example.test/final.png' where id='70000000-0000-0000-0000-000000000064';

set test.user_id='00000000-0000-0000-0000-000000000002';
with edited as (update public.city_tree_species set illustration_url=null where city_id=64 returning id)
select public.test_assert((select count(*)=0 from edited),'Cidadão alterou imagem de espécie');
set test.user_id='00000000-0000-0000-0000-000000000003';
with edited as (update public.city_tree_species set illustration_url=null where city_id=64 returning id)
select public.test_assert((select count(*)=0 from edited),'Administrador sem concessão alterou imagem de espécie');
set role anon;
set test.user_id='';
select public.test_assert((select illustration_url='https://example.test/final.png' from public.city_tree_species where id='70000000-0000-0000-0000-000000000064'),'Consulta pública não recebeu a imagem atualizada');
select public.test_denied($q$update public.city_tree_species set illustration_url=null$q$);
reset role;
select public.test_assert(not exists(select * from public.city_trees except select * from image_edit_original_trees)
  and not exists(select * from image_edit_original_trees except select * from public.city_trees),'Alteração de ilustração modificou registros ou fotos reais de árvores');
select 'Edição da imagem de espécie: atualização e remoção autorizadas, RLS por cidade e foto real preservada OK';
