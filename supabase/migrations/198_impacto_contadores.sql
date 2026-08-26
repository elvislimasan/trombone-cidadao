-- 198_impacto_contadores.sql
--
-- Os contadores da segunda moeda: Pontos de Impacto.
--
-- O QUE ESTAVA ERRADO NO PLACAR
--
-- Toda a escala de pontos (169, 174, 190) paga ENTRADA: bronca, missao, sinal,
-- vistoria, atualizacao, comentario, apoio. Nenhuma linha do banco pagava pelo
-- problema CONSERTADO.
--
-- Lido honestamente, o incentivo dizia "produza mais denuncias" e nao dizia
-- "conserte mais coisas". O primeiro colocado do placar era, por construcao,
-- quem mais reclamou — o que torna o ranking indefensavel diante de uma
-- prefeitura, e o que faz a pessoa sumir quando percebe que nada fecha.
--
-- CONTINUA DERIVADO
--
-- Mesma escolha da 169, 172 e 174: nenhuma coluna de saldo, nenhum job de
-- credito, nenhuma tabela de "impacto ganho". O total sai da contagem de
-- broncas RESOLVIDAS em que a pessoa aparece.
--
-- E o que torna o Impacto revogavel de graca: se uma bronca sair de 'resolved'
-- (moderacao errou, a confirmacao caiu), o credito some junto na proxima
-- consulta. Num modelo de saldo gravado isso seria estorno, trigger e backfill.
--
-- OS PESOS NAO ESTAO AQUI, E ISSO E DE PROPOSITO
--
-- Quanto vale cada papel mora em `src/lib/impact.js`, junto do catalogo de
-- selos — mesma divisao que a 179/180 fizeram com as missoes. O banco conta;
-- o cliente pontua. Mudar o peso da confirmacao de 15 para 20 nao pode exigir
-- migracao.
--
-- POR QUE `distinct` EM TODAS AS CONTAGENS DE PARTICIPACAO
--
-- Uma pessoa pode ter tres atualizacoes na mesma bronca (a policy de 7 dias
-- permite) e dois comentarios. Sem `distinct`, uma unica resolucao pagaria tres
-- vezes o credito de confirmacao — e a moeda que existe para medir desfecho
-- passaria a medir insistencia, que e justamente o que o XP ja mede.

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
  reported_by_category     jsonb,
  -- ── Impacto (198) ────────────────────────────────────────────────────────
  resolvidas_autor         integer,
  resolvidas_missao        integer,
  resolvidas_sinal         integer,
  resolvidas_confirmadas   integer,
  resolvidas_comentadas    integer,
  resolvidas_apoiadas      integer,
  resolvidas_total         integer
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

  -- ── Participacao em broncas resolvidas ───────────────────────────────────
  --
  -- Um CTE por papel, devolvendo IDS e nao contagens. E o que permite o
  -- `resolvidas_total` ser o distinto da uniao: a mesma bronca pode aparecer em
  -- tres papeis (registrei, confirmei e apoiei), e somar as contagens diria
  -- "voce ajudou a resolver 3" para uma resolucao so.
  --
  -- Os filtros de autoria espelham linha a linha os de `reports_count`,
  -- `missions_count` e `signals_count` acima. Divergir aqui faria a mesma
  -- bronca contar como missao no XP e como autoria no Impacto.
  res_autor as (
    select r.id
    from public.reports r
    where r.status = 'resolved'
      and r.moderation_status = 'approved'
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
  res_missao as (
    select r.id
    from public.reports r
    where r.status = 'resolved'
      and r.moderation_status = 'approved'
      and r.signal_status = 'done'
      and r.completed_by = target_user_id
      and r.completed_by <> r.author_id
  ),
  res_sinal as (
    select r.id
    from public.reports r
    where r.status = 'resolved'
      and r.origin = 'signal'
      and r.author_id = target_user_id
      and coalesce(r.completed_by, '00000000-0000-0000-0000-000000000000'::uuid)
          <> r.author_id
  ),
  -- Confirmar em campo: qualquer atualizacao nao rejeitada numa bronca que
  -- terminou resolvida. Inclui 'still_here' de propósito — quem foi ao local e
  -- disse que o problema continuava tambem empurrou o caso ate o conserto.
  res_confirmada as (
    select distinct u.report_id as id
    from public.report_updates u
    join public.reports r on r.id = u.report_id
    where r.status = 'resolved'
      and u.author_id = target_user_id
      and coalesce(u.status, '') <> 'rejected'
  ),
  res_comentada as (
    select distinct c.report_id as id
    from public.comments c
    join public.reports r on r.id = c.report_id
    where r.status = 'resolved'
      and c.author_id = target_user_id
      and coalesce(c.moderation_status, 'approved') = 'approved'
  ),
  res_apoiada as (
    select distinct s.report_id as id
    from public.signatures s
    join public.reports r on r.id = s.report_id
    where r.status = 'resolved'
      and s.user_id = target_user_id
  ),
  -- O distinto da uniao. Nao e a soma, e a diferenca importa: e este numero que
  -- a tela usa para dizer "voce ajudou a resolver 7 problemas".
  res_todas as (
    select id from res_autor
    union
    select id from res_missao
    union
    select id from res_sinal
    union
    select id from res_confirmada
    union
    select id from res_comentada
    union
    select id from res_apoiada
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
      (select count(*) from minhas_saidas where kind = 'patrol')::integer as patrols_count,
      (select count(*) from minhas_saidas where kind = 'audit')::integer as audits_count,
      (select coalesce(sum(passed_count), 0) from minhas_saidas)::integer as total_passed,
      (select coalesce(sum(confirmed_count), 0) from minhas_saidas)::integer as total_confirmed,
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
        where pontos = (select max(pontos) from meus_bairros))::integer as acoes_no_melhor,

      (select count(*) from res_autor)::integer      as resolvidas_autor,
      (select count(*) from res_missao)::integer     as resolvidas_missao,
      (select count(*) from res_sinal)::integer      as resolvidas_sinal,
      (select count(*) from res_confirmada)::integer as resolvidas_confirmadas,
      (select count(*) from res_comentada)::integer  as resolvidas_comentadas,
      (select count(*) from res_apoiada)::integer    as resolvidas_apoiadas,
      (select count(*) from res_todas)::integer      as resolvidas_total
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
    ),
    t.resolvidas_autor,
    t.resolvidas_missao,
    t.resolvidas_sinal,
    t.resolvidas_confirmadas,
    t.resolvidas_comentadas,
    t.resolvidas_apoiadas,
    t.resolvidas_total
  from totais t;
$fn$;

comment on function public.get_mission_counters(uuid) is
  'Contadores da central de missoes e do Impacto. SECURITY INVOKER. As sete colunas resolvidas_* contam participacao em broncas com status=resolved; os pesos vivem em src/lib/impact.js. resolvidas_total e o DISTINTO da uniao, nunca a soma.';

grant execute on function public.get_mission_counters(uuid) to authenticated;

-- ── Quem participou de uma bronca ────────────────────────────────────────────
--
-- Alimenta a notificacao de resolucao: para dizer "voce e mais 11 pessoas
-- fizeram isso" e preciso saber quem sao as doze.
--
-- `security definer` de proposito, e e o unico jeito de a contagem ser um
-- numero so. Sob RLS a lista mudaria conforme quem consulta — e duas pessoas
-- na mesma bronca veriam totais diferentes para o mesmo fato.
--
-- Devolve IDS, nao nomes. Quem chama decide o que mostrar; a funcao nao vaza
-- perfil de ninguem por ser chamada.
create or replace function public.report_participants(p_report_id uuid)
returns table (user_id uuid, papel text)
language sql
stable
security definer
set search_path = public, extensions
as $fn$
  select distinct on (u.user_id) u.user_id, u.papel
  from (
    -- A ordem do union define a precedencia do papel: quem registrou E apoiou
    -- aparece como autor, que e o credito maior.
    select r.author_id as user_id, 'autor'::text as papel, 1 as ordem
    from public.reports r
    where r.id = p_report_id and r.author_id is not null

    union all

    select r.completed_by, 'missao', 2
    from public.reports r
    where r.id = p_report_id
      and r.completed_by is not null
      and r.completed_by <> r.author_id

    union all

    select up.author_id, 'confirmacao', 3
    from public.report_updates up
    where up.report_id = p_report_id
      and coalesce(up.status, '') <> 'rejected'

    union all

    select c.author_id, 'comentario', 4
    from public.comments c
    where c.report_id = p_report_id
      and coalesce(c.moderation_status, 'approved') = 'approved'

    union all

    select s.user_id, 'apoio', 5
    from public.signatures s
    where s.report_id = p_report_id
  ) u
  where u.user_id is not null
  order by u.user_id, u.ordem;
$fn$;

comment on function public.report_participants(uuid) is
  'Quem participou de uma bronca e em que papel, um por pessoa (o papel de maior credito vence). Alimenta a notificacao de resolucao — ver src/lib/impact.js fraseDaResolucao.';

grant execute on function public.report_participants(uuid) to authenticated;
