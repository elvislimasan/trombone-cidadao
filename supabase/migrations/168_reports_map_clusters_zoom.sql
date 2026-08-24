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
-- 3. Passa a devolver os limites do cluster (min/max de lat e lng). Sem eles o
--    cliente so tinha o centroide e aplicava zoom fixo ao clicar, mostrando bem
--    menos broncas do que o numero exibido no pin.
--
-- O retorno ganha colunas novas, e `create or replace` nao muda o tipo de saida
-- de uma funcao existente ("nao e possivel mudar o tipo de dados retornado").
-- Por isso o drop antes - a assinatura de ENTRADA continua a mesma, entao a
-- chamada do cliente nao muda.
drop function if exists public.reports_map_clusters(
  double precision, double precision, double precision, double precision,
  integer, text, text
);

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
  -- Extensao real do cluster. Sem isso o cliente so tinha o centroide e dava
  -- zoom fixo (+3) ao clicar: a area encolhia 8x e um cluster de 20 broncas
  -- exibia 2 depois do clique - o numero do pin nao batia com o que aparecia.
  -- Com os limites o mapa enquadra exatamente o conteudo agregado.
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
      ) as report,
      f.lat as min_lat_bound,
      f.lat as max_lat_bound,
      f.lng as min_lng_bound,
      f.lng as max_lng_bound
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
      -- Calibrado com 140 broncas num raio de bairro (o caso real de Floresta):
      -- no zoom 15, que e onde o mapa abre, 0.0032 ainda devolvia 68 pins - a
      -- tela continuava coberta. 0.0096 leva a ~16 pins, na ordem do que o
      -- desenho previa. Cada nivel dobra a celula ao afastar.
      select case params.zoom_sanitized
        when 16 then 0.0048
        when 15 then 0.0096
        when 14 then 0.0192
        when 13 then 0.0384
        when 12 then 0.0768
        when 11 then 0.1536
        when 10 then 0.3072
        else 0.6144
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
