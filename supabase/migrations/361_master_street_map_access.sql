begin;

-- Master gerencia ruas e pavimentação em todas as cidades. As demais contas
-- mantêm a exigência de Órgão Público, cargo na cidade e permissão explícita.
create or replace function public.can_write(p_user uuid, p_module text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_user is null then false
    when public.is_master(p_user) then true
    when p_module = 'urban_planning' then
      exists (select 1 from public.profiles p where p.id = p_user and p.user_type = 'public_official')
      and exists (select 1 from public.urban_planner_cities a where a.user_id = p_user)
      and coalesce(
        (select r.allowed from public.permission_rules r
          where r.scope = 'user' and r.user_id = p_user and r.module = p_module limit 1),
        (select r.allowed from public.permission_rules r
          where r.scope = 'role' and r.role_name = 'urban_planner' and r.module = p_module limit 1),
        false)
    else coalesce(
      (select r.allowed from public.permission_rules r
        where r.scope = 'user' and r.user_id = p_user and r.module = p_module limit 1),
      (select r.allowed from public.permission_rules r
        where r.scope = 'role' and r.module = p_module and r.role_name = (
          select case when coalesce(p.is_admin, false) then 'admin'
            when coalesce(p.is_ambassador, false) then 'ambassador' end
          from public.profiles p where p.id = p_user) limit 1),
      true)
  end
$$;

-- Esta função também protege traçados, contornos, anexos e referências do mapa.
create or replace function public.pode_gerenciar_mapa_ruas(p_city_id bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select p_city_id is not null and (
    public.is_master(auth.uid()) or (
      public.can_write(auth.uid(), 'urban_planning') and exists (
        select 1 from public.urban_planner_cities a
          where a.user_id = auth.uid() and a.city_id = p_city_id
      )
    )
  )
$$;

notify pgrst, 'reload schema';
commit;
