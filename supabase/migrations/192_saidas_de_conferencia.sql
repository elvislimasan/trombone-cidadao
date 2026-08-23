-- 192_saidas_de_conferencia.sql
--
-- A conferencia de pontos passa a ser uma saida gravada, como a patrulha.
--
-- O QUE FALTAVA
--
-- A 191 separou conferir de patrulhar em duas telas. A conferencia ficou sem
-- registro nenhum: a pessoa saia, andava, respondia tres pontos e fechava a
-- tela — e nada daquilo virava linha em lugar algum. As acoes em si eram
-- gravadas (cada bronca, cada vistoria), mas a SAIDA nao.
--
-- Isso foi decisao consciente e estava errada. Sem registro nao ha historico,
-- nao ha resumo no fim, nao ha card para compartilhar, e a tela de "Minhas
-- patrulhas" mostra metade do que a pessoa fez na rua.
--
-- POR QUE `kind` E NAO UMA TABELA NOVA
--
-- Uma saida de conferencia tem exatamente as mesmas medidas de uma patrulha:
-- quando comecou, quanto durou, quanto andou, o que produziu. Criar
-- `audit_sessions` seria duplicar a tabela inteira, o RLS inteiro e a tela de
-- historico inteira para mudar uma palavra.
--
-- O QUE `kind` PROTEGE
--
-- Nao e enfeite de rotulo. Sem a coluna, uma saida de conferencia contaria como
-- patrulha na missao "Saia em patrulha" e na sequencia de dias — e sao coisas
-- diferentes: patrulhar e percorrer sem destino, conferir e ir ate pontos que
-- ja existem. Os contadores abaixo passam a filtrar por ela.

alter table public.patrols
  add column if not exists kind text not null default 'patrol',
  -- Pontos que a pessoa foi conferir e estavam vazios. Existe so em saidas de
  -- conferencia; numa patrulha fica em zero.
  add column if not exists emptied_count integer,
  add column if not exists emptied_report_ids uuid[];

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'patrols_kind_valido'
  ) then
    alter table public.patrols
      add constraint patrols_kind_valido check (kind in ('patrol', 'audit'));
  end if;
end $$;

comment on column public.patrols.kind is
  'patrol = percorrer sem destino (alertas pelo caminho); audit = ir ate pontos ja marcados e responde-los. Os contadores de patrulha filtram por isto.';

comment on column public.patrols.emptied_count is
  'Pontos conferidos e confirmados vazios nesta saida. Nulo nas linhas anteriores a 192 — "nao sabemos", nao zero.';

-- ── Uma saida de conferencia conta? ─────────────────────────────────────────
--
-- Mesma regra da patrulha (186), com as vistorias entrando na conta de acao:
-- foi ate um ponto e respondeu, entao a saida produziu algo, por menor que
-- tenha sido. `patrulha_conta` ganha um parametro com default para nao quebrar
-- as chamadas existentes — mudar a lista de argumentos exigiria drop, e ha
-- codigo chamando a versao de cinco.
create or replace function public.patrulha_conta(
  p_duration_seconds integer,
  p_distance_meters  integer,
  p_confirmed_count  integer,
  p_reports_count    integer,
  p_signals_count    integer,
  p_emptied_count    integer default 0
)
returns boolean
language sql
immutable
as $fn$
  select
    -- Qualquer acao salva a saida, por menor que ela seja.
    coalesce(p_confirmed_count, 0)
      + coalesce(p_reports_count, 0)
      + coalesce(p_signals_count, 0)
      + coalesce(p_emptied_count, 0) > 0
    -- Sem acao: precisa ter durado E ter percorrido.
    or (coalesce(p_duration_seconds, 0) >= 120
        and coalesce(p_distance_meters, 0) >= 150);
$fn$;

comment on function public.patrulha_conta(integer, integer, integer, integer, integer, integer) is
  'A saida conta para pontos, missoes e sequencia? Espelha PATRULHA_CURTA em src/lib/patrolGame.js.';

grant execute on function public.patrulha_conta(integer, integer, integer, integer, integer, integer)
  to authenticated;

-- ── Contadores ──────────────────────────────────────────────────────────────
--
-- `patrols_count` e `patrol_days` passam a contar SO as patrulhas. A missao
-- "Saia em patrulha" e a sequencia de dias falam de percorrer; uma saida de
-- conferencia nao as alimenta.
--
-- Os totais de distancia e tempo somam AS DUAS, porque ali a pergunta e outra:
-- quanto essa pessoa andou pela cidade com o app ligado.
--
-- Drop obrigatorio: `audits_count` muda a lista de OUT parameters (42P13).
drop function if exists public.get_mission_counters(uuid);

create function public.get_mission_counters(target_user_id uuid)
returns table (
  reports_count            integer,
  updates_count            integer,
  comments_count           integer,
  upvotes_given            integer,
  signals_count            integer,
  missions_count           integer,
  empties_count            integer,
  patrols_count            integer,
  audits_count             integer,
  total_passed             integer,
  total_confirmed          integer,
  total_distance_meters    integer,
  shares_count             integer,
  patrol_days              date[],
  bairros_ativos           integer,
  bairros_liderados        integer,
  acoes_no_melhor          integer,
  confirmed_by_category    jsonb,
  reported_by_category     jsonb
)
language sql
stable
security invoker
set search_path = public, extensions
as $fn$
  with
  minhas_broncas as (
    select r.category_id
    from public.reports r
    where r.moderation_status = 'approved'
      and (
        (r.origin = 'full' and r.author_id = target_user_id)
        or (
          r.origin = 'signal'
          and r.signal_status = 'done'
          and r.completed_by = target_user_id
          and r.completed_by = r.author_id
        )
      )
  ),
  minhas_investigacoes as (
    select r.category_id
    from public.report_updates u
    join public.reports r on r.id = u.report_id
    where u.author_id = target_user_id
      and coalesce(u.status, '') <> 'rejected'
  ),
  -- Todas as saidas que valem, de qualquer tipo.
  minhas_saidas as (
    select p.*
    from public.patrols p
    where p.user_id = target_user_id
      and public.patrulha_conta(
            p.duration_seconds, p.distance_meters,
            p.confirmed_count, p.reports_count, p.signals_count,
            p.emptied_count
          )
  ),
  meus_bairros as (
    select * from public.get_neighborhood_standing(target_user_id, null, 90)
  ),
  totais as (
    select
      (select count(*) from minhas_broncas)::integer as reports_count,
      (select count(*) from public.report_updates u
        where u.author_id = target_user_id)::integer as updates_count,
      (select count(*) from public.comments c
        where c.author_id = target_user_id)::integer as comments_count,
      (select count(*) from public.signatures s
        where s.user_id = target_user_id)::integer as upvotes_given,
      (select count(*) from public.reports r
        where r.author_id = target_user_id
          and r.origin = 'signal'
          and r.signal_status in ('open', 'done')
          and coalesce(r.completed_by, '00000000-0000-0000-0000-000000000000'::uuid)
              <> r.author_id)::integer as signals_count,
      (select count(*) from public.reports r
        where r.completed_by = target_user_id
          and r.completed_by <> r.author_id
          and r.signal_status = 'done'
          and r.moderation_status = 'approved')::integer as missions_count,
      (select count(*) from public.reports r
        where r.emptied_by = target_user_id
          and r.emptied_by <> r.author_id
          and r.signal_status = 'empty')::integer as empties_count,
      -- So patrulhas: a missao "Saia em patrulha" fala de percorrer.
      (select count(*) from minhas_saidas where kind = 'patrol')::integer as patrols_count,
      (select count(*) from minhas_saidas where kind = 'audit')::integer as audits_count,
      (select coalesce(sum(passed_count), 0) from minhas_saidas)::integer as total_passed,
      (select coalesce(sum(confirmed_count), 0) from minhas_saidas)::integer as total_confirmed,
      -- Distancia soma as duas: a pergunta aqui e quanto se andou, nao como.
      (select coalesce(sum(distance_meters), 0) from minhas_saidas)::integer as total_distance_meters,
      (select count(*) from public.share_events e
        where e.user_id = target_user_id)::integer as shares_count,
      (select coalesce(
                array_agg(distinct (ended_at at time zone 'America/Sao_Paulo')::date),
                '{}'::date[])
       from minhas_saidas
       where kind = 'patrol'
         and ended_at >= now() - interval '90 days') as patrol_days,
      (select count(*) from meus_bairros)::integer as bairros_ativos,
      (select count(*) from meus_bairros where posicao = 1)::integer as bairros_liderados,
      (select coalesce(max(acoes), 0) from meus_bairros
        where pontos = (select max(pontos) from meus_bairros))::integer as acoes_no_melhor
  )
  select
    t.reports_count,
    t.updates_count,
    t.comments_count,
    t.upvotes_given,
    t.signals_count,
    t.missions_count,
    t.empties_count,
    t.patrols_count,
    t.audits_count,
    t.total_passed,
    t.total_confirmed,
    t.total_distance_meters,
    t.shares_count,
    t.patrol_days,
    t.bairros_ativos,
    t.bairros_liderados,
    t.acoes_no_melhor,
    coalesce(
      (select jsonb_object_agg(category_id, n)
       from (
         select category_id, count(*)::integer as n
         from minhas_investigacoes
         where category_id is not null
         group by category_id
       ) x),
      '{}'::jsonb
    ),
    coalesce(
      (select jsonb_object_agg(category_id, n)
       from (
         select category_id, count(*)::integer as n
         from minhas_broncas
         where category_id is not null
         group by category_id
       ) y),
      '{}'::jsonb
    )
  from totais t;
$fn$;

comment on function public.get_mission_counters(uuid) is
  'Contadores da central de missoes. SECURITY INVOKER. patrols_count e patrol_days contam so kind=patrol; distancia e tempo somam as duas — ver 192.';

grant execute on function public.get_mission_counters(uuid) to authenticated;
