-- 180_mission_counters_full.sql
--
-- A central passou a mostrar tres coisas alem das missoes: os pontos, o nivel e
-- as conquistas. Todas saem dos mesmos contadores — e faltavam quatro numeros
-- para elas nao mentirem.
--
-- POR QUE TUDO NUMA CHAMADA SO
--
-- A alternativa seria a tela pedir get_mission_counters + get_user_level +
-- get_patrol_stats + get_patrol_days + get_neighborhood_standing. Cinco idas ao
-- servidor para pintar uma tela, e cinco lugares de onde um numero pode chegar
-- atrasado e piscar na cara de quem olha.
--
-- O QUE ENTROU, E POR QUE CADA UM IMPORTA
--
--   updates_count   — o placar de acoes (169) pesa atualizacao em 5 pontos. Sem
--                     ele, calcular pontos no cliente daria um total menor que
--                     o que a pessoa ve no perfil.
--   total_passed    — a conquista "Conhece cada esquina" conta broncas pelas
--                     quais se passou. Sem o numero, ela apareceria travada em
--                     zero para quem ja patrulhou meses.
--   patrol_days     — a sequencia de dias e funcao pura no JS (patrolGame.js),
--                     e precisa das datas. Devolver a sequencia pronta exigiria
--                     refazer em SQL uma regra que ja e testada la.
--   bairros_*       — as medalhas de bairro. Zerar por falta de dado mostraria
--                     "Dono da rua 0/20" a quem lidera tres bairros.
--
-- Recria em vez de substituir: a lista de colunas de retorno muda, e
-- `create or replace` nao altera o row type dos parametros OUT (42P13).

drop function if exists public.get_mission_counters(uuid);

create function public.get_mission_counters(target_user_id uuid)
returns table (
  reports_count            integer,
  updates_count            integer,
  comments_count           integer,
  upvotes_given            integer,
  signals_count            integer,
  missions_count           integer,
  patrols_count            integer,
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
security definer
set search_path = public, extensions
as $$
  with
  minhas_broncas as (
    select r.category_id
    from public.reports r
    where r.author_id = target_user_id
      and r.origin = 'full'
      and r.moderation_status = 'approved'
  ),
  minhas_investigacoes as (
    select r.category_id
    from public.report_updates u
    join public.reports r on r.id = u.report_id
    where u.author_id = target_user_id
      and coalesce(u.status, '') <> 'rejected'
  ),
  -- Reaproveita o placar de bairro da 174 em vez de repetir a regra: ela ja
  -- decide o que conta como acao de campo e qual a janela de 90 dias.
  meus_bairros as (
    select * from public.get_neighborhood_standing(target_user_id, null, 90)
  ),
  totais as (
    select
      (select count(*) from minhas_broncas)::integer as reports_count,
      -- Todas as atualizacoes, inclusive as de bronca sem categoria — por isso
      -- nao da para somar o jsonb de investigacoes para chegar aqui.
      (select count(*) from public.report_updates u
        where u.author_id = target_user_id)::integer as updates_count,
      (select count(*) from public.comments c
        where c.author_id = target_user_id)::integer as comments_count,
      (select count(*) from public.signatures s
        where s.user_id = target_user_id)::integer as upvotes_given,
      (select count(*) from public.reports r
        where r.author_id = target_user_id
          and r.origin = 'signal'
          and r.signal_status in ('open', 'done'))::integer as signals_count,
      (select count(*) from public.reports r
        where r.completed_by = target_user_id
          and r.signal_status = 'done'
          and r.moderation_status = 'approved')::integer as missions_count,
      (select count(*) from public.patrols p
        where p.user_id = target_user_id)::integer as patrols_count,
      (select coalesce(sum(p.passed_count), 0) from public.patrols p
        where p.user_id = target_user_id)::integer as total_passed,
      (select coalesce(sum(p.confirmed_count), 0) from public.patrols p
        where p.user_id = target_user_id)::integer as total_confirmed,
      (select coalesce(sum(p.distance_meters), 0) from public.patrols p
        where p.user_id = target_user_id)::integer as total_distance_meters,
      (select count(*) from public.share_events e
        where e.user_id = target_user_id)::integer as shares_count,
      -- Fuso fixado como na 172: o dia da patrulha e o dia de quem patrulhou.
      (select coalesce(
                array_agg(distinct (p.ended_at at time zone 'America/Sao_Paulo')::date),
                '{}'::date[])
       from public.patrols p
       where p.user_id = target_user_id
         and p.ended_at >= now() - interval '90 days') as patrol_days,
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
    t.patrols_count,
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
$$;

comment on function public.get_mission_counters(uuid) is
  'Todos os numeros da central de missoes numa chamada. O catalogo, as escadas, os pontos e o nivel vivem no cliente (src/lib/missions.js e src/lib/scoring.js); aqui so as contagens.';

-- `security definer` por causa do get_neighborhood_standing embutido, que ja e
-- definer na 174 pelo mesmo motivo: sem ele a RLS faria o placar de bairro
-- mudar conforme quem consulta.
grant execute on function public.get_mission_counters(uuid) to authenticated;
