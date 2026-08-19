-- 172_patrols.sql
--
-- Registro de uma sessao do modo patrulha: quanto tempo, quanta distancia, por
-- quantas broncas passou e quantas confirmou.
--
-- NAO guarda o percurso. O traco aparece na tela durante a patrulha e morre com
-- ela: gravar a rota publicaria, junto, de onde a pessoa saiu e onde chegou -
-- normalmente a propria casa. Num app onde as pessoas denunciam problemas e
-- podem se indispor com quem os causou, isso nao e detalhe. Sem percurso, o
-- unico dado de localizacao aqui e a cidade.
--
-- As policies vao versionadas nesta migracao de proposito. Varias tabelas do
-- projeto (profiles, notifications, push_subscriptions) tem policy criada so
-- pelo dashboard, invisivel ao git - o que ja custou tempo de auditoria. Esta
-- nao entra nessa lista.

create table if not exists public.patrols (
  id                   uuid primary key default gen_random_uuid(),
  -- Aponta para profiles, nao para auth.users, como report_updates e
  -- permission_rules ja fazem. Alem da consistencia, e o que permite o embed do
  -- PostgREST (`author:profiles!patrols_user_id_fkey`) usado no cartao
  -- compartilhado: sem FK direta para profiles, o join nao existe.
  user_id              uuid not null references public.profiles(id) on delete cascade,
  city_id              bigint references public.cities(id),

  started_at           timestamptz not null,
  ended_at             timestamptz not null,
  duration_seconds     integer not null,
  distance_meters      integer not null,

  -- Contadores COM os ids ao lado: sem eles nao ha como auditar depois se um
  -- numero foi inflado, e os checks abaixo nao teriam contra o que validar.
  passed_count         integer not null default 0,
  confirmed_count      integer not null default 0,
  passed_report_ids    uuid[]  not null default '{}',
  confirmed_report_ids uuid[]  not null default '{}',

  -- Vira true quando o usuario compartilha. Sem isso, a linha e privada.
  is_public            boolean not null default false,

  created_at           timestamptz not null default now(),

  constraint patrols_periodo_valido
    check (ended_at >= started_at),
  constraint patrols_medidas_nao_negativas
    check (duration_seconds >= 0 and distance_meters >= 0),

  -- Amarra os contadores aos ids: o cliente nao consegue mandar
  -- confirmed_count = 500 com a lista vazia.
  constraint patrols_contagens_batem
    check (
      passed_count    = cardinality(passed_report_ids) and
      confirmed_count = cardinality(confirmed_report_ids)
    ),

  -- Nao da para confirmar uma bronca por que nao se passou.
  constraint patrols_confirmadas_sao_subconjunto
    check (confirmed_report_ids <@ passed_report_ids)
);

create index if not exists patrols_user_recentes_idx
  on public.patrols (user_id, ended_at desc);

-- Listagem publica por cidade (ex: patrulhas recentes de um municipio).
create index if not exists patrols_publicas_idx
  on public.patrols (city_id, ended_at desc)
  where is_public;

alter table public.patrols enable row level security;

-- Leitura: a propria sempre; a de terceiros so se compartilhada.
drop policy if exists patrols_select_own on public.patrols;
create policy patrols_select_own on public.patrols
  for select
  using (auth.uid() = user_id);

drop policy if exists patrols_select_public on public.patrols;
create policy patrols_select_public on public.patrols
  for select
  using (is_public);

-- Escrita: so o dono, e so em nome de si mesmo. O with check no update impede
-- transferir a patrulha para outro user_id.
drop policy if exists patrols_insert_own on public.patrols;
create policy patrols_insert_own on public.patrols
  for insert
  with check (auth.uid() = user_id);

drop policy if exists patrols_update_own on public.patrols;
create policy patrols_update_own on public.patrols
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists patrols_delete_own on public.patrols;
create policy patrols_delete_own on public.patrols
  for delete
  using (auth.uid() = user_id);

grant select, insert, update, delete on public.patrols to authenticated;
-- anon so enxerga o que a policy de is_public liberar - e o que faz o link
-- compartilhado abrir para quem ainda nao tem conta.
grant select on public.patrols to anon;

-- ── Totais do patrulheiro ────────────────────────────────────────────────────
--
-- Alimenta as conquistas, que sao DERIVADAS e nao gravadas - mesma escolha da
-- 169 para o nivel ("o nivel NAO e uma coluna gravada em profiles"). Sem tabela
-- de conquistas, sem regra de desbloqueio no banco e sem nada para
-- ressincronizar quando a regra mudar.
--
-- Sem security definer de proposito: a RLS restringe ao proprio usuario, que e
-- o unico uso. Chamar com outro id devolve so o que aquele usuario tornou
-- publico, nao os totais dele.
create or replace function public.get_patrol_stats(target_user_id uuid)
returns table (
  patrols_count           integer,
  total_passed            integer,
  total_confirmed         integer,
  total_distance_meters   integer,
  total_duration_seconds  integer,
  last_patrol_at          timestamptz
)
language sql
stable
as $$
  select
    count(*)::integer,
    coalesce(sum(passed_count), 0)::integer,
    coalesce(sum(confirmed_count), 0)::integer,
    coalesce(sum(distance_meters), 0)::integer,
    coalesce(sum(duration_seconds), 0)::integer,
    max(ended_at)
  from public.patrols
  where user_id = target_user_id;
$$;

grant execute on function public.get_patrol_stats(uuid) to authenticated;

-- ── Ranking da cidade ────────────────────────────────────────────────────────
--
-- Conta APENAS patrulhas compartilhadas. Duas razoes:
--
--   1. Privacidade por consentimento. Entrar no placar passa a ser um ato
--      explicito - quem nunca compartilhou nada nao aparece. Um ranking sobre
--      todas as patrulhas revelaria que alguem saiu patrulhando mesmo tendo
--      mantido tudo privado.
--   2. Consistencia. Sem security definer, a RLS mostraria a cada um as
--      proprias linhas privadas e o placar mudaria conforme quem olha. Filtrar
--      por is_public faz todo mundo ver o mesmo numero - e dispensa elevar
--      privilegio da funcao.
create or replace function public.patrol_ranking(
  target_city_id bigint,
  desde timestamptz default null,
  limite integer default 20
)
returns table (
  user_id        uuid,
  name           text,
  avatar_url     text,
  patrols_count  integer,
  confirmed_sum  integer
)
language sql
stable
as $$
  select
    p.user_id,
    pr.name,
    pr.avatar_url,
    count(*)::integer,
    coalesce(sum(p.confirmed_count), 0)::integer
  from public.patrols p
  join public.profiles pr on pr.id = p.user_id
  where p.is_public
    and (target_city_id is null or p.city_id = target_city_id)
    and (desde is null or p.ended_at >= desde)
  group by p.user_id, pr.name, pr.avatar_url
  order by 5 desc, 4 desc
  limit greatest(1, least(coalesce(limite, 20), 100));
$$;

grant execute on function public.patrol_ranking(bigint, timestamptz, integer) to anon, authenticated;

-- ── Dias com patrulha ────────────────────────────────────────────────────────
--
-- So as datas, para o cliente calcular a sequencia. A regra de "dias seguidos"
-- fica em funcao pura no JS, testada sem banco - em SQL exigiria generate_series
-- e fuso, e nao daria para verificar as bordas (virada de mes, dia pulado) com
-- a mesma facilidade.
create or replace function public.get_patrol_days(target_user_id uuid, dias integer default 90)
returns table (dia date)
language sql
stable
as $$
  select distinct (ended_at at time zone 'America/Sao_Paulo')::date as dia
  from public.patrols
  where user_id = target_user_id
    and ended_at >= now() - make_interval(days => greatest(1, least(coalesce(dias, 90), 365)))
  order by dia desc;
$$;

grant execute on function public.get_patrol_days(uuid, integer) to authenticated;
