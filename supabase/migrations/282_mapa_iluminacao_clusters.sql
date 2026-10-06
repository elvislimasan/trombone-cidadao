-- Agrega todos os postes da area visivel antes de devolver os marcadores.
-- O tamanho da celula vem da viewport, mantendo a resposta pequena sem
-- descartar bairros por causa do limite de linhas do PostgREST.
create index if not exists poles_city_lat_lng_idx
  on public.poles(city_id, latitude, longitude)
  where latitude is not null and longitude is not null;

create or replace function public.municipal_lighting_map_clusters(
  p_city_id bigint,
  p_south double precision,
  p_north double precision,
  p_west double precision,
  p_east double precision,
  p_cell_lat double precision,
  p_cell_lng double precision,
  p_status text default 'all',
  p_street text default '',
  p_include_removed boolean default false
)
returns table (
  item_count bigint,
  cluster_lat double precision,
  cluster_lng double precision,
  south double precision,
  north double precision,
  west double precision,
  east double precision,
  aceso_count bigint,
  apagado_count bigint,
  manutencao_count bigint,
  removido_count bigint,
  pole jsonb
)
language plpgsql stable security invoker
set search_path = public, pg_temp
as $$
begin
  if p_city_id is null or p_south is null or p_north is null
    or p_west is null or p_east is null or p_cell_lat is null or p_cell_lng is null
    or p_south >= p_north or p_west >= p_east
    or p_south < -90 or p_north > 90 or p_west < -180 or p_east > 180
    or p_cell_lat <= 0 or p_cell_lng <= 0
    or (p_north - p_south) / p_cell_lat > 100
    or (p_east - p_west) / p_cell_lng > 100
    or p_status not in ('all', 'aceso', 'apagado', 'manutencao', 'removido') then
    raise exception 'Parametros invalidos para o mapa de iluminacao' using errcode = '22023';
  end if;

  return query
  with filtered as (
    select p.id, p.identifier, p.plate, p.address, p.latitude, p.longitude,
      p.lamp_type, p.lamp_power_w, p.lighting_status, p.is_broken, p.updated_at,
      case
        when p.lighting_status in ('removido', 'manutencao') then p.lighting_status
        when p.is_broken or p.lighting_status = 'apagado' then 'apagado'
        else 'aceso'
      end as display_status
    from public.poles p
    where p.city_id = p_city_id
      and p.latitude between p_south and p_north
      and p.longitude between p_west and p_east
      and (p_include_removed or p_status = 'removido' or p.lighting_status <> 'removido')
      and (
        p_status = 'all'
        or (p_status = 'apagado' and p.lighting_status not in ('removido', 'manutencao')
            and (p.lighting_status = 'apagado' or p.is_broken))
        or (p_status = 'aceso' and p.lighting_status in ('aceso', 'nao_informado')
            and p.is_broken is distinct from true)
        or (p_status in ('manutencao', 'removido') and p.lighting_status = p_status)
      )
      and (nullif(btrim(p_street), '') is null
        or position(lower(btrim(p_street)) in lower(coalesce(p.address, ''))) > 0)
  ), grouped as (
    select floor((f.latitude - p_south) / p_cell_lat) as grid_y,
      floor((f.longitude - p_west) / p_cell_lng) as grid_x,
      count(*) as n, avg(f.latitude) as lat, avg(f.longitude) as lng,
      min(f.latitude) as min_lat, max(f.latitude) as max_lat,
      min(f.longitude) as min_lng, max(f.longitude) as max_lng,
      count(*) filter (where f.display_status = 'aceso') as on_count,
      count(*) filter (where f.display_status = 'apagado') as off_count,
      count(*) filter (where f.display_status = 'manutencao') as repair_count,
      count(*) filter (where f.display_status = 'removido') as removed_count,
      min(f.id) as first_id
    from filtered f
    group by 1, 2
  )
  select g.n, g.lat, g.lng, g.min_lat, g.max_lat, g.min_lng, g.max_lng,
    g.on_count, g.off_count, g.repair_count, g.removed_count,
    case when g.n = 1 then to_jsonb(f) - 'display_status' else null end
  from grouped g
  left join filtered f on g.n = 1 and f.id = g.first_id;
end;
$$;

revoke all on function public.municipal_lighting_map_clusters(
  bigint,double precision,double precision,double precision,double precision,
  double precision,double precision,text,text,boolean
) from public, anon;
grant execute on function public.municipal_lighting_map_clusters(
  bigint,double precision,double precision,double precision,double precision,
  double precision,double precision,text,text,boolean
) to authenticated;
