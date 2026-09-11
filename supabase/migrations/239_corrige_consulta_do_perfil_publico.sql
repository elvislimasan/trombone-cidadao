-- Corrige a leitura do perfil publico criada na migracao 238.
--
-- O schema historico de `profiles` nao possuia `created_at`, embora a RPC
-- passasse a consulta-la. Tambem nao existe uma tabela `upvotes`: os apoios
-- das broncas vivem em `signatures` desde a migracao 012.

-- Preserva a data real de criacao da conta para os perfis existentes e deixa
-- o campo disponivel para novos perfis. O bloco em duas etapas evita preencher
-- contas antigas com a data desta migracao.
alter table public.profiles
  add column if not exists created_at timestamptz;

update public.profiles pr
set created_at = au.created_at
from auth.users au
where au.id = pr.id
  and pr.created_at is null;

update public.profiles
set created_at = now()
where created_at is null;

alter table public.profiles
  alter column created_at set default now(),
  alter column created_at set not null;

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

  if not v_profile.public_profile_enabled then
    return jsonb_build_object(
      'id', v_profile.id,
      'username', v_profile.username,
      'public_profile_enabled', false
    );
  end if;

  if v_profile.public_city_visible and v_profile.city_id is not null then
    select c.name
    into v_city_name
    from public.cities c
    where c.id = v_profile.city_id
    limit 1;
  end if;

  select
    count(*) filter (
      where r.moderation_status = 'approved' and r.status != 'rejected'
    ) as total_reports,
    count(*) filter (
      where r.moderation_status = 'approved' and r.status = 'resolved'
    ) as resolved_reports,
    count(*) filter (
      where r.moderation_status = 'approved' and r.status = 'in-progress'
    ) as in_progress_reports,
    count(distinct r.city_id) filter (
      where r.moderation_status = 'approved' and r.city_id is not null
    ) as cities_count,
    coalesce(sum(
      (select count(*) from public.signatures s where s.report_id = r.id)
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

  select count(*)
  into v_total
  from public.reports r
  where r.author_id = v_profile_id
    and r.is_anonymous = false
    and r.moderation_status = 'approved'
    and r.status != 'rejected'
    and (p_status is null or p_status = 'all' or r.status = p_status);

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
      'upvotes', (select count(*) from public.signatures s where s.report_id = r.id),
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
    limit least(greatest(coalesce(p_limit, 20), 0), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  ) r
  left join public.categories c on c.id = r.category_id;

  return jsonb_build_object(
    'total', v_total,
    'reports', v_reports
  );
end;
$$;

comment on function public.get_public_profile(text) is
  'Leitura publica e segura do perfil civico pelo username. Nao expoe telefones, dados sensiveis nem broncas anonimas.';

