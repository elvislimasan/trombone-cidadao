-- Banco LOCAL vazio e descartável; sem dados remotos.
\set ON_ERROR_STOP on
\i supabase/tests/arborization_inventory.sql
create function public.pode_gerenciar_arborizacao(p_city_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$select public.pode_gerenciar_mapa_ruas(p_city_id)$$;
\i supabase/migrations/410_tree_planning_and_surveys.sql

create temp table original_trees as select id,status,planted_at,created_at from public.city_trees;
insert into public.pavement_streets(id,city_id,name) values
('81000000-0000-0000-0000-000000000064',64,'Rua das Flores'),('81000000-0000-0000-0000-000000000065',65,'Rua de Recife');
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
insert into public.city_trees(id,city_id,common_name,status,planting_year,latitude,longitude,street_id,street_name,bairro_id,planting_site,sidewalk_width,power_lines,height_m,dap_cm,health)
values('82000000-0000-0000-0000-000000000064',64,'Ipê','planejada',2027,-8.63,-38.59,'81000000-0000-0000-0000-000000000064','Nome incorreto','10000000-0000-0000-0000-000000000064','calcada','media','baixa',6,20,'boa');
select public.test_assert((select street_name='Rua das Flores' and height_m is null and dap_cm is null and health is null and planting_year=2027 from public.city_trees where id='82000000-0000-0000-0000-000000000064'),'Plano não normalizou rua ou medidas de árvore inexistente');
select public.test_reject($q$insert into public.city_trees(city_id,common_name,status,latitude,longitude) values(64,'Plano sem ano','planejada',-8.6,-38.57)$q$);
select public.test_reject($q$update public.city_trees set planted_at=current_date where id='82000000-0000-0000-0000-000000000064'$q$);
select public.test_reject($q$update public.city_trees set street_id='81000000-0000-0000-0000-000000000065' where id='82000000-0000-0000-0000-000000000064'$q$);
select public.test_reject($q$update public.city_trees set status='saudavel' where id='82000000-0000-0000-0000-000000000064'$q$);
select public.test_reject($q$update public.city_trees set planting_site='valor-invalido' where id='82000000-0000-0000-0000-000000000064'$q$);
select public.test_assert(not exists(select 1 from public.nearby_report_trees(-8.63,-38.59,64) where id='82000000-0000-0000-0000-000000000064'),'Plano oferecido como árvore existente na bronca');
select public.test_reject($q$select public.schedule_city_tree_maintenance(64,array['82000000-0000-0000-0000-000000000064'::uuid],'poda')$q$);
select public.test_denied($q$insert into public.city_trees(city_id,common_name,status,planting_year,latitude,longitude) values(65,'Outra cidade','planejada',2027,-8,-34)$q$);

update public.city_trees set status='saudavel',planted_at=current_date,dap_cm=22.5,height_m=3,health='regular',pests=array['fungos'],scheduled_action='Poda de limpeza',execution_term='curto'
where id='82000000-0000-0000-0000-000000000064';
select public.test_assert((select planting_year=2027 and planted_at=current_date and dap_cm=22.5 and health='regular' from public.city_trees where id='82000000-0000-0000-0000-000000000064'),'Confirmação perdeu o planejamento ou a vistoria');
select public.test_reject($q$update public.city_trees set pests=array['nenhuma','cupins'] where id='82000000-0000-0000-0000-000000000064'$q$);
select public.test_reject($q$update public.city_trees set power_lines='nenhuma',wire_conflict='toca' where id='82000000-0000-0000-0000-000000000064'$q$);
select public.test_reject($q$update public.city_trees set dap_cm=0 where id='82000000-0000-0000-0000-000000000064'$q$);

set test.user_id='00000000-0000-0000-0000-000000000003';
with edited as (update public.city_trees set planting_year=2028 where id='82000000-0000-0000-0000-000000000064' returning id)
select public.test_assert((select count(*)=0 from edited),'Administrador sem concessão alterou o planejamento');
set role anon;
select public.test_assert((select planting_year=2027 and health='regular' from public.city_trees where id='82000000-0000-0000-0000-000000000064'),'Leitura pública do planejamento e vistoria falhou');
select public.test_denied($q$update public.city_trees set planting_year=2028$q$);
reset role;
select public.test_assert(not exists(select id,status,planted_at,created_at from original_trees except select id,status,planted_at,created_at from public.city_trees),'Migração alterou registros existentes');
select 'Planejamento: cadastro, validação, confirmação, rua por cidade, vistoria e RLS OK';
