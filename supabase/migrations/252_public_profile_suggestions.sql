-- Descoberta de perfis públicos. Prioriza pessoas da cidade escolhida, perfis
-- verificados e participação real, sem sugerir a própria conta ou quem ela já
-- acompanha.
create or replace function public.get_suggested_public_profiles(
  p_city_id bigint default null,
  p_limit integer default 6
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', suggestion.id,
    'name', suggestion.name,
    'username', suggestion.username,
    'avatar_type', suggestion.avatar_type,
    'avatar_url', suggestion.avatar_url,
    'avatar_config', suggestion.avatar_config,
    'public_bio', suggestion.public_bio,
    'public_profile_type', suggestion.public_profile_type,
    'verification_status', suggestion.verification_status,
    'city_name', suggestion.city_name,
    'reports_count', suggestion.reports_count,
    'followers_count', suggestion.followers_count
  ) order by suggestion.same_city desc, suggestion.is_verified desc,
             suggestion.reports_count desc, suggestion.followers_count desc,
             suggestion.name), '[]'::jsonb)
  from (
    select p.id, p.name, p.username, p.avatar_type, p.avatar_url,
           p.avatar_config, p.public_bio, p.public_profile_type,
           p.verification_status, c.name as city_name,
           (p_city_id is not null and p.city_id = p_city_id) as same_city,
           (p.verification_status = 'verified') as is_verified,
           count(distinct r.id) filter (
             where r.moderation_status = 'approved'
               and r.status <> 'rejected'
               and coalesce(r.is_anonymous, false) = false
           )::integer as reports_count,
           count(distinct f.follower_id)::integer as followers_count
    from public.profiles p
    left join public.cities c on c.id = p.city_id
    left join public.reports r on r.author_id = p.id
    left join public.profile_follows f on f.followed_id = p.id
    where p.public_profile_enabled = true
      and p.username_normalized is not null
      and coalesce(p.public_searchable, true) = true
      and (auth.uid() is null or p.id <> auth.uid())
      and not exists (
        select 1 from public.profile_follows mine
        where mine.follower_id = auth.uid() and mine.followed_id = p.id
      )
    group by p.id, c.name
    order by same_city desc, is_verified desc, reports_count desc,
             followers_count desc, p.name
    limit least(greatest(coalesce(p_limit, 6), 1), 12)
  ) suggestion;
$$;

grant execute on function public.get_suggested_public_profiles(bigint, integer) to anon, authenticated;
comment on function public.get_suggested_public_profiles(bigint, integer) is
  'Perfis públicos relevantes que a conta atual ainda não segue.';

notify pgrst, 'reload schema';
