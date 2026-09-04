-- Local exato opcional dos acontecimentos exibidos no Radar da cidade.
-- As areas continuam definindo o alcance e as notificacoes; a coordenada serve
-- apenas para mostrar onde o fato esta acontecendo no mapa.

alter table public.city_events
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_label text;

alter table public.city_events
  drop constraint if exists city_events_coordenadas_validas;

alter table public.city_events
  add constraint city_events_coordenadas_validas check (
    (latitude is null and longitude is null)
    or
    (latitude between -90 and 90 and longitude between -180 and 180)
  );

comment on column public.city_events.latitude is
  'Latitude opcional do ponto exato mostrado no mapa do Radar.';
comment on column public.city_events.longitude is
  'Longitude opcional do ponto exato mostrado no mapa do Radar.';
comment on column public.city_events.location_label is
  'Nome do local ou endereco exibido junto ao ponto no mapa.';

notify pgrst, 'reload schema';
