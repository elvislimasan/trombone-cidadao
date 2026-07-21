-- 126_reports_map_clusters.sql

-- Índice espacial (se ainda não existir) para acelerar o filtro por bounds
create index if not exists reports_location_gist_idx
  on public.reports
  using gist (location);

create or replace function public.reports_map_clusters(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  zoom integer,
  status_filter text default 'active',
  category_filter text default null
)
returns table (
  is_cluster boolean,
  cluster_lat double precision,
  cluster_lng double precision,
  item_count integer,
  report_ids uuid[],
  report jsonb
)
language sql
stable
as $$
  with params as (
    select
      extensions.st_setsrid(
        extensions.st_makeenvelope(
          least(min_lng, max_lng), least(min_lat, max_lat),
          greatest(min_lng, max_lng), greatest(min_lat, max_lat)
        ),
        4326
      ) as envelope,
      greatest(0, least(zoom, 20))::integer as zoom_sanitized,
      case
        when status_filter = 'active' then array['pending', 'in-progress']
        else array[status_filter]
      end as status_list,
      nullif(category_filter, 'all') as category_sanitized
  ),
  filtered as (
    select
      r.id,
      r.title,
      r.description,
      r.status,
      r.created_at,
      r.category_id,
      c.name as category_name,
      r.location,
      extensions.st_y(r.location) as lat,
      extensions.st_x(r.location) as lng,
      (select rm.url from public.report_media rm where rm.report_id = r.id and rm.type = 'photo' limit 1) as cover_image,
      (select count(*)::integer from public.signatures s where s.report_id = r.id) as upvotes
    from public.reports r
    left join public.categories c on c.id = r.category_id
    cross join params
    where r.moderation_status = 'approved'
      and r.status <> 'duplicate'
      and r.status = any(params.status_list)
      and (params.category_sanitized is null or r.category_id = params.category_sanitized)
      and r.location is not null
      and extensions.st_intersects(r.location, params.envelope)
  ),
  -- Zoom >= 13: devolve reports individuais completos, sem agregação
  individual as (
    select
      false as is_cluster,
      f.lat as cluster_lat,
      f.lng as cluster_lng,
      1 as item_count,
      array[f.id] as report_ids,
      jsonb_build_object(
        'id', f.id,
        'title', f.title,
        'description', f.description,
        'status', f.status,
        'created_at', f.created_at,
        'category_id', f.category_id,
        'category_name', f.category_name,
        'cover_image', f.cover_image,
        'upvotes', f.upvotes,
        'lat', f.lat,
        'lng', f.lng
      ) as report
    from filtered f
    cross join params
    where params.zoom_sanitized >= 13
  ),
  -- Zoom < 13: agrupa por grid cujo tamanho diminui conforme o zoom sobe
  grid as (
    select
      f.*,
      floor(f.lat / (360.0 / (256 * power(2, params.zoom_sanitized)))) as cell_lat,
      floor(f.lng / (360.0 / (256 * power(2, params.zoom_sanitized)))) as cell_lng
    from filtered f
    cross join params
    where params.zoom_sanitized < 13
  ),
  clustered as (
    select
      true as is_cluster,
      avg(lat) as cluster_lat,
      avg(lng) as cluster_lng,
      count(*)::integer as item_count,
      array_agg(id) as report_ids,
      null::jsonb as report
    from grid
    group by cell_lat, cell_lng
  )
  select * from individual
  union all
  select * from clustered;
$$;

grant execute on function public.reports_map_clusters(
  double precision, double precision, double precision, double precision,
  integer, text, text
) to anon, authenticated;
