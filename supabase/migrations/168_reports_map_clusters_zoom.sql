-- Agrupamento do mapa: agrupa ate o zoom de rua, nao so em visao regional.
--
-- A 126 so agrupava com zoom < 13. Como o mapa abre em 15 (bairro), na pratica
-- nunca agrupava: uma cidade com 300+ broncas virava 300 pins sobrepostos que
-- escondiam as ruas - o mapa deixava de ser mapa.
--
-- Duas correcoes:
--
-- 1. Limiar sobe de 13 para 17. Abaixo disso agrupa; de 17 em diante (rua, onde
--    os pins ja se separam naturalmente) mostra individual.
--
-- 2. O tamanho da celula estava invertido. Era
--       360 / (256 * 2^zoom)
--    que ENCOLHE conforme o zoom sobe - quanto mais perto, menor a celula e
--    menos agrupava, o oposto do necessario. Passa a ser proporcional a area
--    visivel: uma celula fixa em graus por nivel, calibrada para dar ~6-10 pins
--    por tela em qualquer zoom.
--
-- Mantem a assinatura e o formato de retorno da 126: o cliente nao muda.
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
  -- Zoom >= 17: reports individuais completos, sem agregacao.
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
    where params.zoom_sanitized >= 17
  ),
  -- Zoom < 17: agrupa por grid. A celula CRESCE quando o zoom diminui, que e o
  -- que faz o agrupamento ficar mais agressivo em visao ampla.
  grid as (
    select
      f.*,
      floor(f.lat / gc.cell_size) as cell_lat,
      floor(f.lng / gc.cell_size) as cell_lng
    from filtered f
    cross join params
    cross join lateral (
      select case params.zoom_sanitized
        when 16 then 0.0016
        when 15 then 0.0032
        when 14 then 0.0064
        when 13 then 0.0128
        when 12 then 0.0256
        when 11 then 0.0512
        when 10 then 0.1024
        else 0.2048
      end as cell_size
    ) gc
    where params.zoom_sanitized < 17
  ),
  -- Celula com uma bronca so volta como pin individual, nao como "cluster de 1":
  -- a bolha com o numero 1 perderia o icone da categoria e o popup, ficando pior
  -- que o pin normal. O cliente trata count > 1 como agregado.
  clustered as (
    select
      count(*) > 1 as is_cluster,
      case when count(*) > 1 then avg(g.lat) else min(g.lat) end as cluster_lat,
      case when count(*) > 1 then avg(g.lng) else min(g.lng) end as cluster_lng,
      count(*)::integer as item_count,
      array_agg(g.id) as report_ids,
      case
        when count(*) > 1 then null::jsonb
        else jsonb_build_object(
          'id', min(g.id),
          'title', min(g.title),
          'description', min(g.description),
          'status', min(g.status),
          'created_at', min(g.created_at),
          'category_id', min(g.category_id),
          'category_name', min(g.category_name),
          'cover_image', min(g.cover_image),
          'upvotes', min(g.upvotes),
          'lat', min(g.lat),
          'lng', min(g.lng)
        )
      end as report
    from grid g
    group by g.cell_lat, g.cell_lng
  )
  select * from individual
  union all
  select * from clustered;
$$;

grant execute on function public.reports_map_clusters(
  double precision, double precision, double precision, double precision,
  integer, text, text
) to anon, authenticated;
