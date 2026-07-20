# Clustering espacial no servidor para escala nacional do mapa

## Problema

`MapPage.jsx` busca reports do Supabase com `.limit(500)` fixo, ordenado por `created_at desc`, e filtra por bounds/busca **no client**, sobre os 500 já baixados. `MapView.jsx` já faz clustering visual, mas também client-side, em grade fixa (`clusterSize = 0.003`), operando sobre os mesmos 500 registros.

Isso funciona hoje (app mono-cidade, poucas centenas de broncas), mas quebra na nacionalização: dando zoom out para ver o Brasil inteiro, o app mostraria só as 500 broncas mais recentes do país inteiro, ignorando o resto — nunca refletindo o volume real (ex: 17.000 broncas).

## Contexto de schema confirmado

- `public.reports.location` é `geometry(Point, 4326)` (WGS84, mesmo sistema do Leaflet/GPS).
- Padrão de RPC espacial já existe no projeto: `public.nearest_poles(lat, lng, radius_m, max_results)` em `supabase/migrations/084_create_poles_and_lighting_linkage.sql` — usa `extensions.st_*`, `language sql stable`, sanitização de parâmetros via `greatest/least`, e `grant execute ... to anon, authenticated`.
- Plano de nacionalização (`PLANO_NACIONALIZACAO.md`, memória `project-nationalization-plan`) já introduz `city_id` em `reports` — mas este design não depende disso: o RPC agrega diretamente por coordenadas dentro dos bounds recebidos, independente de cidade.

## Arquitetura

### RPC `public.reports_map_clusters`

```sql
create or replace function public.reports_map_clusters(
  min_lat double precision,
  max_lat double precision,
  min_lng double precision,
  max_lng double precision,
  zoom integer,
  status_filter text default 'active',   -- 'active' | 'pending' | 'in-progress' | 'resolved'
  category_filter text default null       -- null = todas
)
returns table (
  is_cluster boolean,
  cluster_lat double precision,
  cluster_lng double precision,
  count integer,
  report_ids bigint[]   -- ids agregados (cluster) OU array de 1 elemento (pin individual)
)
language sql stable as $$
  ...
$$;
```

- **Zoom >= limiar configurável (constante `INDIVIDUAL_ZOOM_THRESHOLD`, inicial 13, ajustável após testes com dados reais):** retorna uma linha por report dentro do envelope, com `is_cluster = false` e `report_ids = array[r.id]`.
- **Zoom < limiar:** agrupa por grade cujo tamanho de célula diminui com o zoom (`cell_size_deg = 360.0 / (256 * power(2, zoom))`, o mesmo princípio de slippy-map tiling), retornando `is_cluster = true`, centróide médio da célula, `count`, e `report_ids` de todos os membros (para permitir ao client montar os detalhes/preview sem nova query, e para o `fitBounds` ao expandir).
- Envelope: `ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)`, filtro via `location && envelope` (usa índice GIST) + `ST_Within` para exatidão nas bordas.
- Filtros existentes (`status`, `category_id`, `moderation_status = 'approved'`, `status != 'duplicate'`) replicados dentro do RPC.
- Sanitização: clamps de `zoom` (0–20), bounds válidos (`min < max`), `category_filter` contra enum conhecido.
- **Índice:** confirmar se existe `GIST` em `reports.location`; criar em migration se não existir (`create index if not exists reports_location_gist_idx on public.reports using gist (location);`).
- `grant execute on function public.reports_map_clusters(...) to anon, authenticated;`

### Frontend — `MapPage.jsx`

- Remove `.limit(500)` e o filtro client-side por `mapBounds` em `visibleReports` (o servidor já recorta pela viewport).
- `fetchReports` passa a chamar `supabase.rpc('reports_map_clusters', { min_lat, max_lat, min_lng, max_lng, zoom, status_filter: statusFilter, category_filter: categoryFilter === 'all' ? null : categoryFilter })`, disparado em `onBoundsChange` (debounce ~300ms) em vez de rodar uma vez com filtros só de status/categoria.
- Busca de título (`titleSearchTerm`) continua client-side sobre o resultado atual (ou pode virar parâmetro do RPC depois — fora de escopo deste design, YAGNI por ora já que o volume por viewport é pequeno).
- Contagem do rodapé: `sum(clusters.map(c => c.count))` em vez de `visibleReports.length` — reflete o total real mesmo quando agregado.

### Frontend — `MapView.jsx`

- Remove o clustering client-side em grade fixa (`clustered`, `clusterSize`, `buckets`) — os itens recebidos via `reports` prop já vêm prontos como clusters ou pins, decidido pelo servidor.
- Remove o toggle manual "ver agrupado/individual" (`clusterModeEnabled`, `toggleClusterMode`, botão Layers/Grid3X3) — o comportamento agora é 100% automático por zoom, decidido no RPC.
- Mantém `ClusterZoomHandler`/`expandedCluster`/`fitBounds` ao clicar em cluster — o clique dispara `fitBounds` na área do cluster (usando os `report_ids` retornados para buscar os pontos, ou recalculando bounds a partir do centróide+raio estimado), que por sua vez dispara novo `moveend`/`zoomend` → nova chamada ao RPC com bounds menores e zoom maior, revelando sub-clusters ou pins.
- Ícone de cluster (`createClusterIcon`) reaproveitado sem mudança.

## Fora de escopo (YAGNI por agora)

- Filtro de busca por título no servidor (permanece client-side).
- Ajuste fino do limiar de zoom além do valor inicial — fica como constante fácil de tunar.
- Paginação dentro de um cluster individual gigante (ex: um bairro com 5.000 broncas no mesmo pixel) — se necessário, tratar depois com um cap de `count` exibido como "500+".