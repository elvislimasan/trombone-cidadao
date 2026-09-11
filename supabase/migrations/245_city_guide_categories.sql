-- Categorias livres e subcategorias para o Guia da Cidade: comércio, igrejas,
-- órgãos, associações e qualquer novo tipo entram no mesmo modelo.
create table if not exists public.directory_categories (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id) on delete cascade,
  parent_id uuid references public.directory_categories(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists directory_categories_root_name_idx
  on public.directory_categories (city_id, lower(name)) where parent_id is null;
create unique index if not exists directory_categories_child_name_idx
  on public.directory_categories (city_id, parent_id, lower(name)) where parent_id is not null;

alter table public.directory
  add column if not exists category_id uuid references public.directory_categories(id) on delete set null;
create index if not exists directory_category_idx on public.directory(category_id);

create or replace function public.validate_directory_category_city()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.parent_id is not null and not exists (
    select 1 from public.directory_categories parent
    where parent.id = new.parent_id and parent.city_id = new.city_id and parent.parent_id is null
  ) then
    raise exception 'A categoria principal precisa pertencer à mesma cidade';
  end if;
  return new;
end;
$fn$;

drop trigger if exists directory_category_same_city on public.directory_categories;
create trigger directory_category_same_city
before insert or update of city_id, parent_id on public.directory_categories
for each row execute function public.validate_directory_category_city();

create or replace function public.validate_directory_item_category_city()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $fn$
begin
  if new.category_id is not null and not exists (
    select 1 from public.directory_categories category
    where category.id = new.category_id and category.city_id = new.city_id
  ) then
    raise exception 'A categoria do local precisa pertencer à mesma cidade';
  end if;
  return new;
end;
$fn$;

drop trigger if exists directory_item_category_same_city on public.directory;
create trigger directory_item_category_same_city
before insert or update of city_id, category_id on public.directory
for each row execute function public.validate_directory_item_category_city();

alter table public.directory_categories enable row level security;
grant select on public.directory_categories to anon, authenticated;
grant insert, update, delete on public.directory_categories to authenticated;
drop policy if exists directory_categories_public_read on public.directory_categories;
create policy directory_categories_public_read on public.directory_categories
  for select using (active = true or coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false));

drop policy if exists directory_categories_managers_insert on public.directory_categories;
create policy directory_categories_managers_insert on public.directory_categories
  for insert to authenticated with check (
    coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
    or (public.is_ambassador_of(auth.uid(), city_id) and public.can_write(auth.uid(), 'services'))
  );
drop policy if exists directory_categories_managers_update on public.directory_categories;
create policy directory_categories_managers_update on public.directory_categories
  for update to authenticated using (
    coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
    or (public.is_ambassador_of(auth.uid(), city_id) and public.can_write(auth.uid(), 'services'))
  ) with check (
    coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
    or (public.is_ambassador_of(auth.uid(), city_id) and public.can_write(auth.uid(), 'services'))
  );
drop policy if exists directory_categories_managers_delete on public.directory_categories;
create policy directory_categories_managers_delete on public.directory_categories
  for delete to authenticated using (
    coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
    or (public.is_ambassador_of(auth.uid(), city_id) and public.can_write(auth.uid(), 'services'))
  );

notify pgrst, 'reload schema';
