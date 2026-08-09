-- Agrupamento so na visao regional: sobe o limite de zoom em que a funcao
-- devolve pins individuais.
--
-- A 168 agrupava abaixo do zoom 17. Na pratica isso agrupava dentro da cidade:
-- com o mapa enquadrando Floresta inteira (zoom 13-14), a tela mostrava 5 ou 6
-- bolhas com numero em vez das broncas - e o mapa deixava de responder "onde
-- estao os problemas", que e o proposito da tela.
--
-- Passa a devolver individuais de 13 em diante, que e o nivel onde a cidade
-- inteira cabe na tela. Abaixo disso (12 ou menos, ja saindo para a regiao) o
-- agrupamento continua, porque ai sao varias cidades e o numero agregado e
-- justamente a informacao util.
--
-- Escolha deliberada em favor de ver tudo: no zoom 13 uma cidade com ~330
-- broncas mostra ~230 pins, o que e denso. Se isso incomodar em cidades
-- grandes, o ajuste e trocar os dois 13 abaixo por 14 ou 15.
--
-- Mantem a assinatura e o retorno da 168 (inclusive as colunas *_bound), entao
-- o cliente nao muda e nao ha necessidade de drop.
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
  report jsonb,
  min_lat_bound double precision,
  max_lat_bound double precision,
  min_lng_bound double precision,
  max_lng_bound double precision
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
  -- Zoom >= 13: reports individuais completos, sem agregacao.
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
      ) as report,
      f.lat as min_lat_bound,
      f.lat as max_lat_bound,
      f.lng as min_lng_bound,
      f.lng as max_lng_bound
    from filtered f
    cross join params
    where params.zoom_sanitized >= 13
  ),
  -- Zoom < 13: agrupa por grid. A celula CRESCE quando o zoom diminui, que e o
  -- que faz o agrupamento ficar mais agressivo em visao ampla.
  --
  -- As duas condicoes (>= 13 aqui e < 13 abaixo) precisam ser complementares:
  -- se divergirem, um mesmo zoom entra nos dois ramos e cada bronca aparece
  -- duas vezes no mapa.
  grid as (
    select
      f.*,
      floor(f.lat / gc.cell_size) as cell_lat,
      floor(f.lng / gc.cell_size) as cell_lng
    from filtered f
    cross join params
    cross join lateral (
      -- Celula em graus por nivel, dobrando a cada zoom que se afasta. So os
      -- niveis <= 12 chegam aqui.
      select case params.zoom_sanitized
        when 12 then 0.0768
        when 11 then 0.1536
        when 10 then 0.3072
        else 0.6144
      end as cell_size
    ) gc
    where params.zoom_sanitized < 13
  ),
  -- Celula com uma bronca so volta como pin individual, nao como "cluster de 1":
  -- a bolha com o numero 1 perderia o icone da categoria e o popup, ficando pior
  -- que o pin normal. O cliente trata count > 1 como agregado.
  clustered as (
    select
      count(*) > 1 as is_cluster,
      case when count(*) > 1 then avg(g.lat) else (array_agg(g.lat))[1] end as cluster_lat,
      case when count(*) > 1 then avg(g.lng) else (array_agg(g.lng))[1] end as cluster_lng,
      count(*)::integer as item_count,
      array_agg(g.id) as report_ids,
      -- Agrega o jsonb inteiro e pega o primeiro, em vez de min() campo a campo:
      -- min() nao existe para uuid, e agregar por campo tambem poderia misturar
      -- valores de linhas diferentes se o grupo tivesse mais de uma.
      case
        when count(*) > 1 then null::jsonb
        else (array_agg(
          jsonb_build_object(
            'id', g.id,
            'title', g.title,
            'description', g.description,
            'status', g.status,
            'created_at', g.created_at,
            'category_id', g.category_id,
            'category_name', g.category_name,
            'cover_image', g.cover_image,
            'upvotes', g.upvotes,
            'lat', g.lat,
            'lng', g.lng
          )
        ))[1]
      end as report,
      min(g.lat) as min_lat_bound,
      max(g.lat) as max_lat_bound,
      min(g.lng) as min_lng_bound,
      max(g.lng) as max_lng_bound
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
