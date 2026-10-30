-- Executar em banco PostgreSQL local vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/department_scope.sql
\i supabase/migrations/399_municipal_administrator_lighting.sql

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.test_assert(public.municipal_city_action(auth.uid(),64,'lighting'),'Administrador sem cargo técnico não pode editar/remover postes');
select public.test_assert(not public.municipal_city_action(auth.uid(),65,'lighting'),'Administrador ganhou acesso a outra cidade');
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'execute'),'Cadastro de postes concedeu execução de campo');
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'unknown'),'Ação desconhecida foi liberada');
select public.test_assert(not public.municipal_city_action(null,64,'lighting'),'Visitante ganhou cadastro de postes');

reset role;
update public.prefeituras set categorias_habilitadas=array['poda'] where city_id=64;
set role authenticated;
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'lighting'),'Iluminação desabilitada liberou postes');
select public.test_assert(public.municipal_city_action(auth.uid(),64,'dispatch'),'Alteração de postes retirou gestão do atendimento');
reset role;
update public.prefeituras set categorias_habilitadas=array['iluminacao','poda'],status='suspensa' where city_id=64;
set role authenticated;
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'lighting'),'Prefeitura suspensa liberou postes');
reset role;
update public.prefeituras set status='ativa' where city_id=64;
update public.prefeitura_membros set ativo=false where user_id='00000000-0000-0000-0000-000000000006';
set role authenticated;
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'lighting'),'Administrador suspenso manteve cadastro de postes');

reset role;
update public.prefeitura_membros set ativo=true where user_id='00000000-0000-0000-0000-000000000006';
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000009';
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'lighting'),'Funcionário de Agricultura recebeu postes');
reset role;
update public.orgao_membros set ativo=true where id=:'tree_member';
update public.orgao_membro_acessos set cargos=array['inventario'] where membro_id=:'tree_member';
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000008';
select public.test_assert(public.municipal_city_action(auth.uid(),64,'lighting'),'Responsável pelo inventário perdeu a concessão');
reset role;
update public.orgao_membros set ativo=false where id=:'tree_member';
set role authenticated;
select public.test_assert(not public.municipal_city_action(auth.uid(),64,'lighting'),'Funcionário suspenso manteve a concessão');
reset role;
select 'Administrador municipal: postes, escopo, categoria habilitada, suspensão e execução separados OK';
