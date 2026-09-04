-- Identificacao explicita das vias sem nome oficial e armazenamento dos
-- anexos historicos da pavimentacao.

alter table public.pavement_streets
  add column if not exists is_unnamed boolean not null default false;

-- "Rua Projetada" e a identificacao provisoria usada nos dados atuais para
-- vias que ainda nao receberam um nome oficial. O prefixo evita marcar a Rua
-- Bernardo Menezes Gomes Carvalho, que apenas preserva o nome projetado antigo
-- entre parenteses.
update public.pavement_streets
set is_unnamed = true
where is_unnamed = false
  and name ~* '^\s*Rua\s+Projetada(?:\s|$)';

create index if not exists idx_pavement_streets_city_unnamed
  on public.pavement_streets (city_id)
  where is_unnamed = true;

comment on column public.pavement_streets.is_unnamed is
  'True quando a via ainda nao possui nome oficial; name guarda a identificacao provisoria usada no mapa.';

-- A pagina historica e publica, portanto os objetos podem ser lidos sem
-- sessao. Escrita e remocao continuam restritas a quem pode editar o modulo de
-- pavimentacao e, no caso de embaixador, a cidade registrada no primeiro
-- segmento do caminho: <city_id>/<street_id>/photos|documents/arquivo.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'pavement-history',
  'pavement-history',
  true,
  20971520,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/avif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.oasis.opendocument.text',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pavement_history_select_public on storage.objects;
create policy pavement_history_select_public
  on storage.objects for select
  using (bucket_id = 'pavement-history');

drop policy if exists pavement_history_gestor_insert on storage.objects;
create policy pavement_history_gestor_insert
  on storage.objects for insert
  with check (
    bucket_id = 'pavement-history'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and public.can_write(auth.uid(), 'pavement')
    and (
      public.is_admin(auth.uid())
      or public.is_master(auth.uid())
      or public.is_ambassador_of(
        auth.uid(),
        case
          when split_part(name, '/', 1) ~ '^[0-9]+$'
            then split_part(name, '/', 1)::bigint
          else null
        end
      )
    )
  );

drop policy if exists pavement_history_gestor_update on storage.objects;
create policy pavement_history_gestor_update
  on storage.objects for update
  using (
    bucket_id = 'pavement-history'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and public.can_write(auth.uid(), 'pavement')
    and (
      public.is_admin(auth.uid())
      or public.is_master(auth.uid())
      or public.is_ambassador_of(
        auth.uid(),
        case
          when split_part(name, '/', 1) ~ '^[0-9]+$'
            then split_part(name, '/', 1)::bigint
          else null
        end
      )
    )
  )
  with check (
    bucket_id = 'pavement-history'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and public.can_write(auth.uid(), 'pavement')
    and (
      public.is_admin(auth.uid())
      or public.is_master(auth.uid())
      or public.is_ambassador_of(
        auth.uid(),
        case
          when split_part(name, '/', 1) ~ '^[0-9]+$'
            then split_part(name, '/', 1)::bigint
          else null
        end
      )
    )
  );

drop policy if exists pavement_history_gestor_delete on storage.objects;
create policy pavement_history_gestor_delete
  on storage.objects for delete
  using (
    bucket_id = 'pavement-history'
    and auth.role() = 'authenticated'
    and split_part(name, '/', 1) ~ '^[0-9]+$'
    and public.can_write(auth.uid(), 'pavement')
    and (
      public.is_admin(auth.uid())
      or public.is_master(auth.uid())
      or public.is_ambassador_of(
        auth.uid(),
        case
          when split_part(name, '/', 1) ~ '^[0-9]+$'
            then split_part(name, '/', 1)::bigint
          else null
        end
      )
    )
  );

notify pgrst, 'reload schema';
