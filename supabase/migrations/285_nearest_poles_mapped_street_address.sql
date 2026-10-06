-- A geocodificação reversa encontra o objeto OSM mais próximo, que em um
-- cruzamento pode ter endereço de outra rua. Para os postes importados,
-- preferir o traçado cadastrado da via quando ele está perto e é inequívoco.
create index if not exists pavement_streets_path_gix
  on public.pavement_streets using gist (path);

create or replace function public.nearest_poles(
  lat double precision,
  lng double precision,
  radius_m integer default 60,
  max_results integer default 5
)
returns table (
  pole_id bigint,
  identifier text,
  plate text,
  address text,
  latitude double precision,
  longitude double precision,
  is_broken boolean,
  distance_m integer
)
language sql
stable
as $$
  with params as (
    select
      extensions.st_setsrid(extensions.st_makepoint(lng, lat), 4326)::extensions.geography as user_geog,
      greatest(1, least(radius_m, 5000))::integer as radius_m_sanitized,
      greatest(1, least(max_results, 25))::integer as max_results_sanitized
  ), nearby as materialized (
    select
      p.*,
      round(extensions.st_distance(p.geom, params.user_geog))::integer as distance_m
    from public.poles p
    cross join params
    where extensions.st_dwithin(p.geom, params.user_geog, params.radius_m_sanitized)
      and coalesce(p.validation_status, 'approved') = 'approved'
    order by extensions.st_distance(p.geom, params.user_geog)
    limit (select max_results_sanitized from params)
  )
  select
    p.id as pole_id,
    p.identifier,
    p.plate,
    case
      when road.nearest_m <= 20
        and (road.second_m is null or road.second_m - road.nearest_m >= 8)
      then road.street_name ||
        case when position(' - ' in p.address) > 0
          then substring(p.address from position(' - ' in p.address))
          else ''
        end
      else p.address
    end as address,
    p.latitude,
    p.longitude,
    p.is_broken,
    p.distance_m
  from nearby p
  left join public.pole_datasets dataset on dataset.id = p.dataset_id
  left join lateral (
    with closest as (
      select
        street.name,
        min(extensions.st_distance(street.path::extensions.geography, p.geom)) as meters
      from public.pavement_streets street
      where street.city_id = p.city_id
        and street.path is not null
        and nullif(trim(street.name), '') is not null
        and extensions.st_dwithin(street.path, p.geom::extensions.geometry, 0.0005)
        and extensions.st_dwithin(street.path::extensions.geography, p.geom, 30)
      group by street.name
      order by meters
      limit 2
    )
    select
      (array_agg(name order by meters))[1] as street_name,
      (array_agg(meters order by meters))[1] as nearest_m,
      (array_agg(meters order by meters))[2] as second_m
    from closest
  ) road on coalesce(dataset.source, '') <> 'user_generated'
  order by p.distance_m;
$$;

grant execute on function public.nearest_poles(double precision, double precision, integer, integer)
  to anon, authenticated;

notify pgrst, 'reload schema';
