-- Executar somente em banco LOCAL vazio e descartável.
\set ON_ERROR_STOP on
\i supabase/tests/arborization_inventory.sql
-- A fixture usa a concessão original de ruas; este adaptador local representa
-- o helper independente de arborização já existente na instalação (migração 369).
create function public.pode_gerenciar_arborizacao(p_city_id bigint) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$select public.pode_gerenciar_mapa_ruas(p_city_id)$$;
\i supabase/migrations/388_tree_bulk_maintenance.sql

insert into public.city_trees(id,city_id,latitude,longitude,status,notes,photo_url)
values('81000000-0000-0000-0000-000000000001',64,-8.60,-38.57,'saudavel','Preservar A','https://example.test/a.jpg'),
      ('81000000-0000-0000-0000-000000000002',64,-8.61,-38.58,'risco','Preservar B',null),
      ('81000000-0000-0000-0000-000000000003',65,-8.05,-34.90,'saudavel','Outra cidade',null),
      ('81000000-0000-0000-0000-000000000004',64,-8.62,-38.59,'removida','Removida',null);
create temp table original_bulk_trees as select * from public.city_trees where id::text like '81000000-%';
create temp table original_care_count as select count(*) as total from public.city_tree_care;

set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_assert((public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002','81000000-0000-0000-0000-000000000001']::uuid[],'poda','2026-12-20')->>'updated_count')::int=2,'Lote não deduplicou ou não atualizou todas as árvores');
select public.test_assert((select count(*)=2 from public.city_trees where id in('81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000002') and maintenance_action='poda' and maintenance_due_at='2026-12-20'),'Manejo e prazo não foram aplicados');
select public.test_reject($q$select public.schedule_city_tree_maintenance(64,'{}'::uuid[],'poda',null)$q$);
select public.test_reject($q$select public.schedule_city_tree_maintenance(64,array[null]::uuid[],'poda',null)$q$);
select public.test_reject($q$select public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001']::uuid[],'nenhuma',null)$q$);
select public.test_reject($q$select public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001']::uuid[],'poda','infinity')$q$);
select public.test_reject($q$select public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000004']::uuid[],'tratamento',null)$q$);
select public.test_reject($q$select public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000000003']::uuid[],'tratamento',null)$q$);
select public.test_reject($q$select public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001','81000000-0000-0000-0000-000000009999']::uuid[],'tratamento',null)$q$);
select public.test_assert((select maintenance_action='poda' and maintenance_due_at='2026-12-20' from public.city_trees where id='81000000-0000-0000-0000-000000000001'),'Seleção inválida deixou atualização parcial');
select public.test_denied($q$select public.schedule_city_tree_maintenance(65,array['81000000-0000-0000-0000-000000000003']::uuid[],'poda',null)$q$);
set test.user_id='00000000-0000-0000-0000-000000000002';
select public.test_denied($q$select public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001']::uuid[],'poda',null)$q$);
reset role;

-- Um lote acima do limite padrão de 1.000 registros mantém o retorno completo.
create temp table large_bulk_ids as select gen_random_uuid() as id from generate_series(1,1201);
grant select on large_bulk_ids to authenticated;
insert into public.city_trees(id,city_id,latitude,longitude) select id,64,-8.6,-38.57 from large_bulk_ids;
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_assert((public.schedule_city_tree_maintenance(64,(select array_agg(id) from large_bulk_ids),'vistoria',null)->>'updated_count')::int=1201,'Retorno truncou o lote grande');
reset role;
select public.test_assert(not exists(select 1 from public.city_trees t join original_bulk_trees o using(id) where (to_jsonb(t)-'maintenance_action'-'maintenance_due_at'-'updated_at')<>(to_jsonb(o)-'maintenance_action'-'maintenance_due_at'-'updated_at')),'Programação alterou identificação, situação, foto ou dados cadastrais');
select public.test_assert((select count(*)=(select total from original_care_count) from public.city_tree_care),'Programação criou serviço executado no histórico');
update public.permission_rules set allowed=false where module='urban_planning';
set role authenticated;
set test.user_id='00000000-0000-0000-0000-000000000001';
select public.test_denied($q$select public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001']::uuid[],'poda',null)$q$);
set role anon;
set test.user_id='';
select public.test_denied($q$select public.schedule_city_tree_maintenance(64,array['81000000-0000-0000-0000-000000000001']::uuid[],'poda',null)$q$);
reset role;
select 'Manejo em lote: atualização atômica, campos preservados, RLS, revogação e lote de 1.201 árvores OK';
