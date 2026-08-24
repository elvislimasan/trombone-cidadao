-- 186_patrol_counts_only_real.sql
--
-- Patrulha curta e sem nenhuma acao deixa de contar.
--
-- O QUE ACONTECIA
--
-- Abrir o modo por engano, andar cinco segundos e tocar em "salvar" produzia
-- uma linha em `patrols` indistinguivel de uma patrulha de verdade. Ela contava
-- para a missao "Saia em patrulha" — que rende 15 pontos por etapa vencida — e
-- mantinha viva a sequencia de dias seguidos. A medalha de primeira patrulha
-- caia sem ninguem ter patrulhado.
--
-- A tela ja sugeria descartar essas saidas (avaliarPatrulha, em patrolGame.js),
-- mas sugerir nao e o mesmo que nao valer: quem salvasse assim mesmo ganhava
-- ponto por nada.
--
-- A REGRA
--
-- Houve QUALQUER acao? Conta. Confirmar, registrar ou sinalizar e o que a
-- patrulha existe para produzir; uma saida de um minuto que rendeu uma bronca
-- vale mais que uma hora de carro sem nada.
--
-- Sem acao nenhuma, o tamanho decide — e "pequena" e curta OU parada, nao as
-- duas: dez minutos no mesmo lugar produziram tanto quanto trinta segundos.
--
-- ONDE ESTA REGRA MORA (LEIA ANTES DE MUDAR UM NUMERO)
--
-- Ela existe DUAS vezes, e as duas precisam concordar:
--
--   • aqui, e e esta que DECIDE se a patrulha conta;
--   • em src/lib/patrolGame.js (PATRULHA_CURTA + avaliarPatrulha), que apenas
--     SUGERE o descarte na tela de fim de trajeto.
--
-- A duplicacao e consciente: a sugestao precisa acontecer no aparelho, antes de
-- qualquer gravacao, e a decisao precisa acontecer no banco, onde ninguem
-- reescreve. Mudar 120 ou 150 num lado sem o outro faz a tela sugerir descartar
-- algo que conta, ou sugerir salvar algo que nao vale nada.

create or replace function public.patrulha_conta(
  p_duration_seconds integer,
  p_distance_meters  integer,
  p_confirmed_count  integer,
  p_reports_count    integer,
  p_signals_count    integer
)
returns boolean
language sql
immutable
as $$
  select
    -- Qualquer acao salva a patrulha, por menor que ela seja.
    coalesce(p_confirmed_count, 0)
      + coalesce(p_reports_count, 0)
      + coalesce(p_signals_count, 0) > 0
    -- Sem acao: precisa ter durado E ter percorrido.
    or (coalesce(p_duration_seconds, 0) >= 120
        and coalesce(p_distance_meters, 0) >= 150);
$$;

comment on function public.patrulha_conta(integer, integer, integer, integer, integer) is
  'A patrulha conta para pontos, missoes e sequencia? Espelha PATRULHA_CURTA em src/lib/patrolGame.js — os dois numeros precisam concordar.';

grant execute on function public.patrulha_conta(integer, integer, integer, integer, integer)
  to authenticated;

-- ── Contadores passam a filtrar ─────────────────────────────────────────────
--
-- `reports_count` e `signals_count` sao NULOS nas patrulhas anteriores a 178 —
-- "nao sabemos", nao "zero". O coalesce dentro da funcao trata nulo como zero,
-- que e o comportamento certo aqui: uma patrulha antiga sem confirmacao alguma
-- e que durou cinco segundos nao vira valida por duvida.
--
-- Na pratica isso quase nao move numero nenhum: as saidas de segundos sao raras
-- e nao rendiam nada mesmo. O que muda e que param de contar.
--
-- O DROP NAO E OPCIONAL
--
--   ERROR: cannot change return type of existing function (SQLSTATE 42P13)
--   Row type defined by OUT parameters is different.
--
-- `create or replace` recusa qualquer mudanca na lista de colunas de saida, e a
-- versao que esta no banco foi criada com um conjunto diferente do declarado
-- aqui. Trocar o corpo mantendo a assinatura funcionaria; trocar as colunas so
-- derrubando a funcao antes.
--
-- Derrubar apaga junto os privilegios dela — por isso o `grant` no fim deste
-- arquivo nao e enfeite: sem ele a central de missoes passa a responder
-- "permission denied" para todo mundo.
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
security invoker
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
  -- As patrulhas que valem, uma vez so: todo agregado abaixo sai daqui.
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
      (select count(*) from minhas_patrulhas)::integer as patrols_count,
      (select coalesce(sum(passed_count), 0) from minhas_patrulhas)::integer as total_passed,
      (select coalesce(sum(confirmed_count), 0) from minhas_patrulhas)::integer as total_confirmed,
      (select coalesce(sum(distance_meters), 0) from minhas_patrulhas)::integer as total_distance_meters,
      (select count(*) from public.share_events e
        where e.user_id = target_user_id)::integer as shares_count,
      -- A sequencia tambem: um dia so com saida de cinco segundos nao mantem a
      -- corrente viva. Manter seria premiar abrir o app, nao patrulhar.
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
  'Contadores da central de missoes. SECURITY INVOKER: pedir o id de outra pessoa devolve so o que a RLS dela ja tornaria publico. Patrulhas curtas e sem acao nao entram (ver patrulha_conta).';

grant execute on function public.get_mission_counters(uuid) to authenticated;
