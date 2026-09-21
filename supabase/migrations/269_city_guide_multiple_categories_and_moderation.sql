begin;

alter table public.directory add column if not exists category_ids uuid[] not null default '{}';
update public.directory set category_ids = array[category_id]
where category_id is not null and cardinality(category_ids) = 0;
create index if not exists directory_category_ids_idx on public.directory using gin(category_ids);

create or replace function public.normalize_directory_categories()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  -- Preserve compatibility with clients that only send the primary category.
  if tg_op = 'UPDATE' and new.category_ids is not distinct from old.category_ids
     and new.category_id is distinct from old.category_id then
    new.category_ids := array_remove(new.category_ids, old.category_id);
    if new.category_id is not null then
      new.category_ids := array_prepend(new.category_id, new.category_ids);
    end if;
  end if;
  if cardinality(new.category_ids) = 0 and new.category_id is not null then
    new.category_ids := array[new.category_id];
  end if;
  if exists (
    select 1 from unnest(new.category_ids) selected(category_id)
    where not exists (select 1 from public.directory_categories c where c.id = selected.category_id and c.active)
  ) then raise exception 'Selecione categorias ativas do Guia'; end if;
  new.category_id := new.category_ids[1];
  return new;
end;
$$;
create trigger a_directory_normalize_categories
before insert or update of category_id, category_ids on public.directory
for each row execute function public.normalize_directory_categories();

create or replace function public.prevent_directory_category_delete_in_use()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if exists (select 1 from public.directory_categories where parent_id = old.id) then
    raise exception 'Mova ou remova as subcategorias antes de excluir esta categoria';
  end if;
  if exists (select 1 from public.directory where category_id = old.id or old.id = any(category_ids)) then
    raise exception 'Mova ou remova os locais antes de excluir esta categoria';
  end if;
  return old;
end;
$$;

-- The profile's home city never grants moderation authority.
create or replace function public.moderate_directory_submission()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if auth.uid() is not null and not coalesce(
    (public.is_admin(auth.uid()) or public.is_master(auth.uid())
      or public.is_ambassador_of(auth.uid(), new.city_id))
    and public.can_write(auth.uid(), 'services'), false
  ) then
    new.status := 'pending';
    new.submitted_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger directory_submission_moderation
before insert on public.directory
for each row execute function public.moderate_directory_submission();

drop policy if exists "Users can submit to directory." on public.directory;
create policy "Users can submit to directory." on public.directory
for insert to authenticated
with check (submitted_by = auth.uid() and status = 'pending' and city_id is not null);

drop policy if exists directory_moderation_read on public.directory;
create policy directory_moderation_read on public.directory
for select to authenticated using (
  (public.is_admin(auth.uid()) or public.is_master(auth.uid())
    or public.is_ambassador_of(auth.uid(), city_id))
  and public.can_write(auth.uid(), 'services')
);

notify pgrst, 'reload schema';
commit;
