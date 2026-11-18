-- Executar somente em banco LOCAL vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/tree_adoption.sql
\i supabase/migrations/434_tree_species_ai_nursery_access.sql

insert into auth.users(id) values ('00000000-0000-0000-0000-000000000003') on conflict do nothing;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000003';
select public.test_assert(public.can_manage_tree_adoption(64)
  and not public.pode_gerenciar_arborizacao(64), 'Fixture precisa de atendente sem edição do inventário');
select public.test_denied($q$select public.consume_tree_species_ai_quota(65)$q$);
do $$begin
  for i in 1..30 loop
    perform public.test_assert(public.consume_tree_species_ai_quota(64), 'Atendente não conseguiu gerar resumo');
  end loop;
  perform public.test_assert(not public.consume_tree_species_ai_quota(64), 'Atendente excedeu a cota diária');
end $$;
select public.test_denied($q$select * from public.tree_species_ai_usage$q$);

-- O vínculo é verificado antes de consumir a cota, inclusive após revogação.
reset role;
create or replace function public.municipal_channel_action(p_user uuid,p_channel uuid,p_action text)
  returns boolean language sql as $$select false$$;
set role authenticated;
select public.test_denied($q$select public.consume_tree_species_ai_quota(64)$q$);
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_denied($q$select public.consume_tree_species_ai_quota(64)$q$);
set test.user_id='';
select public.test_denied($q$select public.consume_tree_species_ai_quota(64)$q$);
set role anon;
select public.test_denied($q$select public.consume_tree_species_ai_quota(64)$q$);
reset role;
select 'IA de espécies: atendente autorizado, cota de 30, cidade e revogação respeitadas';
