-- A imagem institucional da cidade é reutilizada no perfil público, na home e
-- no Radar. Não é uma foto de um evento: é a identidade visual da cidade.
alter table public.cities
  add column if not exists civic_thumbnail_url text,
  add column if not exists civic_thumbnail_path text;

comment on column public.cities.civic_thumbnail_url is
  'Imagem institucional da cidade exibida na home, perfis públicos e Radar.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('city-media', 'city-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
set public = true, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

create or replace function public.can_manage_city(p_city_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (coalesce(p.is_admin, false) or coalesce(p.is_master, false))
  ) or exists (
    select 1 from public.ambassador_cities ac
    where ac.user_id = auth.uid() and ac.city_id = p_city_id and ac.status = 'active'
  );
$$;

create or replace function public.set_city_civic_thumbnail(
  p_city_id bigint,
  p_url text,
  p_path text default null
)
returns public.cities
language plpgsql
security definer
set search_path = public
as $$
declare v_city public.cities;
begin
  if not public.can_manage_city(p_city_id) then
    raise exception 'Você não pode editar a identidade desta cidade.' using errcode = '42501';
  end if;

  update public.cities
     set civic_thumbnail_url = nullif(btrim(coalesce(p_url, '')), ''),
         civic_thumbnail_path = nullif(btrim(coalesce(p_path, '')), '')
   where id = p_city_id
   returning * into v_city;

  if v_city is null then raise exception 'Cidade não encontrada.'; end if;
  return v_city;
end;
$$;

drop policy if exists "city_media_upload_managed_city" on storage.objects;
create policy "city_media_upload_managed_city"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'city-media'
  and public.can_manage_city((storage.foldername(name))[1]::bigint)
);

drop policy if exists "city_media_update_managed_city" on storage.objects;
create policy "city_media_update_managed_city"
on storage.objects for update to authenticated
using (bucket_id = 'city-media' and public.can_manage_city((storage.foldername(name))[1]::bigint))
with check (bucket_id = 'city-media' and public.can_manage_city((storage.foldername(name))[1]::bigint));

drop policy if exists "city_media_delete_managed_city" on storage.objects;
create policy "city_media_delete_managed_city"
on storage.objects for delete to authenticated
using (bucket_id = 'city-media' and public.can_manage_city((storage.foldername(name))[1]::bigint));

-- O perfil precisa do id para buscar a imagem institucional sem expor nada
-- além da cidade que o próprio perfil escolheu tornar visível.
create or replace function public.get_public_profile(p_username text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_norm text; v_profile public.profiles%rowtype; v_city_name text; v_stats record;
begin
  v_norm := lower(trim(p_username)); if starts_with(v_norm, '@') then v_norm := substring(v_norm from 2); end if;
  select * into v_profile from public.profiles where username_normalized = v_norm limit 1;
  if v_profile is null then return null; end if;
  if not v_profile.public_profile_enabled then return jsonb_build_object('id', v_profile.id, 'username', v_profile.username, 'public_profile_enabled', false); end if;
  if v_profile.public_city_visible and v_profile.city_id is not null then select c.name into v_city_name from public.cities c where c.id = v_profile.city_id; end if;
  select count(*) filter (where r.moderation_status = 'approved' and r.status != 'rejected') as total_reports,
         count(*) filter (where r.moderation_status = 'approved' and r.status = 'resolved') as resolved_reports,
         count(*) filter (where r.moderation_status = 'approved' and r.status = 'in-progress') as in_progress_reports,
         count(distinct r.city_id) filter (where r.moderation_status = 'approved' and r.city_id is not null) as cities_count,
         coalesce(sum((select count(*) from public.upvotes u where u.report_id = r.id)), 0) as total_upvotes_received
    into v_stats from public.reports r where r.author_id = v_profile.id and r.is_anonymous = false;
  return jsonb_build_object('id', v_profile.id, 'name', v_profile.name, 'username', v_profile.username,
    'avatar_type', v_profile.avatar_type, 'avatar_url', v_profile.avatar_url, 'avatar_config', v_profile.avatar_config,
    'public_bio', v_profile.public_bio, 'public_website', v_profile.public_website, 'public_profile_type', v_profile.public_profile_type,
    'public_profile_enabled', true, 'verification_status', v_profile.verification_status, 'verified_at', v_profile.verified_at,
    'created_at', v_profile.created_at, 'city_id', case when v_profile.public_city_visible then v_profile.city_id else null end,
    'city_name', v_city_name, 'stats', jsonb_build_object('total_reports', coalesce(v_stats.total_reports, 0),
    'resolved_reports', coalesce(v_stats.resolved_reports, 0), 'in_progress_reports', coalesce(v_stats.in_progress_reports, 0),
    'cities_count', coalesce(v_stats.cities_count, 0), 'total_upvotes_received', coalesce(v_stats.total_upvotes_received, 0)));
end;
$$;

grant execute on function public.can_manage_city(bigint) to authenticated;
grant execute on function public.set_city_civic_thumbnail(bigint, text, text) to authenticated;
notify pgrst, 'reload schema';
