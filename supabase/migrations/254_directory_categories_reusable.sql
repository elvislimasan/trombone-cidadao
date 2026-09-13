-- Categorias do Guia podem ser reutilizadas por locais de qualquer cidade.
-- `city_id` permanece apenas para categorias legadas e para categorias criadas
-- por embaixadores locais; categorias globais usam NULL.
alter table public.directory_categories alter column city_id drop not null;

create unique index if not exists directory_categories_global_root_name_idx
  on public.directory_categories (lower(name))
  where city_id is null and parent_id is null;

create unique index if not exists directory_categories_global_child_name_idx
  on public.directory_categories (parent_id, lower(name))
  where city_id is null and parent_id is not null;

create or replace function public.validate_directory_category_city()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.directory_categories parent
    where parent.id = new.parent_id and parent.parent_id is null
  ) then
    raise exception 'Selecione uma categoria principal válida';
  end if;
  return new;
end;
$fn$;

create or replace function public.validate_directory_item_category_city()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.category_id is not null and not exists (
    select 1 from public.directory_categories category
    where category.id = new.category_id and category.active = true
  ) then
    raise exception 'Selecione uma categoria ativa do Guia';
  end if;
  return new;
end;
$fn$;

notify pgrst, 'reload schema';
