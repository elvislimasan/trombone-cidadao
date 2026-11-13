begin;

-- Ausência de configuração também significa plantio desativado.
create table public.tree_adoption_settings (
  city_id bigint primary key references public.cities(id) on delete cascade,
  planting_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);
alter table public.tree_adoption_settings enable row level security;
grant select on public.tree_adoption_settings to anon, authenticated;
grant insert, update on public.tree_adoption_settings to authenticated;
create policy tree_adoption_settings_read on public.tree_adoption_settings
  for select to anon, authenticated using (true);
create policy tree_adoption_settings_insert on public.tree_adoption_settings
  for insert to authenticated with check (public.can_dispatch_tree_adoption(city_id));
create policy tree_adoption_settings_update on public.tree_adoption_settings
  for update to authenticated using (public.can_dispatch_tree_adoption(city_id))
  with check (public.can_dispatch_tree_adoption(city_id));

create function public.stamp_tree_adoption_settings() returns trigger
language plpgsql set search_path=public,pg_temp as $$
begin
  new.updated_at=now();
  new.updated_by=auth.uid();
  return new;
end $$;
revoke all on function public.stamp_tree_adoption_settings() from public,anon,authenticated;
create trigger tree_adoption_settings_stamp before insert or update on public.tree_adoption_settings
  for each row execute function public.stamp_tree_adoption_settings();

-- Protege também clientes antigos e chamadas diretas ao RPC. Pedidos já
-- recebidos continuam editáveis e o reenvio idempotente continua funcionando.
create function public.check_tree_adoption_planting_enabled() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.request_type='plantio' and not coalesce((
    select planting_enabled from public.tree_adoption_settings where city_id=new.city_id
  ),false) then
    raise exception 'As solicitações de plantio estão desativadas nesta cidade. Você pode solicitar mudas para retirar e plantar.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.check_tree_adoption_planting_enabled() from public,anon,authenticated;
create trigger tree_adoption_planting_enabled before insert on public.tree_adoption_requests
  for each row execute function public.check_tree_adoption_planting_enabled();

commit;
