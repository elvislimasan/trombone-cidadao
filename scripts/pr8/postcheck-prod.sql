-- PR #8: executar somente depois de instalar todas as migrações previstas.
begin transaction read only;

select signature, to_regprocedure(signature) is not null as instalada
from (values
  ('public.listar_emails_equipe_prefeitura()'),
  ('public.resolve_report_neighborhood(bigint,text,text)'),
  ('public.pole_explicit_neighborhood(jsonb)'),
  ('public.gerir_iluminacao_municipal_detalhado(bigint,text,bigint,text,text,double precision,double precision,text,numeric,text,jsonb)'),
  ('public.buscar_mapa_eletricista(uuid,text)'),
  ('public.listar_painel_eletricista(uuid,text,text,text,text,integer,integer,text[])')
) as functions(signature);

select has_function_privilege('authenticated', 'public.enviar_relatorios_do_orgao(text)', 'EXECUTE')
  as authenticated_pode_disparar_relatorio;

select c.relname as tabela, c.relrowsecurity as rls_ativa
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in (
  'prefeituras', 'prefeitura_membros', 'demandas_municipais', 'demanda_broncas',
  'demanda_atendimentos', 'orgao_casos', 'reports', 'report_media', 'patrols', 'patrol_paths'
);

select schemaname, tablename, policyname, roles, permissive, cmd
from pg_policies where schemaname = 'public'
  and tablename in ('reports', 'report_media', 'demandas_municipais', 'patrols', 'patrol_paths')
order by tablename, policyname;

select event_object_table, trigger_name from information_schema.triggers
where trigger_schema = 'public' and trigger_name in (
  'reports_assign_neighborhood', 'poles_assign_neighborhood',
  'normalizar_status_iluminacao', 'zz_assign_report_protocol', 'zz_assign_municipal_protocol'
) group by event_object_table, trigger_name order by event_object_table, trigger_name;

select id, public, file_size_limit, allowed_mime_types from storage.buckets
where id in ('reports-media', 'municipal-demand-files', 'municipal-report-receipts');

select p.city_id, public.pole_explicit_neighborhood(p.raw_properties) as bairro,
       p.raw_properties ->> 'neighborhood_source' as fonte, count(*) as postes
from public.poles p where p.lighting_status is distinct from 'removido'
group by p.city_id, public.pole_explicit_neighborhood(p.raw_properties),
         p.raw_properties ->> 'neighborhood_source'
order by p.city_id, bairro;

select r.city_id, count(*) as abertas_sem_bairro from public.reports r
where r.status in ('pending', 'in-progress')
  and (r.moderation_status = 'approved' or r.moderation_status is null)
  and not coalesce(r.is_petition, false) and nullif(btrim(r.neighborhood), '') is null
group by r.city_id order by r.city_id;

select count(*) as postes_nao_informados from public.poles where lighting_status = 'nao_informado';
select conname, convalidated as validada, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.reports'::regclass
  and conname = 'reports_esgoto_issue_type_check';
select conname, pg_get_constraintdef(oid) as definicao from pg_constraint
where conrelid = 'public.patrols'::regclass and conname = 'patrols_lighting_poles';
commit;
