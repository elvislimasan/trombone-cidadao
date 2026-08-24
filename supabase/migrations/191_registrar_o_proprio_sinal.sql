-- 191_registrar_o_proprio_sinal.sql
--
-- Quem sinalizou passa a poder voltar e registrar.
--
-- A REGRA QUE SAI, E POR QUE ELA EXISTIA
--
-- A 175 proibiu o autor de cumprir a propria sinalizacao, com este argumento:
-- sinalizar e apontar, cumprir e provar, e quando a mesma pessoa faz os dois o
-- placar pagaria 3 + 12 pelo que um cadastro normal paga 10 — premiando o
-- caminho mais longo.
--
-- O DIAGNOSTICO ESTAVA CERTO. O REMEDIO ERA O ERRADO.
--
-- O problema nunca foi a pessoa registrar a propria bronca. Foi ela ser paga
-- duas vezes pelo mesmo problema. A 175 resolveu bloqueando a ACAO, e com isso
-- proibiu o caso mais natural que existe no app:
--
--   passo de carro, vejo um buraco, marco em um toque; volto a pe no dia
--   seguinte, com tempo, e faco o cadastro com foto.
--
-- Isso e exatamente o que o modo de sinalizacao existe para permitir. A trava
-- transformava a sinalizacao num compromisso: marcar um ponto passava a
-- significar abrir mao de registra-lo. Num bairro sem outros usuarios, o ponto
-- ficava aberto para sempre — e a tela dizia "nao foi possivel registrar" para
-- quem estava, naquele instante, com a foto na mao.
--
-- O QUE ENTRA NO LUGAR
--
-- A acao volta a ser permitida. O pagamento e que passa a ser justo:
--
--   fez os dois  ->  10 pontos. Exatamente o que registrar direto paga.
--   outro fechou ->  3 para quem marcou + 12 para quem provou.
--
-- Nao ha atalho nem punicao. Sinalizar e voltar depois rende o mesmo que
-- registrar de uma vez — porque e a mesma coisa, feita em duas idas.
--
-- ONDE ISSO E IMPLEMENTADO
--
-- Nao no bloqueio, e sim na CONTAGEM. Tres lugares:
--
--   1. complete_patrol_signal   — deixa de recusar o autor;
--   2. neighborhood_actions     — separa "fechou o proprio" (10) de "fechou o
--                                 de outro" (12), e o sinal deixa de pagar 3
--                                 quando o proprio autor o fechou;
--   3. get_mission_counters     — mesma separacao, para o placar do perfil e a
--                                 central de missoes contarem igual.
--
-- E A VISTORIA VAZIA?
--
-- Continua sem pagar para o proprio autor, e isso nao e assimetria: registrar o
-- proprio sinal produz uma bronca com foto — trabalho real, que vale 10.
-- Marcar o proprio sinal como vazio nao produz nada; e desfazer. Desfazer pode,
-- e deve, mas render 3 pontos por marcar e outros 3 por desmarcar seria pagar
-- por um par de toques.

-- ── 1. A funcao deixa de recusar o autor ────────────────────────────────────
--
-- ⚠️ A ASSINATURA CERTA E A DE 12 ARGUMENTOS. A PRIMEIRA VERSAO ERROU ISSO.
--
-- `complete_patrol_signal` foi reescrita quatro vezes, ganhando parametros:
--
--   173 ->  5 args
--   175 ->  7 args (correcao do ponto)
--   176 ->  9 args (city_id, neighborhood)
--   177 -> 12 args (campos da categoria: tipo, plaqueta, obra de agua)
--
-- A versao viva e a de 177, e e ela que o PostgREST chama. A primeira tentativa
-- desta migracao recriou a de SETE argumentos: nao substituiu nada do que o app
-- usa — o bloqueio continuou de pe, com o erro chegando na tela igual — e ainda
-- deixou uma sobrecarga velha no banco, que e exatamente o risco descrito no
-- cabecalho da 175 (o PostgREST escolhe a sobrecarga pelo corpo do JSON, e a
-- ambiguidade so aparece em producao).
--
-- Por isso o `drop` da de 7 vem primeiro: desfaz o estrago da tentativa
-- anterior nos bancos onde ela chegou a rodar.
drop function if exists public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, double precision, double precision
);

-- Corpo identico ao da 177 menos o `raise` do autor. A assinatura nao muda,
-- entao `create or replace` basta.
create or replace function public.complete_patrol_signal(
  p_signal_id uuid,
  p_title text,
  p_description text,
  p_lat double precision,
  p_lng double precision,
  p_new_lat double precision default null,
  p_new_lng double precision default null,
  p_city_id bigint default null,
  p_neighborhood text default null,
  p_issue_type text default null,
  p_pole_number text default null,
  p_is_from_water_utility boolean default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $fn$
declare
  v_origem extensions.geometry;
  v_autor uuid;
  v_categoria text;
  v_usuario extensions.geometry;
  v_corrigido extensions.geometry;
  v_admin boolean;
  v_tipo text;
  v_plaqueta text;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'titulo obrigatorio' using errcode = '22023';
  end if;

  select r.location, r.author_id, r.category_id
    into v_origem, v_autor, v_categoria
  from public.reports r
  where r.id = p_signal_id
    and r.origin = 'signal'
    and r.signal_status = 'open';

  if not found then
    raise exception 'missao indisponivel' using errcode = 'P0002';
  end if;

  -- Aqui havia o `if v_autor = auth.uid() then raise`. Ver o cabecalho desta
  -- migracao: o que impede o atalho agora e a contagem, nao a proibicao.
  -- `v_autor` continua sendo lido porque a contagem la embaixo compara
  -- author_id com completed_by.

  v_usuario := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  -- A presenca fisica continua obrigatoria, e para o autor tambem: marcar de
  -- passagem e depois "registrar" de casa continua sendo impossivel.
  if extensions.st_distance(
       v_origem::extensions.geography,
       v_usuario::extensions.geography
     ) > public.patrol_signal_presence_m()
  then
    raise exception 'fora do local' using errcode = 'P0001';
  end if;

  -- Correcao do ponto: opcional. Sem ela, o ponto original permanece.
  if p_new_lat is not null and p_new_lng is not null then
    v_corrigido := extensions.st_setsrid(
      extensions.st_makepoint(p_new_lng, p_new_lat), 4326
    );

    if extensions.st_distance(
         v_origem::extensions.geography,
         v_corrigido::extensions.geography
       ) > public.patrol_signal_adjust_m()
    then
      raise exception 'ajuste longe da marcacao' using errcode = 'P0001';
    end if;

    -- E precisa estar perto de quem corrige: so se aponta para o que se ve.
    if extensions.st_distance(
         v_usuario::extensions.geography,
         v_corrigido::extensions.geography
       ) > public.patrol_signal_adjust_m()
    then
      raise exception 'ajuste longe de voce' using errcode = 'P0001';
    end if;
  end if;

  -- ── Campos da categoria ──
  v_tipo := nullif(btrim(coalesce(p_issue_type, '')), '');
  -- Mesma limpeza do cliente: a sugestao de poste vem como "12 - 34567" e o
  -- numero gravado precisa ser o da plaqueta fisica.
  v_plaqueta := nullif(
    btrim(regexp_replace(btrim(coalesce(p_pole_number, '')), '^\s*\d+\s*[-–—]\s*', '')),
    ''
  );

  if v_categoria = 'iluminacao' then
    if v_tipo is null then
      raise exception 'tipo do problema obrigatorio' using errcode = '22023';
    end if;
    if v_plaqueta is null then
      raise exception 'plaqueta obrigatoria' using errcode = '22023';
    end if;
  end if;

  select coalesce(pr.is_admin, false) or coalesce(pr.is_master, false)
    into v_admin
  from public.profiles pr where pr.id = auth.uid();

  update public.reports r
  set title = btrim(p_title),
      description = coalesce(nullif(btrim(p_description), ''), r.description),
      location = coalesce(v_corrigido, r.location),
      -- Preenche o que faltou na sinalizacao. `coalesce` na ORDEM da linha
      -- primeiro: o que ja estava gravado vence sempre. (176)
      city_id = coalesce(r.city_id, p_city_id),
      neighborhood = coalesce(r.neighborhood, nullif(btrim(p_neighborhood), '')),
      issue_type = case when v_categoria = 'iluminacao' then v_tipo else null end,
      pole_number = case when v_categoria = 'iluminacao' then v_plaqueta else null end,
      -- As tres colunas guardam a mesma plaqueta por caminhos diferentes de
      -- cadastro; o formulario comum preenche assim, e divergir faria a mesma
      -- bronca aparecer identificada numa tela e sem identificacao em outra.
      reported_post_identifier =
        case when v_categoria = 'iluminacao' then v_plaqueta else null end,
      reported_plate =
        case when v_categoria = 'iluminacao' then v_plaqueta else null end,
      is_from_water_utility =
        case when v_categoria = 'buracos'
             then coalesce(p_is_from_water_utility, false)
             else null end,
      signal_status = 'done',
      completed_by = auth.uid(),
      completed_at = now(),
      -- Volta para a fila normal: uma bronca que veio de sinal nao merece
      -- menos revisao que qualquer outra.
      moderation_status = case when coalesce(v_admin, false) then 'approved' else 'pending_approval' end
  where r.id = p_signal_id;

  return p_signal_id;
end $fn$;

grant execute on function public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, double precision, double precision,
  bigint, text, text, text, boolean
) to authenticated;

comment on function public.complete_patrol_signal(
  uuid, text, text, double precision, double precision, double precision, double precision,
  bigint, text, text, text, boolean
) is
  'Fecha um sinal aberto com cadastro completo. O AUTOR PODE fechar o proprio '
  '(191) — o equilibrio vem da contagem, nao de bloqueio. Presenca fisica e '
  'campos obrigatorios da categoria continuam valendo.';

-- ── 2. Placar do bairro ─────────────────────────────────────────────────────
--
-- Corpo da 190 com os blocos de sinal reescritos. Assinatura copiada da 174
-- caractere por caractere — mudar qualquer coluna aqui devolve 42P13.
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
    -- Bronca cadastrada direto.
    select r.author_id as user_id, r.city_id, r.neighborhood, 10 as pontos
    from public.reports r cross join limite l
    where r.origin = 'full'
      and r.moderation_status = 'approved'
      and r.neighborhood is not null
      and r.created_at >= l.desde

    union all

    -- Fechou o sinal DE OUTRA PESSOA: 12. Vale mais que um cadastro direto
    -- porque exigiu ir a um lugar que outra pessoa escolheu.
    select r.completed_by, r.city_id, r.neighborhood, 12
    from public.reports r cross join limite l
    where r.signal_status = 'done'
      and r.completed_by is not null
      and r.completed_by <> r.author_id
      and r.moderation_status = 'approved'
      and r.neighborhood is not null
      and r.completed_at >= l.desde

    union all

    -- Fechou o PROPRIO sinal: 10, o mesmo de cadastrar direto — e o sinal
    -- correspondente nao paga (bloco abaixo). Marcar de passagem e voltar
    -- depois com a foto rende exatamente o que fazer tudo de uma vez.
    select r.completed_by, r.city_id, r.neighborhood, 10
    from public.reports r cross join limite l
    where r.signal_status = 'done'
      and r.completed_by is not null
      and r.completed_by = r.author_id
      and r.moderation_status = 'approved'
      and r.neighborhood is not null
      and r.completed_at >= l.desde

    union all

    -- O sinal em si: 3. Nao paga quando quem o fechou foi o proprio autor —
    -- nesse caso o bloco acima ja pagou os 10 do cadastro inteiro, e somar os
    -- dois recriaria o atalho que a 175 tentou impedir com bloqueio.
    select r.author_id, r.city_id, r.neighborhood, 3
    from public.reports r cross join limite l
    where r.origin = 'signal'
      and r.signal_status in ('open', 'done')
      and coalesce(r.completed_by, '00000000-0000-0000-0000-000000000000'::uuid) <> r.author_id
      and r.neighborhood is not null
      and r.created_at >= l.desde

    union all

    -- Vistoria: foi ate o ponto e confirmou que nao ha nada (190).
    -- Nunca para o proprio autor: marcar e desmarcar nao produz nada, e pagar
    -- pelos dois toques seria pagar por um par de cliques.
    select r.emptied_by, r.city_id, r.neighborhood, 3
    from public.reports r cross join limite l
    where r.signal_status = 'empty'
      and r.emptied_by is not null
      and r.emptied_by <> r.author_id
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
  'Pontos por bairro nos ultimos N dias. Pesos: bronca 10, sinal de outro fechado 12, proprio sinal fechado 10, sinal 3, vistoria 3, atualizacao 5 — espelham PONTOS em src/lib/patrolGame.js.';

grant execute on function public.neighborhood_actions(integer) to authenticated;

-- ── 3. Contadores da central ────────────────────────────────────────────────
--
-- A separacao precisa existir aqui tambem, senao o perfil e o bairro dao totais
-- diferentes para a mesma pessoa. O drop e por causa de empties_count (190) e
-- do 42P13 de sempre.
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
  -- Broncas proprias: as cadastradas direto MAIS os sinais que a propria
  -- pessoa voltou e fechou. Sao a mesma coisa para quem olha o resultado —
  -- uma bronca com foto, feita por ela — e valem os mesmos 10.
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
      -- Sinais que ainda valem como sinal: os abertos, e os que outra pessoa
      -- fechou. O que a propria pessoa fechou ja entrou como bronca acima.
      (select count(*) from public.reports r
        where r.author_id = target_user_id
          and r.origin = 'signal'
          and r.signal_status in ('open', 'done')
          and coalesce(r.completed_by, '00000000-0000-0000-0000-000000000000'::uuid)
              <> r.author_id)::integer as signals_count,
      -- Missoes: so as de OUTRA pessoa. Fechar o proprio sinal nao e missao —
      -- e cadastro, e ja foi contado como tal.
      (select count(*) from public.reports r
        where r.completed_by = target_user_id
          and r.completed_by <> r.author_id
          and r.signal_status = 'done'
          and r.moderation_status = 'approved')::integer as missions_count,
      -- Vistorias: nunca as do proprio autor (ver o cabecalho).
      (select count(*) from public.reports r
        where r.emptied_by = target_user_id
          and r.emptied_by <> r.author_id
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
  'Contadores da central de missoes. SECURITY INVOKER. Fechar o proprio sinal conta como bronca (nao como missao) e o sinal correspondente deixa de contar — ver 191.';

grant execute on function public.get_mission_counters(uuid) to authenticated;
