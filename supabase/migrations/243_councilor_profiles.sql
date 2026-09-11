-- Perfis públicos dos vereadores citados nos projetos de denominação de ruas.
-- A rua continua guardando os nomes dentro de historical_documents para não
-- quebrar o acervo; esta tabela acrescenta identidade, foto e apresentação.

create or replace function public.normalized_councilor_name(p_name text)
returns text
language sql
immutable
as $fn$
  select nullif(btrim(regexp_replace(lower(translate(
    btrim(coalesce(p_name, '')),
    'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
    'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
  )), '[^a-z0-9]+', ' ', 'g')), '');
$fn$;

create or replace function public.councilor_slug(p_name text)
returns text
language sql
immutable
as $fn$
  select nullif(btrim(regexp_replace(
    public.normalized_councilor_name(p_name), '[^a-z0-9]+', '-', 'g'
  ), '-'), '');
$fn$;

create table if not exists public.councilors (
  id uuid primary key default gen_random_uuid(),
  city_id bigint not null references public.cities(id) on delete cascade,
  name text not null,
  normalized_name text not null,
  slug text not null,
  photo_url text,
  party text,
  biography text,
  phone text,
  email text,
  instagram_url text,
  user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (city_id, normalized_name),
  unique (city_id, slug)
);

alter table public.councilors enable row level security;

grant select on public.councilors to anon, authenticated;
grant insert, update, delete on public.councilors to authenticated;

drop policy if exists councilors_public_read on public.councilors;
create policy councilors_public_read on public.councilors
  for select using (true);

drop policy if exists councilors_managers_insert on public.councilors;
create policy councilors_managers_insert on public.councilors
  for insert to authenticated
  with check (
    coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
    or (public.is_ambassador_of(auth.uid(), city_id) and public.can_write(auth.uid(), 'pavement'))
  );

drop policy if exists councilors_managers_update on public.councilors;
create policy councilors_managers_update on public.councilors
  for update to authenticated
  using (
    coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
    or (public.is_ambassador_of(auth.uid(), city_id) and public.can_write(auth.uid(), 'pavement'))
  )
  with check (
    coalesce((select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()), false)
    or (public.is_ambassador_of(auth.uid(), city_id) and public.can_write(auth.uid(), 'pavement'))
  );

create or replace function public.sync_councilors_from_street()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_document jsonb;
  v_author jsonb;
  v_authors jsonb;
  v_name text;
  v_normalized text;
  v_slug text;
begin
  if new.city_id is null then return new; end if;

  for v_document in select value from jsonb_array_elements(coalesce(new.historical_documents, '[]'::jsonb)) loop
    if v_document->>'kind' <> 'projeto_lei' then continue; end if;
    v_authors := case
      when jsonb_typeof(v_document->'councilor_authors') = 'array'
        and jsonb_array_length(v_document->'councilor_authors') > 0
        then v_document->'councilor_authors'
      else jsonb_build_array(v_document->>'councilor_author')
    end;

    for v_author in select value from jsonb_array_elements(v_authors) loop
      v_name := btrim(coalesce(v_author #>> '{}', ''));
      v_normalized := public.normalized_councilor_name(v_name);
      v_slug := public.councilor_slug(v_name);
      if v_normalized is null or v_slug is null then continue; end if;

      insert into public.councilors (city_id, name, normalized_name, slug)
      values (new.city_id, v_name, v_normalized, v_slug)
      on conflict (city_id, normalized_name) do update
        set name = excluded.name, updated_at = now();
    end loop;
  end loop;
  return new;
end;
$fn$;

drop trigger if exists pavement_street_councilors_sync on public.pavement_streets;
create trigger pavement_street_councilors_sync
after insert or update of historical_documents, city_id on public.pavement_streets
for each row execute function public.sync_councilors_from_street();

insert into public.councilors (city_id, name, normalized_name, slug)
select distinct
  s.city_id,
  btrim(a.value #>> '{}') as name,
  public.normalized_councilor_name(a.value #>> '{}'),
  public.councilor_slug(a.value #>> '{}')
from public.pavement_streets s
cross join lateral jsonb_array_elements(coalesce(s.historical_documents, '[]'::jsonb)) d(value)
cross join lateral jsonb_array_elements(
  case
    when jsonb_typeof(d.value->'councilor_authors') = 'array'
      and jsonb_array_length(d.value->'councilor_authors') > 0
      then d.value->'councilor_authors'
    else jsonb_build_array(d.value->>'councilor_author')
  end
) a(value)
where s.city_id is not null
  and d.value->>'kind' = 'projeto_lei'
  and public.normalized_councilor_name(a.value #>> '{}') is not null
  and public.councilor_slug(a.value #>> '{}') is not null
on conflict (city_id, normalized_name) do nothing;

-- Corrige cadastros realmente duplicados (por exemplo, nome completo e nome
-- abreviado). Alem de juntar os dados dos perfis, troca a autoria em todas as
-- ruas para que ranking, filtros e pagina publica passem a usar um unico nome.
create or replace function public.merge_councilor_profiles(
  p_source_id uuid,
  p_target_id uuid
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_source public.councilors%rowtype;
  v_target public.councilors%rowtype;
  v_street record;
  v_document jsonb;
  v_author jsonb;
  v_authors jsonb;
  v_new_authors jsonb;
  v_new_documents jsonb;
  v_name text;
  v_name_key text;
  v_document_changed boolean;
  v_street_changed boolean;
  v_updated integer := 0;
  v_allowed boolean;
begin
  if auth.uid() is null then raise exception 'Faça login para unificar vereadores'; end if;
  if p_source_id = p_target_id then raise exception 'Escolha dois vereadores diferentes'; end if;

  select * into v_source from public.councilors where id = p_source_id for update;
  select * into v_target from public.councilors where id = p_target_id for update;
  if v_source.id is null or v_target.id is null then raise exception 'Vereador não encontrado'; end if;
  if v_source.city_id <> v_target.city_id then raise exception 'Os vereadores precisam pertencer à mesma cidade'; end if;

  v_allowed := coalesce((
    select p.is_admin or p.is_master from public.profiles p where p.id = auth.uid()
  ), false) or (
    public.is_ambassador_of(auth.uid(), v_source.city_id)
    and public.can_write(auth.uid(), 'pavement')
  );
  if not v_allowed then raise exception 'Você não tem permissão para unificar vereadores nesta cidade'; end if;

  update public.councilors
  set photo_url = coalesce(nullif(photo_url, ''), nullif(v_source.photo_url, '')),
      party = coalesce(nullif(party, ''), nullif(v_source.party, '')),
      biography = coalesce(nullif(biography, ''), nullif(v_source.biography, '')),
      phone = coalesce(nullif(phone, ''), nullif(v_source.phone, '')),
      email = coalesce(nullif(email, ''), nullif(v_source.email, '')),
      instagram_url = coalesce(nullif(instagram_url, ''), nullif(v_source.instagram_url, '')),
      user_id = coalesce(user_id, v_source.user_id),
      updated_at = now()
  where id = v_target.id;

  for v_street in
    select id, historical_documents
    from public.pavement_streets
    where city_id = v_source.city_id
    for update
  loop
    v_new_documents := '[]'::jsonb;
    v_street_changed := false;

    for v_document in
      select value from jsonb_array_elements(coalesce(v_street.historical_documents, '[]'::jsonb))
    loop
      v_document_changed := false;
      if v_document->>'kind' = 'projeto_lei' then
        v_authors := case
          when jsonb_typeof(v_document->'councilor_authors') = 'array'
            and jsonb_array_length(v_document->'councilor_authors') > 0
            then v_document->'councilor_authors'
          else jsonb_build_array(v_document->>'councilor_author')
        end;
        v_new_authors := '[]'::jsonb;

        for v_author in select value from jsonb_array_elements(v_authors) loop
          v_name := btrim(coalesce(v_author #>> '{}', ''));
          if public.normalized_councilor_name(v_name) = v_source.normalized_name then
            v_name := v_target.name;
            v_document_changed := true;
          end if;
          v_name_key := public.normalized_councilor_name(v_name);
          if v_name_key is not null and not exists (
            select 1
            from jsonb_array_elements_text(v_new_authors) existing(name)
            where public.normalized_councilor_name(existing.name) = v_name_key
          ) then
            v_new_authors := v_new_authors || jsonb_build_array(v_name);
          end if;
        end loop;

        if v_document_changed then
          v_document := jsonb_set(v_document - 'councilor_author', '{councilor_authors}', v_new_authors, true);
          v_street_changed := true;
        end if;
      end if;
      v_new_documents := v_new_documents || jsonb_build_array(v_document);
    end loop;

    if v_street_changed then
      update public.pavement_streets
      set historical_documents = v_new_documents
      where id = v_street.id;
      v_updated := v_updated + 1;
    end if;
  end loop;

  delete from public.councilors where id = v_source.id;
  return v_updated;
end;
$fn$;

grant execute on function public.merge_councilor_profiles(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
