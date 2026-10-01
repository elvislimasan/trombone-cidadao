-- Usa o traçado das ruas quando uma via está praticamente sobre o poste e
-- nenhuma outra via nomeada compete com ela. Um cruzamento fica sem sugestão.
create or replace function public.mapped_street_address(
  p_city_id bigint,
  p_lat double precision,
  p_lng double precision
)
returns table (
  street_name text,
  address text,
  distance_m double precision,
  second_distance_m double precision
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with point_location as (
    select extensions.st_setsrid(extensions.st_makepoint(p_lng, p_lat), 4326)::extensions.geography as geog
    where p_city_id is not null and p_lat between -90 and 90 and p_lng between -180 and 180
  ), candidates as (
    select s.name,
      extensions.st_distance(s.path::extensions.geography, point_location.geog) as meters
    from public.pavement_streets s
    cross join point_location
    where s.city_id = p_city_id and s.path is not null
      and nullif(btrim(s.name), '') is not null
      and s.name !~* '(^|[^[:alpha:]])teste([^[:alpha:]]|$)'
      and extensions.st_dwithin(s.path, point_location.geog::extensions.geometry, 0.0005)
      and extensions.st_dwithin(s.path::extensions.geography, point_location.geog, 35)
  ), by_name as (
    select distinct on (name) name, meters
    from candidates order by name, meters
  ), nearest as (
    select name, meters,
      lead(meters) over (order by meters, name) as runner_up,
      row_number() over (order by meters, name) as rank
    from by_name
  )
  select n.name,
    concat_ws(' - ', n.name, c.name, st.name),
    n.meters, n.runner_up
  from nearest n
  join public.cities c on c.id = p_city_id
  join public.states st on st.id = c.state_id
  where n.rank = 1 and n.meters <= 5
    and (n.runner_up is null or n.runner_up - n.meters >= 20)
$$;

create or replace function public.mapped_street_address_for_pole(p_pole_id bigint)
returns table (
  street_name text,
  address text,
  distance_m double precision,
  second_distance_m double precision
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  select street.street_name, street.address, street.distance_m, street.second_distance_m
  from public.poles p
  cross join lateral public.mapped_street_address(p.city_id, p.latitude, p.longitude) street
  where p.id = p_pole_id and coalesce(p.validation_status, 'approved') = 'approved'
$$;

revoke all on function public.mapped_street_address(bigint,double precision,double precision) from public;
revoke all on function public.mapped_street_address_for_pole(bigint) from public;
grant execute on function public.mapped_street_address(bigint,double precision,double precision) to anon, authenticated;
grant execute on function public.mapped_street_address_for_pole(bigint) to anon, authenticated;

-- Atualiza somente os endereços ainda iguais aos gravados automaticamente.
-- Edições com usuário no histórico e correções manuais posteriores prevalecem.
with eligible as materialized (
  select p.id, p.city_id, p.address as old_address, p.identifier,
    p.lamp_power_w, p.lamp_type, p.lighting_status,
    mapped.address as mapped_address
  from public.poles p
  join public.pole_datasets dataset on dataset.id = p.dataset_id
  cross join lateral public.mapped_street_address_for_pole(p.id) mapped
  where p.city_id = 64 and dataset.source ilike '%kmz%'
    and not exists (
      select 1 from public.pole_lighting_changes history
      where history.pole_id = p.id and history.changed_by is not null
    )
    and (
      p.address is null or exists (
        select 1 from public.pole_lighting_changes history
        where history.pole_id = p.id and history.changed_by is null
          and history.address = p.address
      )
    )
    and p.address is distinct from mapped.address
), updated as (
  update public.poles p set address = eligible.mapped_address
  from eligible where p.id = eligible.id and p.address is not distinct from eligible.old_address
  returning p.id, p.address
)
insert into public.pole_lighting_changes (
  pole_id, city_id, pole_number, address, old_power_w, new_power_w,
  old_lamp_type, new_lamp_type, old_status, new_status, action, changed_by
)
select updated.id, eligible.city_id, coalesce(eligible.identifier, updated.id::text), updated.address,
  eligible.lamp_power_w, eligible.lamp_power_w, eligible.lamp_type, eligible.lamp_type,
  eligible.lighting_status, eligible.lighting_status, 'updated', null
from updated join eligible on eligible.id = updated.id;

notify pgrst, 'reload schema';
