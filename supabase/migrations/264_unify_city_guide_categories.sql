-- Transportes e pontos turisticos passam a ser categorias do Guia da Cidade.
-- As tabelas antigas permanecem somente para compatibilidade com URLs antigas;
-- novos cadastros e a listagem principal usam public.directory.

alter table public.directory
  add column if not exists description text,
  add column if not exists instagram_url text,
  add column if not exists location extensions.geometry(point, 4326),
  add column if not exists guide_metadata jsonb not null default '{}'::jsonb,
  add column if not exists legacy_source text,
  add column if not exists legacy_source_id text;

create unique index if not exists directory_legacy_source_idx
  on public.directory (legacy_source, legacy_source_id)
  where legacy_source is not null and legacy_source_id is not null;

comment on column public.directory.guide_metadata is
  'Campos especificos preservados durante a migracao de secoes antigas do Guia.';
comment on column public.directory.legacy_source is
  'Tabela de origem do item migrado; nulo para itens criados diretamente no Guia.';

insert into public.directory_categories (city_id, parent_id, name, active, sort_order)
select null, null, 'Transportes', true, 10
where not exists (
  select 1 from public.directory_categories
  where city_id is null and parent_id is null and lower(btrim(name)) = 'transportes'
);

insert into public.directory_categories (city_id, parent_id, name, active, sort_order)
select null, null, 'Pontos turísticos', true, 20
where not exists (
  select 1 from public.directory_categories
  where city_id is null and parent_id is null and lower(btrim(name)) = 'pontos turísticos'
);

-- O JSON guarda todos os campos especializados (destino, horario, tipo de
-- veiculo etc.) mesmo que o formulario unificado ainda nao os exiba.
insert into public.directory (
  name,
  description,
  address,
  phone,
  instagram_url,
  image_url,
  type,
  status,
  city_id,
  category_id,
  views,
  guide_metadata,
  legacy_source,
  legacy_source_id
)
select
  t.name,
  nullif(btrim(t.details), ''),
  coalesce(nullif(btrim(t.details), ''), ''),
  coalesce(t.phone, ''),
  nullif(btrim(t.instagram), ''),
  coalesce(t.image_url, ''),
  'commerce',
  'approved',
  t.city_id,
  (
    select c.id from public.directory_categories c
    where c.city_id is null and c.parent_id is null and lower(btrim(c.name)) = 'transportes'
    limit 1
  ),
  coalesce(t.views, 0),
  jsonb_strip_nulls(to_jsonb(t) - 'id' - 'name' - 'city_id' - 'phone' - 'image_url' - 'views'),
  'transport',
  t.id::text
from public.transport t
where t.city_id is not null
on conflict (legacy_source, legacy_source_id)
  where legacy_source is not null and legacy_source_id is not null
do nothing;

insert into public.directory (
  name,
  description,
  address,
  phone,
  image_url,
  type,
  status,
  city_id,
  category_id,
  location,
  views,
  guide_metadata,
  legacy_source,
  legacy_source_id
)
select
  s.name,
  coalesce(nullif(btrim(s.long_description), ''), nullif(btrim(s.short_description), '')),
  coalesce(s.address, ''),
  coalesce(s.phone, ''),
  coalesce(s.image_url, ''),
  'commerce',
  'approved',
  s.city_id,
  (
    select c.id from public.directory_categories c
    where c.city_id is null and c.parent_id is null and lower(btrim(c.name)) = 'pontos turísticos'
    limit 1
  ),
  s.location,
  coalesce(s.views, 0),
  jsonb_strip_nulls(to_jsonb(s) - 'id' - 'name' - 'city_id' - 'address' - 'phone' - 'image_url' - 'location' - 'views'),
  'tourist_spots',
  s.id::text
from public.tourist_spots s
where s.city_id is not null
on conflict (legacy_source, legacy_source_id)
  where legacy_source is not null and legacy_source_id is not null
do nothing;

notify pgrst, 'reload schema';
