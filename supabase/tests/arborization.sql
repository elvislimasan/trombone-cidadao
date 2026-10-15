-- Executar somente em um banco LOCAL VAZIO e descartável, a partir da raiz.
\set ON_ERROR_STOP on
\i supabase/tests/urban_planning_role.sql
\i supabase/migrations/362_city_arborization.sql

update public.profiles set user_type='public_official', is_master=false;
update public.profiles set is_master=true where id='00000000-0000-0000-0000-000000000004';
delete from public.urban_planner_cities;
insert into public.urban_planner_cities(user_id,city_id) values('00000000-0000-0000-0000-000000000001',64);
delete from public.permission_rules where module='urban_planning';
insert into public.permission_rules(scope,role_name,module,allowed) values('role','urban_planner','urban_planning',true);
insert into public.city_trees(city_id,common_name,latitude,longitude) values(64,'Ipê',-8.6,-38.57),(65,'Oiti',-8.05,-34.9);

set role anon;
select public.test_assert((select count(*)=2 from public.city_trees),'Leitura pública não mostrou inventário');
select public.test_denied($q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(64,'Anônimo',0,0)$q$);
select public.test_denied($q$update public.city_trees set common_name='Anônimo'$q$);
select public.test_denied($q$delete from public.city_trees$q$);
reset role;

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
insert into public.city_trees(city_id,common_name,latitude,longitude) values(64,'Permitida',-8.6,-38.57);
update public.city_trees set common_name='Permitida editada' where common_name='Permitida';
select public.test_assert((select count(*)=1 from public.city_trees where common_name='Permitida editada'),'Gestor não editou árvore');
select public.test_denied($q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(65,'Outra cidade',0,0)$q$);
select public.test_denied($q$update public.city_trees set city_id=65 where common_name='Permitida editada'$q$);
update public.city_trees set common_name='Ataque' where city_id=65;
delete from public.city_trees where city_id=65;
select public.test_assert((select count(*)=1 from public.city_trees where city_id=65 and common_name='Oiti'),'Gestor alterou outra cidade');
delete from public.city_trees where common_name='Permitida editada';
select public.test_assert((select count(*)=0 from public.city_trees where common_name='Permitida editada'),'Gestor não excluiu cadastro');

set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_denied($q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(64,'Admin sem concessão',0,0)$q$);
set test.user_id='00000000-0000-0000-0000-000000000004';
insert into public.city_trees(city_id,common_name,latitude,longitude) values(65,'Master',0,0);
delete from public.city_trees where common_name='Master';
reset role;

update public.permission_rules set allowed=false where module='urban_planning';
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_denied($q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(64,'Permissão revogada',0,0)$q$);
reset role;
select public.test_assert(public.is_username_reserved('mapa-arborizacao') and public.is_username_reserved('arborizacao'),'Rotas não reservadas');
select 'Arborização: leitura pública, CRUD, RLS por cidade, admin sem concessão, master e revogação OK';
