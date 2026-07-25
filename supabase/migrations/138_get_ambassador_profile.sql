-- 138_get_ambassador_profile.sql
-- RPC segura para a tela de perfil do embaixador (/admin/embaixador/:id).
-- Só gestor (master/admin) pode chamar. Retorna dados de contato reunindo
-- auth.users (email + telefone no metadata) e public.profiles (nome/cidade/avatar),
-- além das cidades onde a pessoa é embaixadora.

create or replace function public.get_ambassador_profile(p_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_is_gestor boolean;
  v_result jsonb;
begin
  v_is_gestor :=
    public.is_master(auth.uid())
    or coalesce((select is_admin from public.profiles where id = auth.uid() limit 1), false);
  if not v_is_gestor then
    raise exception 'not_authorized';
  end if;

  select jsonb_build_object(
    'user_id',    u.id,
    'email',      u.email,
    'phone',      coalesce(u.raw_user_meta_data->>'phone', u.phone),
    'name',       coalesce(p.name, u.raw_user_meta_data->>'name'),
    'avatar_url', p.avatar_url,
    'city',       p.city,
    'created_at', u.created_at,
    'cities', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'ac_id',   ac.id,
        'city_id', ac.city_id,
        'city',    c.name,
        'uf',      st.uf,
        'status',  ac.status,
        'since',   ac.created_at
      ) order by ac.created_at desc), '[]'::jsonb)
      from public.ambassador_cities ac
      join public.cities c on c.id = ac.city_id
      left join public.states st on st.id = c.state_id
      where ac.user_id = p_user
    ),
    'reports_moderated', (
      select count(*)
      from public.reports r
      where r.city_id in (
        select ac.city_id from public.ambassador_cities ac
        where ac.user_id = p_user and ac.status = 'active'
      )
      and r.moderation_status = 'approved'
    )
  )
  into v_result
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = p_user;

  if v_result is null then
    raise exception 'ambassador_not_found';
  end if;

  return v_result;
end;
$$;

grant execute on function public.get_ambassador_profile(uuid) to authenticated;

notify pgrst, 'reload schema';
