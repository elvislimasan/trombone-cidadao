begin;

-- Mantém a retirada disponível nas cidades existentes; cada modalidade pode ser pausada.
alter table public.tree_adoption_settings
  add column seedlings_enabled boolean not null default true;

create function public.check_tree_adoption_seedlings_enabled() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.request_type='muda' and not coalesce((
    select seedlings_enabled from public.tree_adoption_settings where city_id=new.city_id
  ),true) then
    raise exception 'As solicitações de mudas estão desativadas nesta cidade.' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.check_tree_adoption_seedlings_enabled() from public,anon,authenticated;
create trigger tree_adoption_seedlings_enabled before insert on public.tree_adoption_requests
  for each row execute function public.check_tree_adoption_seedlings_enabled();

-- O erro não deve sugerir retirada quando essa modalidade também está pausada.
create or replace function public.check_tree_adoption_planting_enabled() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if new.request_type='plantio' and not coalesce((
    select planting_enabled from public.tree_adoption_settings where city_id=new.city_id
  ),false) then
    raise exception 'As solicitações de plantio estão desativadas nesta cidade.' using errcode='23514';
  end if;
  return new;
end $$;

commit;
