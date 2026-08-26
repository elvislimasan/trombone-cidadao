-- Conteudo historico e pagina publica propria para cada rua mapeada.

alter table public.pavement_streets
  add column if not exists honoree_name text,
  add column if not exists biography text,
  add column if not exists curiosities text,
  add column if not exists historical_documents jsonb not null default '[]'::jsonb,
  add column if not exists historical_photos jsonb not null default '[]'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'pavement_streets_historical_documents_array'
  ) then
    alter table public.pavement_streets
      add constraint pavement_streets_historical_documents_array
      check (jsonb_typeof(historical_documents) = 'array');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'pavement_streets_historical_photos_array'
  ) then
    alter table public.pavement_streets
      add constraint pavement_streets_historical_photos_array
      check (jsonb_typeof(historical_photos) = 'array');
  end if;
end $$;

comment on column public.pavement_streets.historical_documents is
  'Lista publica [{title,url,description}] com leis e outros documentos da rua.';
comment on column public.pavement_streets.historical_photos is
  'Galeria publica [{url,caption,subject}], subject em honoree ou street.';

notify pgrst, 'reload schema';
