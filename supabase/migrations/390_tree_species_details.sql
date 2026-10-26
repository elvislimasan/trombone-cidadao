begin;

alter table public.city_tree_species
  add column aliases text[] not null default '{}' check (cardinality(aliases) <= 30 and length(array_to_string(aliases, ';')) <= 4000),
  add column summary text check (length(summary) <= 5000),
  add column sidewalk_suitability text not null default 'nao_avaliada'
    check (sidewalk_suitability in ('nao_avaliada', 'indicada', 'com_restricoes', 'nao_indicada')),
  add column planting_guidance text check (length(planting_guidance) <= 3000);

-- Preserva a política de gestão por cidade e não concede alteração de city_id.
grant update (common_name, scientific_name, origin, aliases, summary, sidewalk_suitability, planting_guidance)
  on public.city_tree_species to authenticated;

-- O inventário guarda cópias canônicas dos nomes: a mudança no catálogo deve
-- chegar também às árvores vinculadas, inclusive às que já foram removidas.
create function public.sync_tree_species_details() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  update public.city_trees set common_name = new.common_name,
    scientific_name = new.scientific_name, origin = new.origin
  where species_id = new.id and city_id = new.city_id;
  return new;
end $$;
revoke all on function public.sync_tree_species_details() from public, anon, authenticated;
create trigger sync_tree_species_details after update of common_name, scientific_name, origin
  on public.city_tree_species for each row
  when (old.common_name is distinct from new.common_name
    or old.scientific_name is distinct from new.scientific_name or old.origin is distinct from new.origin)
  execute function public.sync_tree_species_details();

-- Cota atômica por usuário; somente a função autenticada pode consumir.
create table public.tree_species_ai_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_date date not null,
  requests integer not null check (requests between 1 and 30),
  primary key (user_id, usage_date)
);
alter table public.tree_species_ai_usage enable row level security;
revoke all on public.tree_species_ai_usage from anon, authenticated;
create function public.consume_tree_species_ai_quota(p_city_id bigint) returns boolean
language plpgsql security definer set search_path = public, pg_temp as $$
declare used integer;
begin
  if auth.uid() is null or not public.pode_gerenciar_arborizacao(p_city_id) then
    raise exception 'Sem permissão para gerenciar as espécies desta cidade.' using errcode = '42501';
  end if;
  insert into public.tree_species_ai_usage as usage(user_id, usage_date, requests)
    values (auth.uid(), (now() at time zone 'America/Fortaleza')::date, 1)
    on conflict (user_id, usage_date) do update set requests = usage.requests + 1
      where usage.requests < 30
    returning requests into used;
  return used is not null;
end $$;
revoke all on function public.consume_tree_species_ai_quota(bigint) from public, anon, authenticated;
grant execute on function public.consume_tree_species_ai_quota(bigint) to authenticated;

notify pgrst, 'reload schema';
commit;
