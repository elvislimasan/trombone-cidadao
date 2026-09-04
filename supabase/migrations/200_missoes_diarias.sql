-- 200_missoes_diarias.sql
--
-- O que faz alguem abrir o app HOJE.
--
-- As missoes da 179 sao permanentes: "investigue 25 buracos" nao e um motivo
-- para abrir o app numa terca a noite. As diarias sao, e elas precisam de uma
-- coisa que o banco nao sabia responder: o que a pessoa fez HOJE.
--
-- `get_mission_counters` (180, 192) so devolve totais de vida inteira. Uma
-- diaria de "confirme 3 broncas" lida contra o total diria "voce ja fez 47" e
-- nasceria completa.
--
-- DUAS PARTES
--
--   1. `p_desde` em get_mission_counters — o mesmo contador, recortado por data.
--   2. `daily_completions` — o fato de ter fechado uma diaria.
--
-- POR QUE UMA TABELA AQUI NAO CONTRADIZ A 169/172/174
--
-- O que aqueles modulos evitam gravar e VALOR DERIVADO DE REGRA: o nivel, a
-- medalha, o progresso — porque o valor gravado diverge no dia em que a regra
-- muda. Uma linha dizendo que fulano fechou a diaria X no dia Y e FATO, da
-- mesma natureza de `patrols` e `reports`, e nao fica errado quando a meta de
-- amanha for outra.
--
-- O sorteio em si continua sem tabela: e deterministico e derivado
-- (src/lib/dailies.js), e nao ha o que gravar quando a regra reproduz o
-- resultado.

-- ── 1. O fato ────────────────────────────────────────────────────────────────

create table if not exists public.daily_completions (
  user_id    uuid not null references public.profiles(id) on delete cascade,
  dia        date not null,
  daily_id   text not null,
  created_at timestamptz not null default now(),
  -- So append. A chave primaria e o que impede a mesma diaria pagar duas vezes
  -- no mesmo dia sem precisar de nenhuma checagem no cliente.
  primary key (user_id, dia, daily_id)
);

create index if not exists daily_completions_user_dia_idx
  on public.daily_completions (user_id, dia desc);

alter table public.daily_completions enable row level security;

-- Policies versionadas aqui de proposito. Varias tabelas do projeto tem policy
-- criada so pelo dashboard, invisivel ao git — o que ja custou tempo de
-- auditoria. Esta nao entra nessa lista.
drop policy if exists daily_completions_select_own on public.daily_completions;
create policy daily_completions_select_own on public.daily_completions
  for select to authenticated
  using (auth.uid() = user_id);

drop policy if exists daily_completions_insert_own on public.daily_completions;
create policy daily_completions_insert_own on public.daily_completions
  for insert to authenticated
  with check (
    auth.uid() = user_id
    -- Nao da para gravar conclusao de ontem nem de amanha. Sem isto, um cliente
    -- adulterado preencheria o mes inteiro de uma vez.
    and dia = (now() at time zone 'America/Sao_Paulo')::date
  );

comment on table public.daily_completions is
  'Fato: fulano fechou a diaria X no dia Y. O catalogo e o sorteio sao deterministicos e vivem em src/lib/dailies.js — nada disso e gravado.';

-- ── 2. Contadores com recorte de data ───────────────────────────────────────
--
-- `p_desde` com default null mantem TODA chamada existente funcionando sem
-- alteracao — e por isso precisa ser drop + create, e nao uma funcao nova:
-- duas sobrecargas de get_mission_counters deixariam o PostgREST sem saber qual
-- escolher.
--
-- O QUE NAO RESPEITA `p_desde`, E POR QUE
--
--   bairros_ativos, bairros_liderados, acoes_no_melhor
--     Ja sao uma janela de 90 dias por definicao (174). Nao tem leitura diaria.
--
--   patrol_days
--     E a lista que alimenta a sequencia. Recorta-la por dia a destruiria: a
--     sequencia passaria a ser sempre 0 ou 1.
--
-- Sem este paragrafo, quem ler a assinatura vai assumir que filtram.

drop function if exists public.get_mission_counters(uuid);
drop function if exists public.get_mission_counters(uuid, timestamptz);

create function public.get_mission_counters(
  target_user_id uuid,
  p_desde timestamptz default null
)
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
  reported_by_category     jsonb,
  resolvidas_autor         integer,
  resolvidas_missao        integer,
  resolvidas_sinal         integer,
  resolvidas_confirmadas   integer,
  resolvidas_comentadas    integer,
  resolvidas_apoiadas      integer,
  resolvidas_total         integer,
  dailies_completed        integer,
  perfect_days             integer
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
      and (p_desde is null or r.created_at >= p_desde)
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
      and (p_desde is null or u.created_at >= p_desde)
  ),
  minhas_saidas as (
    select p.*
    from public.patrols p
    where p.user_id = target_user_id
      and (p_desde is null or p.ended_at >= p_desde)
      and public.patrulha_conta(
            p.duration_seconds, p.distance_meters,
            p.confirmed_count, p.reports_count, p.signals_count,
            p.emptied_count
          )
  ),
  -- Sem recorte: janela fixa de 90 dias, ver o cabecalho.
  meus_bairros as (
    select * from public.get_neighborhood_standing(target_user_id, null, 90)
  ),

  -- ── Participacao em broncas resolvidas (198) ─────────────────────────────
  --
  -- ATENCAO: o recorte aqui e pela data da PARTICIPACAO, nao da resolucao.
  -- "Quanto impacto eu ganhei hoje" nao e uma pergunta que alguem faz, e
  -- responde-la exigiria saber quando cada bronca virou 'resolved' — dado que
  -- `reports` nao guarda. Com p_desde nulo (o uso real do Impacto) a questao
  -- nao se coloca.
  res_autor as (
    select r.id from public.reports r
    where r.status = 'resolved' and r.moderation_status = 'approved'
      and (p_desde is null or r.created_at >= p_desde)
      and (
        (r.origin = 'full' and r.author_id = target_user_id)
        or (r.origin = 'signal' and r.signal_status = 'done'
            and r.completed_by = target_user_id and r.completed_by = r.author_id)
      )
  ),
  res_missao as (
    select r.id from public.reports r
    where r.status = 'resolved' and r.moderation_status = 'approved'
      and r.signal_status = 'done'
      and r.completed_by = target_user_id and r.completed_by <> r.author_id
      and (p_desde is null or r.completed_at >= p_desde)
  ),
  res_sinal as (
    select r.id from public.reports r
    where r.status = 'resolved' and r.origin = 'signal'
      and r.author_id = target_user_id
      and coalesce(r.completed_by, '00000000-0000-0000-0000-000000000000'::uuid)
          <> r.author_id
      and (p_desde is null or r.created_at >= p_desde)
  ),
  res_confirmada as (
    select distinct u.report_id as id
    from public.report_updates u
    join public.reports r on r.id = u.report_id
    where r.status = 'resolved' and u.author_id = target_user_id
      and coalesce(u.status, '') <> 'rejected'
      and (p_desde is null or u.created_at >= p_desde)
  ),
  res_comentada as (
    select distinct c.report_id as id
    from public.comments c
    join public.reports r on r.id = c.report_id
    where r.status = 'resolved' and c.author_id = target_user_id
      and coalesce(c.moderation_status, 'approved') = 'approved'
      and (p_desde is null or c.created_at >= p_desde)
  ),
  res_apoiada as (
    select distinct s.report_id as id
    from public.signatures s
    join public.reports r on r.id = s.report_id
    where r.status = 'resolved' and s.user_id = target_user_id
      and (p_desde is null or s.created_at >= p_desde)
  ),
  res_todas as (
    select id from res_autor
    union select id from res_missao
    union select id from res_sinal
    union select id from res_confirmada
    union select id from res_comentada
    union select id from res_apoiada
  ),

  -- ── Diarias ──────────────────────────────────────────────────────────────
  --
  -- Estas RESPEITAM p_desde, ao contrario dos contadores de bairro: "quantas
  -- diarias fechei hoje" e uma pergunta com resposta diaria, e e ela que o card
  -- do feed mostra.
  minhas_diarias as (
    select d.dia, d.daily_id
    from public.daily_completions d
    where d.user_id = target_user_id
      and (p_desde is null
           or d.dia >= (p_desde at time zone 'America/Sao_Paulo')::date)
  ),

  totais as (
    select
      (select count(*) from minhas_broncas)::integer as reports_count,
      (select count(*) from public.report_updates u
        where u.author_id = target_user_id
          and (p_desde is null or u.created_at >= p_desde))::integer as updates_count,
      (select count(*) from public.comments c
        where c.author_id = target_user_id
          and (p_desde is null or c.created_at >= p_desde))::integer as comments_count,
      (select count(*) from public.signatures s
        where s.user_id = target_user_id
          and (p_desde is null or s.created_at >= p_desde))::integer as upvotes_given,
      (select count(*) from public.reports r
        where r.author_id = target_user_id
          and r.origin = 'signal'
          and r.signal_status in ('open', 'done')
          and coalesce(r.completed_by, '00000000-0000-0000-0000-000000000000'::uuid)
              <> r.author_id
          and (p_desde is null or r.created_at >= p_desde))::integer as signals_count,
      (select count(*) from public.reports r
        where r.completed_by = target_user_id
          and r.completed_by <> r.author_id
          and r.signal_status = 'done'
          and r.moderation_status = 'approved'
          and (p_desde is null or r.completed_at >= p_desde))::integer as missions_count,
      (select count(*) from public.reports r
        where r.emptied_by = target_user_id
          and r.emptied_by <> r.author_id
          and r.signal_status = 'empty'
          and (p_desde is null or r.emptied_at >= p_desde))::integer as empties_count,
      (select count(*) from minhas_saidas where kind = 'patrol')::integer as patrols_count,
      (select count(*) from minhas_saidas where kind = 'audit')::integer as audits_count,
      (select coalesce(sum(passed_count), 0) from minhas_saidas)::integer as total_passed,
      (select coalesce(sum(confirmed_count), 0) from minhas_saidas)::integer as total_confirmed,
      (select coalesce(sum(distance_meters), 0) from minhas_saidas)::integer as total_distance_meters,
      (select count(*) from public.share_events e
        where e.user_id = target_user_id
          and (p_desde is null or e.created_at >= p_desde))::integer as shares_count,
      -- Sem recorte de proposito: recortar destruiria a sequencia.
      (select coalesce(
                array_agg(distinct (p.ended_at at time zone 'America/Sao_Paulo')::date),
                '{}'::date[])
       from public.patrols p
       where p.user_id = target_user_id
         and p.kind = 'patrol'
         and p.ended_at >= now() - interval '90 days'
         and public.patrulha_conta(
               p.duration_seconds, p.distance_meters,
               p.confirmed_count, p.reports_count, p.signals_count,
               p.emptied_count)) as patrol_days,
      (select count(*) from meus_bairros)::integer as bairros_ativos,
      (select count(*) from meus_bairros where posicao = 1)::integer as bairros_liderados,
      (select coalesce(max(acoes), 0) from meus_bairros
        where pontos = (select max(pontos) from meus_bairros))::integer as acoes_no_melhor,

      (select count(*) from res_autor)::integer      as resolvidas_autor,
      (select count(*) from res_missao)::integer     as resolvidas_missao,
      (select count(*) from res_sinal)::integer      as resolvidas_sinal,
      (select count(*) from res_confirmada)::integer as resolvidas_confirmadas,
      (select count(*) from res_comentada)::integer  as resolvidas_comentadas,
      (select count(*) from res_apoiada)::integer    as resolvidas_apoiadas,
      (select count(*) from res_todas)::integer      as resolvidas_total,

      (select count(*) from minhas_diarias)::integer as dailies_completed,
      -- Dia perfeito = tres diarias fechadas no mesmo dia. O numero 3 e a cota
      -- de TIPOS em src/lib/dailies.js; mudar la exige mudar aqui.
      (select count(*) from (
         select dia from minhas_diarias group by dia having count(*) >= 3
       ) x)::integer as perfect_days
  )
  select
    t.reports_count, t.updates_count, t.comments_count, t.upvotes_given,
    t.signals_count, t.missions_count, t.empties_count,
    t.patrols_count, t.audits_count,
    t.total_passed, t.total_confirmed, t.total_distance_meters,
    t.shares_count, t.patrol_days,
    t.bairros_ativos, t.bairros_liderados, t.acoes_no_melhor,
    coalesce(
      (select jsonb_object_agg(category_id, n)
       from (select category_id, count(*)::integer as n
             from minhas_investigacoes where category_id is not null
             group by category_id) x),
      '{}'::jsonb),
    coalesce(
      (select jsonb_object_agg(category_id, n)
       from (select category_id, count(*)::integer as n
             from minhas_broncas where category_id is not null
             group by category_id) y),
      '{}'::jsonb),
    t.resolvidas_autor, t.resolvidas_missao, t.resolvidas_sinal,
    t.resolvidas_confirmadas, t.resolvidas_comentadas, t.resolvidas_apoiadas,
    t.resolvidas_total,
    t.dailies_completed, t.perfect_days
  from totais t;
$fn$;

comment on function public.get_mission_counters(uuid, timestamptz) is
  'Contadores da central, do Impacto e das diarias. p_desde recorta por data; bairros_* e patrol_days IGNORAM o recorte de proposito (ver 200). SECURITY INVOKER.';

grant execute on function public.get_mission_counters(uuid, timestamptz) to authenticated;
