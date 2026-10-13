-- PR #8: inventário somente de leitura, antes de qualquer implantação.
-- Executar no SQL Editor do projeto escolhido. Não mostra chaves ou secrets.
begin transaction read only;

-- Compare com `supabase migration list --linked`. Nome é relevante: 272 foi reutilizada.
select version, name
from supabase_migrations.schema_migrations
order by version;

-- Não presumir que o ID de Floresta em produção seja 64.
select c.id as city_id, c.name, s.uf
from public.cities c join public.states s on s.id = c.state_id
where lower(btrim(c.name)) = 'floresta' and upper(s.uf) = 'PE';

select b.id, b.city_id, b.name
from public.bairros b
join public.cities c on c.id = b.city_id
join public.states s on s.id = c.state_id
where lower(btrim(c.name)) = 'floresta' and upper(s.uf) = 'PE'
order by b.name, b.id;

-- Catálogo legado sem município; não atribuir todos a Floresta sem conferir a origem.
select count(*) as bairros_sem_cidade from public.bairros where city_id is null;
select city_id, lower(btrim(name)) as nome, count(*) as quantidade
from public.bairros group by city_id, lower(btrim(name)) having count(*) > 1;

-- Registros sem município ficam fora dos backfills que exigem --city-id.
select count(*) filter (where city_id is null) as sem_cidade,
       count(*) filter (where nullif(btrim(neighborhood), '') is null) as sem_bairro
from public.reports;

select p.city_id, count(*) as total,
       count(*) filter (where nullif(btrim(p.address), '') is null) as sem_endereco,
       count(*) filter (where p.lighting_status = 'nao_informado') as nao_informado,
       count(*) filter (where p.raw_properties ->> 'neighborhood' is null) as sem_bairro_na_raiz
from public.poles p
group by p.city_id order by p.city_id;
-- sem_bairro_na_raiz é diagnóstico bruto: municipal.bairro/kmz podem conter o bairro.

-- A 301 cria um índice único; duplicatas existentes precisam de análise individual.
select protocol, count(*) as quantidade from public.reports
where protocol is not null group by protocol having count(*) > 1;

-- Detectar o SQL antigo de esgoto antes de executar a atual 273.
select conname, convalidated as validada, pg_get_constraintdef(oid) as definicao
from pg_constraint
where conrelid = 'public.reports'::regclass
  and conname = 'reports_esgoto_issue_type_check';

-- Funções esperadas após a implantação; NULL antes da instalação é normal.
select signature, to_regprocedure(signature) is not null as instalada
from (values
  ('public.listar_emails_equipe_prefeitura()'),
  ('public.enviar_relatorios_do_orgao(text)'),
  ('public.resolve_report_neighborhood(bigint,text,text)'),
  ('public.pole_explicit_neighborhood(jsonb)'),
  ('public.gerir_iluminacao_municipal_detalhado(bigint,text,bigint,text,text,double precision,double precision,text,numeric,text,jsonb)'),
  ('public.buscar_mapa_eletricista(uuid,text)'),
  ('public.listar_painel_eletricista(uuid,text,text,text,text,integer,integer,text[])')
) as functions(signature);

select case when to_regprocedure('public.enviar_relatorios_do_orgao(text)') is not null
  then has_function_privilege('authenticated', 'public.enviar_relatorios_do_orgao(text)', 'EXECUTE')
  else false end as authenticated_pode_disparar_relatorio;

select e.extname, n.nspname as schema
from pg_extension e join pg_namespace n on n.oid = e.extnamespace
where e.extname in ('postgis', 'pg_trgm', 'pg_net', 'pg_cron');

commit;
