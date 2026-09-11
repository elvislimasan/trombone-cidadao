-- 238_perfil_publico_identidade_civica.sql
--
-- Perfil público e identidade cívica no Trombone Cidadão.
--
-- Permite que um usuário crie um nome de usuário único (@username) e ative
-- uma página pública de prestação de contas e evidências (/u/:username).
--
-- PRINCÍPIOS DESTE BLOCO:
--   1. Leitura pública NUNCA expõe a tabela `profiles` inteira: colunas como
--      telefone, e-mail, termos aceitos e flags de admin ficam isoladas.
--   2. Denúncias anônimas (is_anonymous = true) JAMAIS aparecem no perfil
--      público do autor.
--   3. Validação de username no banco (tamanho, caracteres, sem pontos duplos
--      e proibição de nomes de rotas e termos reservados).
--   4. Moderação de perfil com tabela dedicada (profile_reports), seguindo
--      o padrão de "uma pessoa, um voto" da migração 193.

-- ── 1. CAMPOS NA TABELA PROFILES ────────────────────────────────────────────

alter table public.profiles
  add column if not exists username text,
  add column if not exists username_normalized text,
  add column if not exists public_profile_enabled boolean not null default false,
  add column if not exists public_profile_type text not null default 'citizen',
  add column if not exists public_bio text,
  add column if not exists public_website text,
  add column if not exists public_city_visible boolean not null default true,
  add column if not exists public_activity_visible boolean not null default true,
  add column if not exists public_searchable boolean not null default true,
  add column if not exists verification_status text not null default 'none',
  add column if not exists verified_at timestamptz;

-- Validação de tipo de perfil e status de verificação
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_public_profile_type_check'
  ) then
    alter table public.profiles
      add constraint profiles_public_profile_type_check
      check (public_profile_type in ('citizen', 'journalist', 'mandate', 'official', 'organization'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_verification_status_check'
  ) then
    alter table public.profiles
      add constraint profiles_verification_status_check
      check (verification_status in ('none', 'pending', 'verified', 'rejected'));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'profiles_public_bio_length_check'
  ) then
    alter table public.profiles
      add constraint profiles_public_bio_length_check
      check (length(public_bio) <= 280);
  end if;
end $$;

-- Índice único case-insensitive e normalizado para usernames
create unique index if not exists profiles_username_normalized_key
  on public.profiles (username_normalized)
  where username_normalized is not null;

-- ── 2. PALAVRAS RESERVADAS E VALIDAÇÃO ──────────────────────────────────────

create or replace function public.is_username_reserved(p_username text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select lower(trim(p_username)) in (
    'admin', 'administrator', 'suporte', 'support', 'trombone', 'trombonecidadao',
    'prefeitura', 'vereador', 'mandato', 'oficial', 'governo', 'camara',
    'feed', 'mapa', 'bronca', 'broncas', 'obras', 'obras-publicas', 'estatisticas',
    'sobre', 'contato', 'noticias', 'servicos', 'perfil', 'login', 'cadastro',
    'entrar', 'sair', 'ajuda', 'termos', 'privacidade', 'patrulha', 'missoes',
    'agora', 'radar', 'pavimentacao', 'abaixo-assinado', 'peticoes', 'favoritos',
    'settings', 'api', 'auth', 'share', 'u', 'root', 'moderador', 'moderacao',
    'sistema', 'ouvidoria', 'denuncia', 'relatorio'
  );
$$;

create or replace function public.validate_username_format(p_username text)
returns boolean
language sql
immutable
set search_path = public
as $$
  select (
    p_username is not null
    and length(p_username) >= 3
    and length(p_username) <= 30
    and p_username ~ '^[a-z0-9][a-z0-9._]{1,28}[a-z0-9]$'
    and p_username !~ '\.\.'
    and not public.is_username_reserved(p_username)
  );
$$;

-- Trigger para manter username_normalized sincronizado em minúsculas
create or replace function public.profiles_normalize_username_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is not null and trim(new.username) <> '' then
    new.username := trim(new.username);
    new.username_normalized := lower(new.username);

    if not public.validate_username_format(new.username_normalized) then
      raise exception 'Formato de username invalido ou reservado pelo sistema.';
    end if;
  else
    new.username := null;
    new.username_normalized := null;
  end if;
  return new;
end;
$$;

drop trigger if exists tr_profiles_normalize_username on public.profiles;
create trigger tr_profiles_normalize_username
  before insert or update of username on public.profiles
  for each row
  execute function public.profiles_normalize_username_trigger();

-- ── 3. RPCS SEGURAS PARA DISPONIBILIDADE E CONFIGURAÇÃO ──────────────────────

-- Verifica disponibilidade do username
create or replace function public.check_username_availability(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_exists boolean;
  v_valid boolean;
  v_current_user_has_it boolean;
begin
  if p_username is null or trim(p_username) = '' then
    return jsonb_build_object('available', false, 'reason', 'Username nao informado.');
  end if;

  v_norm := lower(trim(p_username));
  v_valid := public.validate_username_format(v_norm);

  if not v_valid then
    if length(v_norm) < 3 or length(v_norm) > 30 then
      return jsonb_build_object('available', false, 'reason', 'O username deve ter entre 3 e 30 caracteres.');
    elsif public.is_username_reserved(v_norm) then
      return jsonb_build_object('available', false, 'reason', 'Este nome e reservado pelo sistema.');
    elsif v_norm ~ '\.\.' then
      return jsonb_build_object('available', false, 'reason', 'Nao e permitido usar dois pontos consecutivos.');
    elsif v_norm ~ '^\.' or v_norm ~ '\.$' then
      return jsonb_build_object('available', false, 'reason', 'Nao pode comecar nem terminar com ponto.');
    else
      return jsonb_build_object('available', false, 'reason', 'Use apenas letras minusculas, numeros, ponto e sublinhado.');
    end if;
  end if;

  -- Se o próprio usuário autenticado já possui esse username, é válido para ele manter
  v_current_user_has_it := exists (
    select 1 from public.profiles
    where username_normalized = v_norm and id = auth.uid()
  );

  if v_current_user_has_it then
    return jsonb_build_object('available', true, 'is_own', true);
  end if;

  v_exists := exists (
    select 1 from public.profiles
    where username_normalized = v_norm
  );

  if v_exists then
    return jsonb_build_object('available', false, 'reason', 'Este nome de usuario ja esta em uso.');
  end if;

  return jsonb_build_object('available', true);
end;
$$;

-- Define o username do próprio usuário autenticado
create or replace function public.set_public_username(p_username text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_norm text;
  v_check jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  v_norm := lower(trim(coalesce(p_username, '')));

  v_check := public.check_username_availability(v_norm);
  if not (v_check->>'available')::boolean then
    return v_check;
  end if;

  update public.profiles
  set username = v_norm,
      username_normalized = v_norm
  where id = v_uid;

  return jsonb_build_object('success', true, 'username', v_norm);
end;
$$;

-- ── 4. CONSULTA PÚBLICA SEGURA (PERFIL E ESTATÍSTICAS) ──────────────────────

create or replace function public.get_public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_profile record;
  v_stats record;
  v_city_name text;
begin
  if p_username is null or trim(p_username) = '' then
    return null;
  end if;

  v_norm := lower(trim(p_username));
  -- Se o visitante passar "@username", removemos o prefixo arroba
  if starts_with(v_norm, '@') then
    v_norm := substring(v_norm from 2);
  end if;

  select
    pr.id,
    pr.name,
    pr.username,
    pr.avatar_type,
    pr.avatar_url,
    pr.avatar_config,
    pr.public_bio,
    pr.public_website,
    pr.public_profile_type,
    pr.public_profile_enabled,
    pr.public_city_visible,
    pr.public_activity_visible,
    pr.verification_status,
    pr.verified_at,
    pr.created_at,
    pr.city_id
  into v_profile
  from public.profiles pr
  where pr.username_normalized = v_norm
  limit 1;

  if v_profile is null then
    return null;
  end if;

  -- Se o perfil público não estiver ativado, não expor dados públicos
  if not v_profile.public_profile_enabled then
    return jsonb_build_object(
      'id', v_profile.id,
      'username', v_profile.username,
      'public_profile_enabled', false
    );
  end if;

  -- Nome da cidade se a visibilidade estiver ligada
  if v_profile.public_city_visible and v_profile.city_id is not null then
    select c.name into v_city_name from public.cities c where c.id = v_profile.city_id limit 1;
  end if;

  -- Estatísticas de impacto cívico (NUNCA contabiliza denúncias anônimas)
  select
    count(*) filter (where r.moderation_status = 'approved' and r.status != 'rejected') as total_reports,
    count(*) filter (where r.moderation_status = 'approved' and r.status = 'resolved') as resolved_reports,
    count(*) filter (where r.moderation_status = 'approved' and r.status = 'in-progress') as in_progress_reports,
    count(distinct r.city_id) filter (where r.moderation_status = 'approved' and r.city_id is not null) as cities_count,
    coalesce(sum(
      (select count(*) from public.upvotes u where u.report_id = r.id)
    ), 0) as total_upvotes_received
  into v_stats
  from public.reports r
  where r.author_id = v_profile.id
    and r.is_anonymous = false;

  return jsonb_build_object(
    'id', v_profile.id,
    'name', v_profile.name,
    'username', v_profile.username,
    'avatar_type', v_profile.avatar_type,
    'avatar_url', v_profile.avatar_url,
    'avatar_config', v_profile.avatar_config,
    'public_bio', v_profile.public_bio,
    'public_website', v_profile.public_website,
    'public_profile_type', v_profile.public_profile_type,
    'public_profile_enabled', true,
    'verification_status', v_profile.verification_status,
    'verified_at', v_profile.verified_at,
    'created_at', v_profile.created_at,
    'city_name', v_city_name,
    'stats', jsonb_build_object(
      'total_reports', coalesce(v_stats.total_reports, 0),
      'resolved_reports', coalesce(v_stats.resolved_reports, 0),
      'in_progress_reports', coalesce(v_stats.in_progress_reports, 0),
      'cities_count', coalesce(v_stats.cities_count, 0),
      'total_upvotes_received', coalesce(v_stats.total_upvotes_received, 0)
    )
  );
end;
$$;

-- ── 5. CONSULTA PÚBLICA DE BRONCAS DO PERFIL ────────────────────────────────

create or replace function public.get_public_profile_reports(
  p_username text,
  p_status text default null,
  p_limit int default 20,
  p_offset int default 0
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_norm text;
  v_profile_id uuid;
  v_enabled boolean;
  v_reports jsonb;
  v_total int;
begin
  v_norm := lower(trim(p_username));
  if starts_with(v_norm, '@') then
    v_norm := substring(v_norm from 2);
  end if;

  select pr.id, pr.public_profile_enabled
  into v_profile_id, v_enabled
  from public.profiles pr
  where pr.username_normalized = v_norm
  limit 1;

  if v_profile_id is null or not coalesce(v_enabled, false) then
    return jsonb_build_object('total', 0, 'reports', '[]'::jsonb);
  end if;

  -- Contagem total de broncas aprovadas e não anônimas
  select count(*)
  into v_total
  from public.reports r
  where r.author_id = v_profile_id
    and r.is_anonymous = false
    and r.moderation_status = 'approved'
    and r.status != 'rejected'
    and (p_status is null or p_status = 'all' or r.status = p_status);

  -- Lista de broncas aprovadas
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'id', r.id,
      'title', r.title,
      'description', r.description,
      'status', r.status,
      'address', r.address,
      'created_at', r.created_at,
      'resolved_at', r.resolved_at,
      'category_id', r.category_id,
      'category_name', c.name,
      'category_icon', c.icon,
      'upvotes', (select count(*) from public.upvotes u where u.report_id = r.id),
      'media', (
        select coalesce(jsonb_agg(
          jsonb_build_object('id', rm.id, 'url', rm.url, 'type', rm.type)
        ), '[]'::jsonb)
        from public.report_media rm
        where rm.report_id = r.id
      )
    ) order by r.created_at desc
  ), '[]'::jsonb)
  into v_reports
  from (
    select r.*
    from public.reports r
    where r.author_id = v_profile_id
      and r.is_anonymous = false
      and r.moderation_status = 'approved'
      and r.status != 'rejected'
      and (p_status is null or p_status = 'all' or r.status = p_status)
    order by r.created_at desc
    limit least(p_limit, 50)
    offset greatest(p_offset, 0)
  ) r
  left join public.categories c on c.id = r.category_id;

  return jsonb_build_object(
    'total', v_total,
    'reports', v_reports
  );
end;
$$;

-- ── 6. TABELA DE DENÚNCIAS DE PERFIL (MODERAÇÃO) ─────────────────────────────

create table if not exists public.profile_reports (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  details text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (profile_id, reporter_id)
);

create index if not exists profile_reports_abertas_idx
  on public.profile_reports (profile_id)
  where resolved_at is null;

alter table public.profile_reports enable row level security;

drop policy if exists "profile_reports_insert" on public.profile_reports;
create policy "profile_reports_insert"
  on public.profile_reports for insert
  to authenticated
  with check (reporter_id = auth.uid());

drop policy if exists "profile_reports_select" on public.profile_reports;
create policy "profile_reports_select"
  on public.profile_reports for select
  using (
    reporter_id = auth.uid()
    or coalesce(
      (select is_admin or is_master from public.profiles where id = auth.uid()),
      false
    )
  );

create or replace function public.report_public_profile(
  p_profile_id uuid,
  p_reason text,
  p_details text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'E necessario estar conectado para denunciar um perfil.';
  end if;

  if v_uid = p_profile_id then
    return jsonb_build_object('success', false, 'message', 'Voce nao pode denunciar seu proprio perfil.');
  end if;

  insert into public.profile_reports (profile_id, reporter_id, reason, details)
  values (p_profile_id, v_uid, trim(p_reason), trim(p_details))
  on conflict (profile_id, reporter_id) do update
  set reason = excluded.reason,
      details = excluded.details,
      created_at = now(),
      resolved_at = null;

  return jsonb_build_object('success', true, 'message', 'Denuncia registrada com sucesso. Nossa equipe ira analisar.');
end;
$$;

comment on function public.get_public_profile(text) is
  'Leitura pública e segura do perfil cívico pelo username. Não expõe telefones, dados sensíveis nem broncas anônimas.';

