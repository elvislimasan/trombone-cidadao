-- Executar somente no cluster LOCAL descartável do validador.
\set ON_ERROR_STOP on
\i supabase/tests/arborization_inventory.sql

-- Guarda a ordenação esperada e todos os dados que a migração deve preservar.
create temp table original_trees as
select t.*, row_number() over(partition by city_id order by created_at,id) as expected_number
from public.city_trees t;
\i supabase/migrations/368_city_tree_public_code.sql
select public.test_assert((select bool_and(t.registration_number=o.expected_number
  and t.public_code='AR'||o.expected_number::text
  and (to_jsonb(t)-'public_code'-'registration_number')=(to_jsonb(o)-'expected_number'))
  from public.city_trees t join original_trees o using(id)),
  'Numeração inicial alterou dados, datas ou ordem dos cadastros existentes');

set role anon;
select public.test_assert((select bool_and(public_code is not null) from public.city_trees),'Código não disponível na leitura pública');
select public.test_denied($q$select * from public.city_tree_code_counters$q$);
reset role;

create temp table expected_counters as select * from public.city_tree_code_counters;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
insert into public.city_trees(id,city_id,common_name,latitude,longitude,registration_number)
values('70000000-0000-0000-0000-000000000001',64,'Nova',-8.61,-38.58,99999);
select public.test_reject($q$update public.city_trees set registration_number=999 where id='70000000-0000-0000-0000-000000000001'$q$);
select public.test_reject($q$update public.city_trees set public_code='AR999' where id='70000000-0000-0000-0000-000000000001'$q$);
select public.test_reject($q$update public.city_trees set city_id=65 where id='70000000-0000-0000-0000-000000000001'$q$);
update public.city_trees set status='removida',address='Novo endereço' where id='70000000-0000-0000-0000-000000000001';
select public.test_denied($q$update public.city_tree_code_counters set last_number=1$q$);
select public.test_denied($q$delete from public.city_tree_code_counters$q$);
reset role;
select public.test_assert((select t.registration_number=c.last_number+1 and t.public_code='AR'||(c.last_number+1)::text
  from public.city_trees t join expected_counters c using(city_id)
  where t.id='70000000-0000-0000-0000-000000000001'),'Código enviado pelo cliente foi aceito ou edição renumerou árvore');

set role authenticated;
delete from public.city_trees where id='70000000-0000-0000-0000-000000000001';
insert into public.city_trees(id,city_id,common_name,latitude,longitude)
values('70000000-0000-0000-0000-000000000002',64,'Após exclusão',-8.61,-38.58);
-- Master pode cadastrar em outro município, cuja sequência é independente.
set test.user_id='00000000-0000-0000-0000-000000000004';
insert into public.city_trees(id,city_id,common_name,latitude,longitude)
values('70000000-0000-0000-0000-000000000003',65,'Outra cidade',-8,-38);
reset role;
select public.test_assert((select registration_number=(select last_number+2 from expected_counters where city_id=64)
  from public.city_trees where id='70000000-0000-0000-0000-000000000002'),'Código excluído foi reutilizado');
select public.test_assert((select registration_number=(select last_number+1 from expected_counters where city_id=65)
  from public.city_trees where id='70000000-0000-0000-0000-000000000003'),'Municípios compartilharam contador');
select public.test_assert(not exists(select 1 from public.city_trees t join original_trees o using(id)
  where t.registration_number<>o.expected_number),'Novos cadastros renumeraram árvores antigas');

-- Cobre município vazio e exclusão de todas as suas árvores.
insert into public.cities(id,name) values(66,'Município de teste');
set role authenticated;
insert into public.city_trees(city_id,common_name,latitude,longitude) values(66,'Primeira',0,0);
select public.test_assert((select public_code='AR1' from public.city_trees where city_id=66),'Novo município não começou em AR1');
delete from public.city_trees where city_id=66;
insert into public.city_trees(city_id,common_name,latitude,longitude) values(66,'Segunda',0,0);
select public.test_assert((select public_code='AR2' from public.city_trees where city_id=66),'Exclusão total reiniciou sequência');
-- Falha do cadastro não deixa contador/árvore parcialmente gravados.
select public.test_reject($q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(66,'Inválida',91,0)$q$);
insert into public.city_trees(city_id,common_name,latitude,longitude) values(66,'Terceira',0,0);
select public.test_assert(exists(select 1 from public.city_trees where city_id=66 and public_code='AR3'),'Falha de cadastro não foi atômica');
reset role;

-- Também numera o cadastro criado atomicamente pelo envio cidadão da bronca.
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000002';
insert into public.reports(id,city_id,author_id,category_id,location,tree_registration)
values('70000000-0000-0000-0000-000000000004',64,auth.uid(),'poda',point(-38.62,-8.65),'{"latitude":-8.65,"longitude":-38.62}');
select public.test_assert((select t.public_code is not null from public.city_trees t join public.reports r on r.tree_id=t.id
  where r.id='70000000-0000-0000-0000-000000000004'),'Cadastro via bronca ficou sem código');
reset role;

-- Conexões reais concorrentes: B espera o contador bloqueado por A.
create extension dblink;
select dblink_connect('tree_a','host=127.0.0.1 port='||current_setting('port')||' dbname='||current_database()||' user=postgres');
select dblink_connect('tree_b','host=127.0.0.1 port='||current_setting('port')||' dbname='||current_database()||' user=postgres application_name=tree_code_concurrent_b');
select dblink_exec('tree_a','begin');
create temp table concurrent_codes as
select * from dblink('tree_a',$q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(66,'Concorrente A',0,0) returning registration_number$q$) as result(number bigint);
select dblink_send_query('tree_b',$q$insert into public.city_trees(city_id,common_name,latitude,longitude) values(66,'Concorrente B',0,0) returning registration_number$q$);
do $$
begin
  for attempt in 1..300 loop
    if exists(select 1 from pg_stat_activity where application_name='tree_code_concurrent_b' and wait_event_type='Lock') then return; end if;
    perform pg_sleep(0.01);
    perform pg_stat_clear_snapshot();
  end loop;
  raise exception 'Cadastro concorrente não aguardou o bloqueio do contador';
end $$;
select dblink_exec('tree_a','commit');
insert into concurrent_codes select * from dblink_get_result('tree_b') as result(number bigint);
select public.test_assert((select count(*)=2 and count(distinct number)=2 and max(number)=min(number)+1 from concurrent_codes),
  'Cadastros concorrentes geraram códigos repetidos ou fora da sequência');
select dblink_disconnect('tree_a');
select dblink_disconnect('tree_b');
select 'Códigos AR: migração, preservação, RLS, imutabilidade, municípios, exclusão, cadastro cidadão e concorrência OK';
