-- 190_vistoria_pontua.sql
--
-- Conferir que NAO ha nada no local passa a valer pontos.
--
-- O QUE ESTAVA ERRADO
--
-- "Nao ha nada aqui" e trabalho: alguem se deslocou ate o ponto, olhou, e
-- gastou o proprio tempo para dizer que o problema nao existe mais — ou nunca
-- existiu. O app aceitava esse trabalho, gravava quem fez (emptied_by, desde a
-- 173) e nao pagava nada por ele.
--
-- Pior que nao pagar: o botao fica ao lado de "Registrar", que paga 12. Duas
-- acoes que exigem a mesma ida ao local, uma valendo tudo e a outra valendo
-- zero — e a que vale zero e a unica honesta quando o buraco ja foi tapado. O
-- incentivo apontava para inventar bronca onde nao ha.
--
-- QUANTO VALE, E POR QUE MENOS QUE AS OUTRAS
--
-- 3 pontos, o mesmo do sinal. E a mesma ordem de esforco: chegar e tocar uma
-- vez, sem foto, sem descricao. Menos que registrar (10) e que fechar um ponto
-- marcado (12), que produzem uma bronca com prova. Mais que zero, que era o que
-- transformava a verdade em prejuizo.
--
-- O PESO EXISTE EM TRES LUGARES E OS TRES PRECISAM CONCORDAR
--
--   * aqui, em neighborhood_actions (placar do bairro);
--   * aqui tambem, em get_mission_counters (central de missoes);
--   * em src/lib/patrolGame.js (PONTOS.vistoria), que e o que a tela mostra.
--
-- Mudar 3 num lugar so faz o mesmo usuario ter dois totais — a armadilha
-- documentada no topo de src/lib/scoring.js.
--
-- ⚠️ A PRIMEIRA VERSAO DESTA MIGRACAO FALHOU COM 42P13, E O MOTIVO ENSINA ALGO
--
-- Ela tentava recriar `get_neighborhood_standing` com a soma dentro. Duas
-- coisas erradas:
--
--   1. a soma nao mora la. `get_neighborhood_standing` e um INVOLUCRO de tres
--      linhas sobre `neighborhood_actions(dias)`, que e quem tem os `union all`
--      com os pesos. Mexer no involucro nao mudaria pontuacao nenhuma;
--   2. a assinatura foi escrita de memoria e nao batia com a real — colunas em
--      outra ordem, `participantes` renomeado para `total`, `security definer`
--      virando `invoker`. `create or replace` recusa qualquer mudanca na lista
--      de OUT parameters, e foi exatamente o que ele disse.
--
-- Aqui `get_neighborhood_standing` NAO e tocada. Quem muda e `neighborhood_actions`,
-- com a assinatura copiada da 174, caractere por caractere.

-- ── Placar do bairro ────────────────────────────────────────────────────────
--
-- Corpo identico ao da 174, com um `union all` a mais — o bloco marcado NOVO.
create or replace function public.neighborhood_actions(dias integer default 90)
returns table (
  user_id uuid,
  city_id bigint,
  neighborhood text,
  pontos integer,
  acoes integer,
  posicao integer,
  participantes integer
)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  with limite as (
    select now() - make_interval(days => greatest(1, least(coalesce(dias, 90), 365))) as desde
  ),
  acoes as (
    select r.author_id as user_id, r.city_id, r.neighborhood, 10 as pontos
    from public.reports r cross join limite l
    where r.origin = 'full'
      and r.moderation_status = 'approved'
      and r.neighborhood is not null
      and r.created_at >= l.desde

    union all

    select r.completed_by, r.city_id, r.neighborhood, 12
    from public.reports r cross join limite l
    where r.signal_status = 'done'
      and r.completed_by is not null
      and r.moderation_status = 'approved'
      and r.neighborhood is not null
      and r.completed_at >= l.desde

    union all

    select r.author_id, r.city_id, r.neighborhood, 3
    from public.reports r cross join limite l
    where r.origin = 'signal'
      and r.signal_status in ('open', 'done')
      and r.neighborhood is not null
      and r.created_at >= l.desde

    union all

    -- ── NOVO: a vistoria que deu em nada ──────────────────────────────────
    --
    -- Paga a quem VERIFICOU (emptied_by), nao a quem sinalizou. Quem sinalizou
    -- ja recebeu os 3 dele no bloco acima, e continua com eles: o sinal nao era
    -- mentira, o problema pode ter sido resolvido no meio.
    --
    -- A 175 ja impede que a mesma pessoa sinalize e esvazie o proprio ponto,
    -- entao nao ha como somar os dois sozinho.
    select r.emptied_by, r.city_id, r.neighborhood, 3
    from public.reports r cross join limite l
    where r.signal_status = 'empty'
      and r.emptied_by is not null
      and r.neighborhood is not null
      and r.emptied_at >= l.desde

    union all

    select u.author_id, r.city_id, r.neighborhood, 5
    from public.report_updates u
    join public.reports r on r.id = u.report_id
    cross join limite l
    where r.neighborhood is not null
      and u.created_at >= l.desde
      and coalesce(u.status, '') <> 'rejected'
  ),
  somado as (
    select
      a.user_id,
      a.city_id,
      a.neighborhood,
      sum(a.pontos)::integer as pontos,
      count(*)::integer as acoes
    from acoes a
    where a.user_id is not null
    group by a.user_id, a.city_id, a.neighborhood
  )
  select
    s.user_id,
    s.city_id,
    s.neighborhood,
    s.pontos,
    s.acoes,
    rank() over (
      partition by s.city_id, s.neighborhood order by s.pontos desc
    )::integer as posicao,
    count(*) over (partition by s.city_id, s.neighborhood)::integer as participantes
  from somado s;
$fn$;

comment on function public.neighborhood_actions(integer) is
  'Pontos por bairro nos ultimos N dias. Pesos: bronca 10, ponto fechado 12, sinal 3, vistoria 3, atualizacao 5 — espelham PONTOS em src/lib/patrolGame.js.';

grant execute on function public.neighborhood_actions(integer) to authenticated;

-- ── Contador da central de missoes ──────────────────────────────────────────
--
-- Uma coluna nova (empties_count) muda a lista de OUT parameters, e
-- `create or replace` recusa isso com 42P13 — o mesmo erro de cima, aqui
-- previsto. Derrubar antes e obrigatorio, e o grant no fim tambem, porque o
-- drop leva os privilegios junto.
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
  minhas_patrulhas as (
    select p.*
    from public.patrols p
    where p.user_id = target_user_id
      and public.patrulha_conta(
            p.duration_seconds, p.distance_meters,
            p.confirmed_count, p.reports_count, p.signals_count
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
          and r.signal_status in ('open', 'done'))::integer as signals_count,
      (select count(*) from public.reports r
        where r.completed_by = target_user_id
          and r.signal_status = 'done'
          and r.moderation_status = 'approved')::integer as missions_count,
      -- Vistorias: pontos aos quais a pessoa foi e confirmou que estavam vazios.
      (select count(*) from public.reports r
        where r.emptied_by = target_user_id
          and r.signal_status = 'empty')::integer as empties_count,
      (select count(*) from minhas_patrulhas)::integer as patrols_count,
      (select coalesce(sum(passed_count), 0) from minhas_patrulhas)::integer as total_passed,
      (select coalesce(sum(confirmed_count), 0) from minhas_patrulhas)::integer as total_confirmed,
      (select coalesce(sum(distance_meters), 0) from minhas_patrulhas)::integer as total_distance_meters,
      (select count(*) from public.share_events e
        where e.user_id = target_user_id)::integer as shares_count,
      (select coalesce(
                array_agg(distinct (ended_at at time zone 'America/Sao_Paulo')::date),
                '{}'::date[])
       from minhas_patrulhas
       where ended_at >= now() - interval '90 days') as patrol_days,
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
  'Contadores da central de missoes. SECURITY INVOKER. Patrulhas curtas e sem acao nao entram (ver patrulha_conta). empties_count conta as vistorias que deram em nada.';

grant execute on function public.get_mission_counters(uuid) to authenticated;
