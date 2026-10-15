begin;

-- Regra adicional: o tipo Órgão Público é obrigatório para operar o mapa.
-- Não promove contas nem libera permissões existentes automaticamente.
create or replace function public.can_write(p_user uuid, p_module text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_user is null then false
    when p_module = 'urban_planning' then
      exists (select 1 from public.profiles p where p.id = p_user and p.user_type = 'public_official')
      and exists (select 1 from public.urban_planner_cities a where a.user_id = p_user)
      and coalesce(
        (select r.allowed from public.permission_rules r
          where r.scope = 'user' and r.user_id = p_user and r.module = p_module limit 1),
        (select r.allowed from public.permission_rules r
          where r.scope = 'role' and r.role_name = 'urban_planner' and r.module = p_module limit 1),
        false)
    when public.is_master(p_user) then true
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

create or replace function public.set_urban_planner_cities(p_user_id uuid, p_city_ids bigint[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_user_type text;
begin
  if not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'Somente administradores podem atribuir o cargo Planejamento urbano.' using errcode = '42501';
  end if;
  select p.user_type into v_user_type from public.profiles p where p.id = p_user_id for update;
  if not found then raise exception 'Usuário não encontrado.' using errcode = '22023'; end if;
  if coalesce(cardinality(p_city_ids), 0) > 0 and v_user_type is distinct from 'public_official' then
    raise exception 'O cargo Planejamento urbano exige o tipo Órgão Público.' using errcode = '22023';
  end if;
  delete from public.urban_planner_cities where user_id = p_user_id;
  insert into public.urban_planner_cities(user_id, city_id)
    select p_user_id, city_id from unnest(coalesce(p_city_ids, '{}'::bigint[])) city_id group by city_id;
end
$$;

notify pgrst, 'reload schema';
commit;
