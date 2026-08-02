-- 156_rental_properties_location_geometry.sql
-- rental_properties.location foi criada como `geography(point, 4326)`
-- (migration 148), diferente do padrão do resto do projeto (public_works,
-- pavement_streets, reports usam `geometry`). PostgREST serializa geography
-- como string hex WKB (ex: "0101000020E6100000...") em vez de GeoJSON
-- {type, coordinates}, quebrando o parsing no client (pin não aparecia no
-- mapa, crash ao ler coordinates[1]). Converte para geometry, igual às
-- demais tabelas, preservando os dados existentes.

alter table public.rental_properties
  alter column location type extensions.geometry(point, 4326) using location::extensions.geometry;

notify pgrst, 'reload schema';
