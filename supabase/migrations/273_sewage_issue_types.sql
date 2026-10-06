-- Subcategorias de esgoto usam reports.issue_type, já existente como text.
-- Valores antigos sem tipo permanecem válidos; novos valores fora do catálogo são rejeitados.
-- A antiga 272 já instalou esta constraint em alguns ambientes. Preservar
-- a existente (inclusive seu estado de validação) em vez de recriá-la.
do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.reports'::regclass
      and conname = 'reports_esgoto_issue_type_check'
  ) then
    alter table public.reports
      add constraint reports_esgoto_issue_type_check
      check (
        category_id <> 'esgoto'
        or issue_type is null
        or issue_type in (
          'sewer_clogged',
          'sewer_box_broken',
          'sewer_box_without_cover',
          'sewer_cover_broken'
        )
      ) not valid;
  end if;
end
$migration$;

-- A missão de patrulha também cria broncas; ela precisa preservar o tipo de esgoto.
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

  if v_categoria in ('iluminacao', 'esgoto') then
    if v_tipo is null then
      raise exception 'tipo do problema obrigatorio' using errcode = '22023';
    end if;
    if v_categoria = 'iluminacao' and v_plaqueta is null then
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
      issue_type = case when v_categoria in ('iluminacao', 'esgoto') then v_tipo else null end,
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
