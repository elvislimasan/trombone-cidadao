-- 166_reports_nearby_feed.sql
--
-- Feed "Perto de mim": lista broncas ativas ordenadas por distancia do ponto
-- informado pelo GPS do usuario.
--
-- Ordena com o operador <-> do PostGIS, que usa o indice GiST criado em
-- 126_reports_map_clusters.sql (reports_location_gist_idx). Sem ele o banco
-- calcularia a distancia de todas as linhas antes de ordenar.
--
-- A distancia volta em metros (st_distance sobre geography) para a UI poder
-- exibir "a 350 m" / "a 2,4 km" no card.

create or replace function public.reports_nearby(
  user_lat double precision,
  user_lng double precision,
  radius_meters double precision default 15000,
  city_filter bigint default null,
  page_size integer default 10,
  page_offset integer default 0
)
returns table (
  id uuid,
  distance_meters double precision
)
language sql
stable
as $$
  with origin as (
    select extensions.st_setsrid(
             extensions.st_makepoint(user_lng, user_lat),
             4326
           ) as pt
  )
  select
    r.id,
    extensions.st_distance(
      r.location::extensions.geography,
      o.pt::extensions.geography
    ) as distance_meters
  from public.reports r
  cross join origin o
  where r.moderation_status = 'approved'
    and r.status <> 'duplicate'
    and r.status in ('pending', 'in-progress')
    and r.location is not null
    and (city_filter is null or r.city_id = city_filter)
    -- Recorte por raio antes da ordenacao: sem isso, "perto de mim" numa base
    -- nacional devolveria broncas a centenas de km quando a regiao tem poucas.
    and extensions.st_dwithin(
          r.location::extensions.geography,
          o.pt::extensions.geography,
          radius_meters
        )
  order by r.location operator(extensions.<->) o.pt
  limit greatest(1, least(page_size, 50))
  offset greatest(0, page_offset);
$$;

grant execute on function public.reports_nearby(
  double precision, double precision, double precision, bigint, integer, integer
) to anon, authenticated;
