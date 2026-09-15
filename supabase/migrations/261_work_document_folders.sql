-- Pastas persistentes e ordem manual para os documentos das obras.
-- As mídias continuam na tabela existente; somente documentos usam estes
-- campos. Pastas vazias precisam de tabela própria para não desaparecerem.

create table if not exists public.public_work_document_folders (
  id uuid primary key default gen_random_uuid(),
  work_id uuid not null references public.public_works(id) on delete cascade,
  measurement_id uuid references public.public_work_measurements(id) on delete cascade,
  parent_id uuid references public.public_work_document_folders(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_document_folder_not_self check (parent_id is null or parent_id <> id)
);

alter table public.public_work_media
  add column if not exists document_folder_id uuid
    references public.public_work_document_folders(id) on delete set null,
  add column if not exists document_order integer not null default 0;

create index if not exists public_work_document_folders_scope_idx
  on public.public_work_document_folders(work_id, measurement_id, parent_id, sort_order);
create index if not exists public_work_media_document_order_idx
  on public.public_work_media(work_id, measurement_id, document_folder_id, document_order);

create or replace function public.validate_work_document_folder()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.measurement_id is not null and not exists (
    select 1 from public.public_work_measurements m
    where m.id = new.measurement_id and m.work_id = new.work_id
  ) then
    raise exception 'A fase não pertence a esta obra';
  end if;

  if new.parent_id is not null and not exists (
    select 1 from public.public_work_document_folders p
    where p.id = new.parent_id
      and p.work_id = new.work_id
      and p.measurement_id is not distinct from new.measurement_id
  ) then
    raise exception 'A pasta pai não pertence à mesma obra e fase';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_work_document_folder_trigger on public.public_work_document_folders;
create trigger validate_work_document_folder_trigger
before insert or update on public.public_work_document_folders
for each row execute function public.validate_work_document_folder();

create or replace function public.validate_work_document_media_folder()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.document_folder_id is not null and not exists (
    select 1 from public.public_work_document_folders f
    where f.id = new.document_folder_id
      and f.work_id = new.work_id
      and f.measurement_id is not distinct from new.measurement_id
  ) then
    raise exception 'A pasta não pertence à mesma obra e fase do documento';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_work_document_media_folder_trigger on public.public_work_media;
create trigger validate_work_document_media_folder_trigger
before insert or update of work_id, measurement_id, document_folder_id on public.public_work_media
for each row execute function public.validate_work_document_media_folder();

alter table public.public_work_document_folders enable row level security;
grant select on public.public_work_document_folders to anon, authenticated;
grant insert, update, delete on public.public_work_document_folders to authenticated;

drop policy if exists work_document_folders_public_read on public.public_work_document_folders;
create policy work_document_folders_public_read
  on public.public_work_document_folders for select using (true);

drop policy if exists work_document_folders_gestor_insert on public.public_work_document_folders;
create policy work_document_folders_gestor_insert
  on public.public_work_document_folders for insert to authenticated with check (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_document_folders.work_id and (
        coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
        or public.is_ambassador_of(auth.uid(), w.city_id)
      )
    )
  );

drop policy if exists work_document_folders_gestor_update on public.public_work_document_folders;
create policy work_document_folders_gestor_update
  on public.public_work_document_folders for update to authenticated
  using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_document_folders.work_id and (
        coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
        or public.is_ambassador_of(auth.uid(), w.city_id)
      )
    )
  ) with check (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_document_folders.work_id and (
        coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
        or public.is_ambassador_of(auth.uid(), w.city_id)
      )
    )
  );

drop policy if exists work_document_folders_gestor_delete on public.public_work_document_folders;
create policy work_document_folders_gestor_delete
  on public.public_work_document_folders for delete to authenticated using (
    exists (
      select 1 from public.public_works w
      where w.id = public_work_document_folders.work_id and (
        coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
        or public.is_ambassador_of(auth.uid(), w.city_id)
      )
    )
  );

notify pgrst, 'reload schema';
