-- Restaura o agrupamento original (individuais desde o zoom 13).
-- Mantem foto/votos apenas para pontos individuais, sem mudar layout ou cliques.
-- Tambem corrige ambientes onde a migracao 257 ja foi aplicada.
create or replace function public.reports_map_clusters(
  min_lat double precision, max_lat double precision,
  min_lng double precision, max_lng double precision,
  zoom integer, status_filter text default 'active', category_filter text default null
)
returns table (
  is_cluster boolean, cluster_lat double precision, cluster_lng double precision,
  item_count integer, report_ids uuid[], report jsonb,
  min_lat_bound double precision, max_lat_bound double precision,
  min_lng_bound double precision, max_lng_bound double precision
)
language sql stable
as $$
  with params as (
    select extensions.st_setsrid(extensions.st_makeenvelope(
      least(min_lng, max_lng), least(min_lat, max_lat),
      greatest(min_lng, max_lng), greatest(min_lat, max_lat)
    ), 4326) as envelope,
    greatest(0, least(zoom, 20))::integer as z,
    nullif(category_filter, 'all') as category
  ),
  filtered as materialized (
    select r.id, r.title, r.description, r.status, r.created_at, r.category_id,
      c.name as category_name,
      extensions.st_y(r.location) as lat, extensions.st_x(r.location) as lng
    from public.reports r
    left join public.categories c on c.id = r.category_id
    cross join params p
    where r.moderation_status = 'approved' and r.status <> 'duplicate'
      and (status_filter = 'all'
        or (status_filter = 'active' and r.status in ('pending', 'in-progress'))
        or r.status = status_filter)
      and (p.category is null or r.category_id = p.category)
      and r.location is not null
      and extensions.st_intersects(r.location, p.envelope)
  ),
  gridded as (
    select f.*, floor(f.lat / s.cell_size) as cell_lat,
      floor(f.lng / s.cell_size) as cell_lng
    from filtered f cross join params p
    cross join lateral (select case p.z
      when 12 then 0.0768 when 11 then 0.1536 when 10 then 0.3072
      else 0.6144 end as cell_size) s
    where p.z < 13
  ),
  grouped as (
    select count(*) > 1 as is_cluster,
      avg(g.lat) as cluster_lat, avg(g.lng) as cluster_lng,
      count(*)::integer as item_count, array_agg(g.id) as report_ids,
      case when count(*) = 1 then (array_agg(g.id))[1] end as detail_id,
      min(g.lat) as min_lat_bound, max(g.lat) as max_lat_bound,
      min(g.lng) as min_lng_bound, max(g.lng) as max_lng_bound
    from gridded g group by g.cell_lat, g.cell_lng
  ),
  output_rows as (
    select false as is_cluster, f.lat as cluster_lat, f.lng as cluster_lng,
      1 as item_count, array[f.id] as report_ids, f.id as detail_id,
      f.lat as min_lat_bound, f.lat as max_lat_bound,
      f.lng as min_lng_bound, f.lng as max_lng_bound
    from filtered f cross join params p where p.z >= 13
    union all
    select g.is_cluster, g.cluster_lat, g.cluster_lng, g.item_count,
      g.report_ids, g.detail_id, g.min_lat_bound, g.max_lat_bound,
      g.min_lng_bound, g.max_lng_bound from grouped g
  )
  select o.is_cluster, o.cluster_lat, o.cluster_lng, o.item_count, o.report_ids,
    case when o.detail_id is null then null::jsonb else jsonb_build_object(
      'id', f.id, 'title', f.title, 'description', f.description,
      'status', f.status, 'created_at', f.created_at,
      'category_id', f.category_id, 'category_name', f.category_name,
      'cover_image', (select rm.url from public.report_media rm where rm.report_id = f.id and rm.type = 'photo' limit 1),
      'upvotes', (select count(*)::integer from public.signatures s where s.report_id = f.id),
      'lat', f.lat, 'lng', f.lng) end as report,
    o.min_lat_bound, o.max_lat_bound, o.min_lng_bound, o.max_lng_bound
  from output_rows o left join filtered f on f.id = o.detail_id;
$$;

grant execute on function public.reports_map_clusters(
  double precision, double precision, double precision, double precision,
  integer, text, text
) to anon, authenticated;
