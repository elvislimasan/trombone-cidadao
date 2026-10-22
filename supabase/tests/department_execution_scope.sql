\set ON_ERROR_STOP on
\i supabase/tests/department_scope.sql
\i supabase/migrations/377_municipal_execution_activities.sql
\i supabase/migrations/379_department_executors_from_categories.sql
select public.test_assert((select execution_categories='{"arborizacao":["poda"]}'::jsonb from public.orgao_canais where id=:'agri_channel'),'Agricultura não herdou a execução de suas categorias');
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000006';
select public.convidar_funcionario_secretaria('90000000-0000-0000-0000-000000000064',:'agri_channel','agricultura@municipio.gov.br',array['executor']) as field_invitation \gset
select (:'field_invitation'::jsonb->>'token') as field_token \gset
set test.user_id='00000000-0000-0000-0000-000000000009';
set test.email='agricultura@municipio.gov.br';
select public.aceitar_convite_prefeitura(:'field_token');
select public.test_assert(not public.municipal_channel_action(auth.uid(),:'agri_channel','read'),'Convite de executor concedeu atendimento');
select public.test_assert(public.field_executor_can_work(auth.uid(),:'agri_channel','arborizacao','poda'),'Executor não herdou Poda');
select public.test_assert(not public.eletricista_ativo_municipio(auth.uid(),64),'Executor de Agricultura ganhou execução elétrica');
select public.test_assert(exists(select 1 from jsonb_array_elements(public.municipal_execution_workspace()->'execution_activities') a where a->>'specialty'='arborizacao'),'Workspace sem arborização');
reset role;
update public.orgao_canais set municipal_modules='{}' where id=:'agri_channel';
set role authenticated;
select public.test_assert(public.field_executor_can_work(auth.uid(),:'agri_channel','servicos_gerais','poda'),'Secretaria sem mapa perdeu executor de suas categorias');
select public.test_assert(not public.field_executor_can_work(auth.uid(),:'agri_channel','arborizacao','poda'),'Alteração do mapa não recalculou especialidade');
reset role;
update public.orgao_canais set municipal_modules=array['arborization'] where id=:'agri_channel';
update public.orgao_membro_acessos set cargos=array['leitura'] where membro_id=:'agri_member';
set role authenticated;
select public.aceitar_convite_prefeitura(:'field_token');
select public.test_assert(not public.field_executor_can_work(auth.uid(),:'agri_channel','arborizacao','poda'),'Reaceite restaurou execução revogada');
select public.test_denied($q$select public.salvar_secretaria_municipal(null,64,'{}','{}','{}','{}')$q$);
reset role;
select 'Escopo automático, convite de executor, aceite, mudança de mapa e revogação OK';
