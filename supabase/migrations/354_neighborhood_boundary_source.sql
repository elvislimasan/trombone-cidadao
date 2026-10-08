-- Guarda a procedência e as datas da importação sem alterar permissões.
begin;
alter table public.pavement_neighborhood_boundaries
  add column source jsonb not null default '{"provider":"manual"}'::jsonb;
alter table public.pavement_neighborhood_boundaries
  add constraint neighborhood_boundary_source_valid check (
    jsonb_typeof(source) = 'object'
    and source ? 'provider'
    and coalesce(source ->> 'provider' in ('manual', 'osm'), false)
  );
comment on column public.pavement_neighborhood_boundaries.source is
  'Origem do contorno: manual ou osm. OSM inclui tipo/id do objeto, data da sua edição, data da base consultada e data da consulta. modified indica ajustes locais.';
notify pgrst, 'reload schema';
commit;
