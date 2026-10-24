-- Executar somente em banco LOCAL vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/arborization_inventory.sql
\i supabase/migrations/387_tree_species_illustration.sql

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
insert into public.city_tree_species(id,city_id,common_name,illustration_url)
values('70000000-0000-0000-0000-000000000064',64,'Espécie ilustrada','https://example.test/nim.png');
insert into public.city_tree_species(city_id,common_name) values(64,'Espécie sem ilustração');
select public.test_reject($q$insert into public.city_tree_species(city_id,common_name,illustration_url) values(64,'Imagem vazia',' ')$q$);
select public.test_reject($q$insert into public.city_tree_species(city_id,common_name,illustration_url) values(64,'Imagem longa',repeat('x',2001))$q$);
select public.test_denied($q$insert into public.city_tree_species(city_id,common_name,illustration_url) values(65,'Outra cidade','https://example.test/nim.png')$q$);
insert into public.city_trees(city_id,species_id,latitude,longitude)
values(64,'70000000-0000-0000-0000-000000000064',-8.6,-38.57);
select public.test_assert((select photo_url is null from public.city_trees where species_id='70000000-0000-0000-0000-000000000064'),'Ilustração foi copiada para o campo de foto real');

set role anon;
set test.user_id='';
select public.test_assert((select illustration_url='https://example.test/nim.png' from public.city_tree_species where id='70000000-0000-0000-0000-000000000064'),'Ilustração não está disponível na consulta pública');
select public.test_assert((select illustration_url is null from public.city_tree_species where common_name='Espécie sem ilustração'),'Imagem opcional tornou-se obrigatória');
select public.test_denied($q$insert into public.city_tree_species(city_id,common_name,illustration_url) values(64,'Anônimo','https://example.test/a.png')$q$);
reset role;
select 'Ilustração de espécie: campo opcional, consulta pública, RLS por cidade e separação da foto real OK';
