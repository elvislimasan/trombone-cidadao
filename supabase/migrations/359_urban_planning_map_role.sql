begin;

-- O cargo é concedido por cidade, sem transformar o usuário em administrador.
create table public.urban_planner_cities (
  user_id uuid not null references public.profiles(id) on delete cascade,
  city_id bigint not null references public.cities(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, city_id)
);
create index urban_planner_cities_city_idx on public.urban_planner_cities(city_id);
alter table public.urban_planner_cities enable row level security;
revoke all on public.urban_planner_cities from public, anon, authenticated;
grant select, insert, update, delete on public.urban_planner_cities to authenticated;
create policy urban_planner_cities_read on public.urban_planner_cities for select to authenticated
  using (user_id = auth.uid() or public.is_admin(auth.uid()) or public.is_master(auth.uid()));
create policy urban_planner_cities_admin on public.urban_planner_cities for all to authenticated
  using (public.is_admin(auth.uid()) or public.is_master(auth.uid()))
  with check (public.is_admin(auth.uid()) or public.is_master(auth.uid()));

alter table public.permission_rules drop constraint permission_rules_role_name_check;
alter table public.permission_rules add constraint permission_rules_role_name_check
  check (role_name in ('ambassador', 'admin', 'urban_planner'));
alter table public.permission_rules drop constraint permission_rules_module_check;
alter table public.permission_rules add constraint permission_rules_module_check
  check (module in ('works', 'rentals', 'pavement', 'urban_planning', 'services', 'moderation'));

-- O novo módulo começa bloqueado. Cargo e permissão são concessões separadas.
insert into public.permission_rules(scope, role_name, module, allowed)
values ('role', 'urban_planner', 'urban_planning', false);

create or replace function public.can_write(p_user uuid, p_module text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when p_user is null then false
    when p_module = 'urban_planning' then
      exists (select 1 from public.urban_planner_cities a where a.user_id = p_user)
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

create function public.pode_gerenciar_mapa_ruas(p_city_id bigint)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.can_write(auth.uid(), 'urban_planning') and exists (
    select 1 from public.urban_planner_cities a where a.user_id = auth.uid() and a.city_id = p_city_id
  )
$$;
revoke all on function public.pode_gerenciar_mapa_ruas(bigint) from public, anon;
grant execute on function public.pode_gerenciar_mapa_ruas(bigint) to anon, authenticated;

create function public.set_urban_planner_cities(p_user_id uuid, p_city_ids bigint[])
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not (public.is_admin(auth.uid()) or public.is_master(auth.uid())) then
    raise exception 'Somente administradores podem atribuir o cargo Planejamento urbano.' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = p_user_id for update;
  if not found then raise exception 'Usuário não encontrado.' using errcode = '22023'; end if;
  delete from public.urban_planner_cities where user_id = p_user_id;
  insert into public.urban_planner_cities(user_id, city_id)
    select p_user_id, city_id from unnest(coalesce(p_city_ids, '{}'::bigint[])) city_id group by city_id;
end
$$;
revoke all on function public.set_urban_planner_cities(uuid, bigint[]) from public, anon;
grant execute on function public.set_urban_planner_cities(uuid, bigint[]) to authenticated;

-- A policy permissiva habilita o novo cargo; as restritivas também fecham
-- qualquer policy antiga criada no painel que conceda escrita a outros cargos.
create policy pavement_planning_manage on public.pavement_streets for all to authenticated
  using (public.pode_gerenciar_mapa_ruas(city_id)) with check (public.pode_gerenciar_mapa_ruas(city_id));
create policy pavement_planning_insert_guard on public.pavement_streets as restrictive for insert to anon, authenticated
  with check (public.pode_gerenciar_mapa_ruas(city_id));
create policy pavement_planning_update_guard on public.pavement_streets as restrictive for update to anon, authenticated
  using (public.pode_gerenciar_mapa_ruas(city_id)) with check (public.pode_gerenciar_mapa_ruas(city_id));
create policy pavement_planning_delete_guard on public.pavement_streets as restrictive for delete to anon, authenticated
  using (public.pode_gerenciar_mapa_ruas(city_id));

create function public.pode_gerenciar_contorno_bairro(p_bairro_id uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from public.bairros b where b.id = p_bairro_id
    and public.pode_gerenciar_mapa_ruas(b.city_id))
$$;
revoke all on function public.pode_gerenciar_contorno_bairro(uuid) from public, anon;
grant execute on function public.pode_gerenciar_contorno_bairro(uuid) to anon, authenticated;
create policy neighborhood_planning_manage on public.pavement_neighborhood_boundaries for all to authenticated
  using (public.pode_gerenciar_contorno_bairro(bairro_id)) with check (public.pode_gerenciar_contorno_bairro(bairro_id));
create policy neighborhood_planning_insert_guard on public.pavement_neighborhood_boundaries as restrictive for insert to anon, authenticated
  with check (public.pode_gerenciar_contorno_bairro(bairro_id));
create policy neighborhood_planning_update_guard on public.pavement_neighborhood_boundaries as restrictive for update to anon, authenticated
  using (public.pode_gerenciar_contorno_bairro(bairro_id)) with check (public.pode_gerenciar_contorno_bairro(bairro_id));
create policy neighborhood_planning_delete_guard on public.pavement_neighborhood_boundaries as restrictive for delete to anon, authenticated
  using (public.pode_gerenciar_contorno_bairro(bairro_id));

create policy bairros_planning_insert on public.bairros for insert to authenticated
  with check (public.pode_gerenciar_mapa_ruas(city_id));

-- Anexos de ruas e PDFs de referência permanecem limitados à cidade do cargo.
create function public.pode_gerenciar_anexo_mapa(p_bucket text, p_name text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select public.pode_gerenciar_mapa_ruas(case
    when p_bucket = 'pavement-history' and split_part(p_name, '/', 1) ~ '^[0-9]{1,18}$'
      then split_part(p_name, '/', 1)::bigint
    when p_bucket = 'work-media' and split_part(p_name, '/', 1) = 'pavement-maps'
      and split_part(p_name, '/', 2) ~ '^[0-9]{1,18}$' then split_part(p_name, '/', 2)::bigint
    else null end)
$$;
revoke all on function public.pode_gerenciar_anexo_mapa(text, text) from public, anon;
grant execute on function public.pode_gerenciar_anexo_mapa(text, text) to anon, authenticated;
create policy map_planning_storage_manage on storage.objects for all to authenticated
  using (public.pode_gerenciar_anexo_mapa(bucket_id, name))
  with check (public.pode_gerenciar_anexo_mapa(bucket_id, name));
create policy map_planning_storage_insert_guard on storage.objects as restrictive for insert to anon, authenticated
  with check (case when bucket_id = 'pavement-history' or (bucket_id = 'work-media' and split_part(name, '/', 1) = 'pavement-maps')
    then public.pode_gerenciar_anexo_mapa(bucket_id, name) else true end);
create policy map_planning_storage_update_guard on storage.objects as restrictive for update to anon, authenticated
  using (case when bucket_id = 'pavement-history' or (bucket_id = 'work-media' and split_part(name, '/', 1) = 'pavement-maps')
    then public.pode_gerenciar_anexo_mapa(bucket_id, name) else true end)
  with check (case when bucket_id = 'pavement-history' or (bucket_id = 'work-media' and split_part(name, '/', 1) = 'pavement-maps')
    then public.pode_gerenciar_anexo_mapa(bucket_id, name) else true end);
create policy map_planning_storage_delete_guard on storage.objects as restrictive for delete to anon, authenticated
  using (case when bucket_id = 'pavement-history' or (bucket_id = 'work-media' and split_part(name, '/', 1) = 'pavement-maps')
    then public.pode_gerenciar_anexo_mapa(bucket_id, name) else true end);

-- As colunas de referência são atualizadas sem conceder UPDATE geral em cities.
create function public.salvar_referencias_mapa_ruas(p_city_id bigint, p_map_url text, p_cep_url text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.pode_gerenciar_mapa_ruas(p_city_id) then
    raise exception 'Cargo e permissão Mapa de ruas são necessários nesta cidade.' using errcode = '42501';
  end if;
  update public.cities set pavement_street_map_url = nullif(trim(p_map_url), ''),
    pavement_cep_list_url = nullif(trim(p_cep_url), '') where id = p_city_id;
end
$$;
revoke all on function public.salvar_referencias_mapa_ruas(bigint, text, text) from public, anon;
grant execute on function public.salvar_referencias_mapa_ruas(bigint, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
