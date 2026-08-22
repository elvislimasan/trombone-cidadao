-- 173_report_signals.sql
--
-- Sinalizacao rapida: marcar um buraco ou um poste apagado com um toque, sem
-- foto e sem descricao, para que outra pessoa complete o cadastro depois.
--
-- POR QUE DENTRO DE `reports`, E NAO EM TABELA PROPRIA
--
-- Um sinal e uma bronca incompleta, nao outra coisa. Tabela separada
-- duplicaria mapa, RLS, moderacao, midia, comentarios e ranking - e no dia em
-- que o sinal virasse bronca, seria preciso copiar a linha de uma tabela para
-- a outra, quebrando o id que alguem ja compartilhou. Aqui a linha nasce
-- incompleta e amadurece no lugar.
--
-- O QUE MANTEM O SINAL FORA DO FEED
--
-- `moderation_status = 'pending_approval'`. Todas as consultas publicas (feed,
-- mapa, clusters, perto de mim) ja filtram por 'approved', entao nenhuma delas
-- precisa saber que sinais existem. A visibilidade do sinal vem de uma policy
-- propria, so para quem esta logado, e das RPCs deste arquivo.
--
-- A UNICA excecao e a fila de moderacao, que busca exatamente
-- 'pending_approval': ela precisa excluir `signal_status = 'open'`
-- explicitamente, senao o moderador recebe sinais sem foto para julgar. Isso
-- esta feito no ModerationPage.jsx.
--
-- REGRA DE PRESENCA
--
-- Completar ou descartar uma missao exige estar a menos de 100 m do ponto, e a
-- verificacao e SERVIDOR. Fizesse o cliente, seria decoracao: qualquer um
-- mandaria coordenadas inventadas no corpo da requisicao. As funcoes que
-- escrevem sao `security definer` por isso - elas precisam alterar uma linha de
-- outro usuario, mas so depois de checar a distancia.
--
-- As policies vao versionadas aqui, como na 172, pelo mesmo motivo: policy que
-- so existe no dashboard nao aparece em diff nenhum.

-- ── Colunas ──────────────────────────────────────────────────────────────────

alter table public.reports
  -- Como a linha nasceu. NUNCA muda depois: e o que credita quem sinalizou,
  -- mesmo anos depois de a bronca estar resolvida.
  add column if not exists origin text not null default 'full',
  -- Ciclo de vida do sinal. Nulo para bronca cadastrada direto.
  --   open  - missao disponivel
  --   done  - alguem foi la e completou o cadastro
  --   empty - alguem foi la e nao encontrou nada
  add column if not exists signal_status text,
  -- Bairro no momento da acao, vindo do reverse-geocode (campo `suburb`).
  -- Texto solto de proposito: a tabela `bairros` so tem nome e cidade, sem
  -- poligono, entao nao ha como amarrar por geometria. Nulo e aceitavel - a
  -- acao conta no placar da cidade e fica fora do placar de bairro.
  add column if not exists neighborhood text,
  add column if not exists completed_by uuid references public.profiles(id) on delete set null,
  add column if not exists completed_at timestamptz,
  add column if not exists emptied_by uuid references public.profiles(id) on delete set null,
  add column if not exists emptied_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'reports_origem_coerente'
  ) then
    alter table public.reports
      add constraint reports_origem_coerente check (
        (origin = 'full'   and signal_status is null) or
        (origin = 'signal' and signal_status in ('open', 'done', 'empty'))
      );
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'reports_conclusao_coerente'
  ) then
    -- Quem completou e quando andam juntos, e so existem em sinal concluido.
    -- Sem isso daria para gravar completed_by numa bronca comum e o placar
    -- pagaria os 12 pontos de missao a quem nao cumpriu missao nenhuma.
    alter table public.reports
      add constraint reports_conclusao_coerente check (
        (completed_by is null and completed_at is null)
        or (completed_by is not null and completed_at is not null and signal_status = 'done')
      );
  end if;
end $$;

-- Missoes abertas por cidade: a listagem do modo patrulha.
create index if not exists reports_missoes_abertas_idx
  on public.reports (city_id, created_at desc)
  where origin = 'signal' and signal_status = 'open';

-- Busca por proximidade das missoes. Indice parcial: sao poucas linhas perto
-- do total de broncas, e o GiST cheio ja existe para o mapa.
create index if not exists reports_missoes_geo_idx
  on public.reports using gist (location)
  where origin = 'signal' and signal_status = 'open';

-- Placar por bairro.
create index if not exists reports_bairro_idx
  on public.reports (city_id, neighborhood, created_at desc)
  where neighborhood is not null;

-- ── Visibilidade ─────────────────────────────────────────────────────────────
--
-- Missao aberta e visivel a quem tem conta, mesmo nao estando aprovada. E o que
-- permite ver o pin no mapa e receber o alerta em patrulha.
--
-- `to authenticated` e deliberado: sinal nao tem foto nem revisao, e nao deve
-- aparecer para visitante nem alimentar buscador.
drop policy if exists reports_select_missoes_abertas on public.reports;
create policy reports_select_missoes_abertas on public.reports
  for select
  to authenticated
  using (origin = 'signal' and signal_status = 'open');

-- ── Criar sinal ──────────────────────────────────────────────────────────────
--
-- `security invoker`: o insert passa pela mesma policy de sempre (autor = quem
-- chama), e a checagem de duplicata enxerga o que o usuario ja enxergaria pela
-- policy acima. Nao ha nada a elevar.
--
-- A janela entre a checagem e o insert nao esta trancada. Duas pessoas
-- sinalizando o MESMO buraco no MESMO segundo criam dois sinais - e o custo
-- disso e uma missao repetida, nao um dado corrompido. Um advisory lock por
-- coordenada resolveria, e nao vale o preco.
create or replace function public.create_patrol_signal(
  p_lat double precision,
  p_lng double precision,
  p_category_id text,
  p_city_id bigint default null,
  p_neighborhood text default null
)
returns table (id uuid, duplicado boolean, existente_id uuid)
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  v_ponto extensions.geometry;
  v_existente uuid;
  v_nome_categoria text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'sem coordenada' using errcode = '22023';
  end if;

  v_ponto := extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326);

  -- Mesmo buraco, quinze sinais: sem este freio, o primeiro quarteirao ruim
  -- vira uma fila de missoes identicas e o mapa fica ilegivel. 30 m e a ordem
  -- de grandeza de um poste ao outro.
  select r.id into v_existente
  from public.reports r
  where r.origin = 'signal'
    and r.signal_status = 'open'
    and r.category_id is not distinct from p_category_id
    and r.location is not null
    and extensions.st_dwithin(
          r.location::extensions.geography,
          v_ponto::extensions.geography,
          30
        )
  limit 1;

  if v_existente is not null then
    return query select null::uuid, true, v_existente;
    return;
  end if;

  select c.name into v_nome_categoria
  from public.categories c where c.id = p_category_id;

  insert into public.reports (
    title, description, category_id, location, author_id, protocol,
    status, moderation_status, city_id, is_anonymous,
    origin, signal_status, neighborhood
  ) values (
    coalesce(v_nome_categoria, 'Problema') || ' sinalizado',
    'Sinalizado em campo. Aguarda registro completo com foto.',
    p_category_id,
    v_ponto,
    auth.uid(),
    'TROMB-' || (extract(epoch from clock_timestamp()) * 1000)::bigint::text,
    'pending',
    -- Fora de tudo que filtra por 'approved', que e o feed inteiro.
    'pending_approval',
    p_city_id,
    false,
    'signal',
    'open',
    nullif(btrim(p_neighborhood), '')
  )
  returning reports.id into v_id;

  return query select v_id, false, null::uuid;
end $$;

grant execute on function public.create_patrol_signal(
  double precision, double precision, text, bigint, text
) to authenticated;

-- ── Missoes por perto ────────────────────────────────────────────────────────
--
-- `security definer` para trazer o nome de quem sinalizou sem depender de a
-- policy de `profiles` liberar leitura de terceiros. Devolve so nome - nada de
-- e-mail, telefone ou id de auth.
create or replace function public.patrol_missions_nearby(
  p_lat double precision,
  p_lng double precision,
  p_radius_m double precision default 2000,
  p_limit integer default 50
)
returns table (
  id uuid,
  lat double precision,
  lng double precision,
  category_id text,
  category_name text,
  neighborhood text,
  created_at timestamptz,
  distance_meters double precision,
  signaled_by uuid,
  signaled_by_name text
)
language sql
stable
security definer
set search_path = public, extensions
as $$
  with origem as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326) as pt
  )
  select
    r.id,
    extensions.st_y(r.location::extensions.geometry),
    extensions.st_x(r.location::extensions.geometry),
    r.category_id,
    c.name,
    r.neighborhood,
    r.created_at,
    extensions.st_distance(r.location::extensions.geography, o.pt::extensions.geography),
    r.author_id,
    p.name
  from public.reports r
  cross join origem o
  left join public.categories c on c.id = r.category_id
  left join public.profiles p on p.id = r.author_id
  where r.origin = 'signal'
    and r.signal_status = 'open'
    and r.location is not null
    and extensions.st_dwithin(
          r.location::extensions.geography,
          o.pt::extensions.geography,
          greatest(100, least(coalesce(p_radius_m, 2000), 20000))
        )
  order by r.location operator(extensions.<->) o.pt
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

grant execute on function public.patrol_missions_nearby(
  double precision, double precision, double precision, integer
) to authenticated;

-- ── Regra de presenca ────────────────────────────────────────────────────────

create or replace function public.patrol_signal_presence_m()
returns double precision
language sql
immutable
as $$ select 100::double precision $$;

comment on function public.patrol_signal_presence_m() is
  'Distancia maxima, em metros, para agir sobre uma missao. Um lugar so, lido pelo SQL e exposto ao cliente para desabilitar o botao antes do toque.';

grant execute on function public.patrol_signal_presence_m() to authenticated;

-- ── Cumprir a missao ─────────────────────────────────────────────────────────
--
-- `security definer` porque quem completa quase nunca e o autor da linha, e a
-- policy de update de `reports` (com razao) so libera o proprio dono. A funcao
-- e o unico caminho que permite mexer na bronca de outro - e so depois de
-- provar presenca.
--
-- O ponto NAO se move. A missao e aquele lugar; deixar o cliente reescrever a
-- coordenada permitiria "cumprir" de casa e arrastar o pin para onde quisesse.
create or replace function public.complete_patrol_signal(
  p_signal_id uuid,
  p_title text,
  p_description text,
  p_lat double precision,
  p_lng double precision
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_distancia double precision;
  v_admin boolean;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;
  if coalesce(btrim(p_title), '') = '' then
    raise exception 'titulo obrigatorio' using errcode = '22023';
  end if;

  select extensions.st_distance(
           r.location::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
         )
    into v_distancia
  from public.reports r
  where r.id = p_signal_id
    and r.origin = 'signal'
    and r.signal_status = 'open';

  if not found then
    raise exception 'missao indisponivel' using errcode = 'P0002';
  end if;

  if v_distancia is null or v_distancia > public.patrol_signal_presence_m() then
    raise exception 'fora do local' using errcode = 'P0001';
  end if;

  select coalesce(pr.is_admin, false) or coalesce(pr.is_master, false)
    into v_admin
  from public.profiles pr where pr.id = auth.uid();

  update public.reports r
  set title = btrim(p_title),
      description = coalesce(nullif(btrim(p_description), ''), r.description),
      signal_status = 'done',
      completed_by = auth.uid(),
      completed_at = now(),
      -- Volta para a fila normal: uma bronca que veio de missao nao merece
      -- menos revisao que qualquer outra.
      moderation_status = case when coalesce(v_admin, false) then 'approved' else 'pending_approval' end
  where r.id = p_signal_id;

  return p_signal_id;
end $$;

grant execute on function public.complete_patrol_signal(
  uuid, text, text, double precision, double precision
) to authenticated;

-- ── Nada encontrado ──────────────────────────────────────────────────────────
--
-- O sinal para de valer pontos na hora, porque a pontuacao e derivada: a
-- funcao de nivel simplesmente deixa de contar sinais em 'empty'. Nao ha
-- estorno, nao ha saldo a corrigir.
--
-- `emptied_by` fica gravado de proposito. Exigir presenca fisica ja torna caro
-- usar o botao para sabotar o placar alheio; o registro e o que permite
-- auditar quem tentou.
create or replace function public.mark_patrol_signal_empty(
  p_signal_id uuid,
  p_lat double precision,
  p_lng double precision
)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare
  v_distancia double precision;
begin
  if auth.uid() is null then
    raise exception 'sem sessao' using errcode = '42501';
  end if;

  select extensions.st_distance(
           r.location::extensions.geography,
           extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography
         )
    into v_distancia
  from public.reports r
  where r.id = p_signal_id
    and r.origin = 'signal'
    and r.signal_status = 'open';

  if not found then
    raise exception 'missao indisponivel' using errcode = 'P0002';
  end if;

  if v_distancia is null or v_distancia > public.patrol_signal_presence_m() then
    raise exception 'fora do local' using errcode = 'P0001';
  end if;

  update public.reports
  set signal_status = 'empty',
      emptied_by = auth.uid(),
      emptied_at = now(),
      -- Some da fila de moderacao: nao ha o que aprovar num sinal que nao
      -- virou bronca.
      moderation_status = 'rejected'
  where id = p_signal_id;

  return p_signal_id;
end $$;

grant execute on function public.mark_patrol_signal_empty(
  uuid, double precision, double precision
) to authenticated;

comment on column public.reports.origin is
  'Como a linha nasceu: full (cadastro completo) ou signal (sinalizacao rapida). Imutavel.';
comment on column public.reports.signal_status is
  'Ciclo do sinal: open (missao disponivel), done (completada), empty (nada encontrado no local).';
comment on column public.reports.neighborhood is
  'Bairro no momento da acao, do reverse-geocode. Base dos titulos e medalhas de bairro.';
