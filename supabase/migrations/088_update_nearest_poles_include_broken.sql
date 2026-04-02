drop function if exists public.nearest_poles(double precision, double precision, integer, integer);

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
  )
  select
    p.id as pole_id,
    p.identifier,
    p.plate,
    p.address,
    p.latitude,
    p.longitude,
    p.is_broken,
    round(extensions.st_distance(p.geom, params.user_geog))::integer as distance_m
  from public.poles p
  cross join params
  where extensions.st_dwithin(p.geom, params.user_geog, params.radius_m_sanitized)
  order by extensions.st_distance(p.geom, params.user_geog) asc
  limit (select max_results_sanitized from params);
$$;

grant execute on function public.nearest_poles(double precision, double precision, integer, integer) to anon, authenticated;
