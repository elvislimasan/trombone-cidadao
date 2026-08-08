# Clustering Espacial no Servidor para o Mapa Nacional — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o fetch fixo (`.limit(500)`, filtro em memória) do mapa por um RPC PostGIS que agrega broncas por grid adaptativo ao zoom, para que o mapa escale ao volume nacional sem travar em 500 registros.

**Architecture:** Novo RPC `public.reports_map_clusters(bounds, zoom, filtros)` no Postgres, chamado a cada mudança de bounds/zoom do Leaflet. Em zoom baixo devolve clusters agregados (centróide + contagem + ids); em zoom alto (>= limiar) devolve reports individuais completos. `MapPage.jsx` chama o RPC em vez de `select` direto; `MapView.jsx` perde o clustering client-side (grid fixa + toggle manual) e passa a renderizar diretamente o que o servidor mandar.

**Tech Stack:** Supabase Postgres + PostGIS (`extensions.st_*`), React, react-leaflet, `supabase-js` `.rpc()`.

## Global Constraints

- `reports.id` é `uuid` (confirmado em `supabase/migrations/012_create_signatures_table.sql:4` e outras FKs) — todo `report_ids`/`ids` no RPC e no frontend deve ser tipado/tratado como `uuid[]`/string, nunca `bigint`.
- `reports.location` é `geometry(Point, 4326)` (WGS84) — confirmado via inspeção direta do schema DEV.
- Seguir o padrão de `public.nearest_poles` (`supabase/migrations/084_create_poles_and_lighting_linkage.sql:126-165`): `language sql stable`, parâmetros sanitizados com `greatest/least`, `grant execute ... to anon, authenticated`.
- Filtros existentes a replicar dentro do RPC: `moderation_status = 'approved'`, `status <> 'duplicate'`, e o mapeamento de `status_filter`: `'active'` → `status in ('pending','in-progress')`, senão `status = status_filter` (ver `src/pages/MapPage.jsx:280-284` antes da mudança).
- `category_filter` é o `category_id` textual (ex: `'iluminacao'`), não um FK numérico — `null`/`'all'` significa sem filtro.
- Numeração de migration: a próxima livre é `126` (última existente é `125_fix_ambassador_invites_insert_policy.sql`).
- **Atualizado após teste manual (2026-07-21):** todo clique em cluster (independente do `count`) dá zoom/aproxima a área via `ClusterZoomHandler`, revelando o próximo nível de agregação ou pins individuais — não abre mais uma lista de títulos no popup. O hook `useClusterDetails` (Task 2) foi removido do repo por ficar sem consumidor após essa mudança; o popup de cluster só mostra contagem + botão "Aproximar".
- **Atualizado após teste manual (2026-07-21), 2ª rodada:** o agrupamento por grid geográfico fixo (célula de tamanho `360/(256·2^zoom)`) foi substituído por agrupamento em fronteiras administrativas reais via `supabase/migrations/128_reports_map_clusters_admin_boundaries.sql`, usando `reports.city_id`/`cities.state_id` (100% dos reports ativos têm `city_id` preenchido). Faixas de zoom: 0–4 = 1 cluster por país; 5–8 = 1 cluster por estado (`state_id`); 9–12 = 1 cluster por cidade (`city_id`); 13+ = pins individuais (inalterado). Reports sem `city_id`/`state_id` formam seu próprio grupo (via `coalesce(..., 'no-city-'||id)` no `group by`) em vez de colapsar num cluster falso conjunto.

---

## File Structure

- **Create:** `supabase/migrations/126_reports_map_clusters.sql` — define a function `reports_map_clusters` + índice GIST em `reports.location` (se ausente).
- **Modify:** `src/pages/MapPage.jsx` — troca `fetchReports` (select direto) por chamada ao RPC; remove `.limit(500)` e o filtro client-side de bounds em `visibleReports`; ajusta a contagem do rodapé para somar `count` dos itens recebidos; ajusta a busca por título para funcionar só sobre pins individuais.
- **Modify:** `src/components/MapView.jsx` — remove o clustering client-side em grid fixa (`clustered`, `clusterSize`, `buckets`, `createClusterIcon` continua mas alimentado pelos dados do servidor) e o toggle manual de agrupamento (`clusterModeEnabled`, `toggleClusterMode`, botão Layers/Grid3X3); ajusta o popup de cluster para buscar detalhes sob demanda ao clicar.
- **Create:** `src/hooks/useClusterDetails.js` — hook pequeno e isolado que busca os reports completos de um array de ids (usado pelo popup de cluster ao clicar).

---

### Task 1: Migration — função `reports_map_clusters` + índice espacial

**Files:**
- Create: `supabase/migrations/126_reports_map_clusters.sql`

**Interfaces:**
- Produces: RPC Postgres `public.reports_map_clusters(min_lat double precision, max_lat double precision, min_lng double precision, max_lng double precision, zoom integer, status_filter text default 'active', category_filter text default null)` retornando `table(is_cluster boolean, cluster_lat double precision, cluster_lng double precision, item_count integer, report_ids uuid[], report jsonb)` onde `report` é `null` quando `is_cluster = true`, e o JSON completo do report (título, descrição, status, categoria, capa, upvotes, created_at, lat/lng) quando `is_cluster = false`.

- [ ] **Step 1: Escrever a migration completa**

```sql
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
```

- [ ] **Step 2: Aplicar a migration no banco DEV**

Run: `supabase db push`
Expected: saída confirma `126_reports_map_clusters.sql` aplicada sem erros, e lista a função criada.

- [ ] **Step 3: Testar o RPC manualmente com uma query de smoke test**

Run (via SQL editor do Supabase Studio, projeto DEV, ou `psql` pelo pooler IPv4 documentado no projeto):
```sql
-- Zoom baixo (país inteiro) — espera linhas com is_cluster = true
select * from public.reports_map_clusters(-34, 6, -74, -34, 4, 'active', null);

-- Zoom alto (bairro) — espera linhas com is_cluster = false e report preenchido
select * from public.reports_map_clusters(-8.605, -8.595, -38.565, -38.555, 16, 'active', null);
```
Expected: primeira query retorna poucas linhas com `item_count` alto e `report is null`; segunda retorna uma linha por report na área com `report` preenchido (jsonb com `title`, `lat`, `lng`, etc.) e `item_count = 1`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/126_reports_map_clusters.sql
git commit -m "feat(mapa): RPC reports_map_clusters para agregação espacial no servidor"
```

---

### Task 2: Hook `useClusterDetails` — busca detalhes de um cluster ao clicar

**Files:**
- Create: `src/hooks/useClusterDetails.js`

**Interfaces:**
- Consumes: `supabase` client de `@/lib/customSupabaseClient` (já usado em `MapPage.jsx:7`).
- Produces: hook `useClusterDetails()` retornando `{ fetchDetails: (ids: string[]) => Promise<Array<{ id, title, description, status, created_at, category_id, categoryName, coverImage, upvotes, location: { lat, lng } }>>, loading: boolean }`. Esse é o formato de report que `MapView.jsx` já espera hoje em seu prop `reports` (ver `location: { lat, lng }`, `categoryName`, `coverImage`, `upvotes` em `src/pages/MapPage.jsx:294-304` antes da mudança).

- [ ] **Step 1: Escrever o hook**

```js
// src/hooks/useClusterDetails.js
import { useState, useCallback } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

export function useClusterDetails() {
  const [loading, setLoading] = useState(false);

  const fetchDetails = useCallback(async (ids) => {
    if (!ids || ids.length === 0) return [];
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .select(`
          id, title, description, status, created_at,
          category_id, location,
          category:categories(name),
          upvotes:signatures(count),
          report_media(url, type)
        `)
        .in('id', ids);
      if (error) throw error;
      return (data || [])
        .filter(r => r.location)
        .map(r => ({
          ...r,
          location: { lat: r.location.coordinates[1], lng: r.location.coordinates[0] },
          category: r.category_id,
          categoryName: r.category?.name || r.category_id,
          coverImage: (r.report_media || []).find(m => m.type === 'photo')?.url || null,
          upvotes: Number(r.upvotes?.[0]?.count ?? 0),
        }));
    } catch (err) {
      console.error('[useClusterDetails] fetch error:', err);
      return [];
    } finally {
      setLoading(false);
    }
  }, []);

  return { fetchDetails, loading };
}
```

- [ ] **Step 2: Verificar que o hook importa e o projeto builda sem erros**

Run: `npm run build`
Expected: build finaliza sem erros de import/sintaxe relacionados a `useClusterDetails.js`.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useClusterDetails.js
git commit -m "feat(mapa): hook useClusterDetails para buscar reports de um cluster sob demanda"
```

---

### Task 3: `MapPage.jsx` — trocar fetch fixo pelo RPC de clusters

**Files:**
- Modify: `src/pages/MapPage.jsx:129-134` (estado), `src/pages/MapPage.jsx:262-318` (`fetchReports`), `src/pages/MapPage.jsx:363-375` (`visibleReports`), `src/pages/MapPage.jsx:481-490` (rodapé de contagem — texto já ajustado para "N broncas visíveis" em commit anterior)

**Interfaces:**
- Consumes: RPC `reports_map_clusters` da Task 1; `mapBounds` (já existe, populado por `handleBoundsChange` em `src/pages/MapPage.jsx:343-359`).
- Produces: novo estado `mapClusters` (array de `{ isCluster, lat, lng, count, ids, report }`) passado para `MapView` no lugar de `visibleReports`; `totalVisibleCount` (número) usado no rodapé.

- [ ] **Step 1: Substituir o estado `reports`/`mapBounds` fetch por estado de clusters**

Em `src/pages/MapPage.jsx`, localizar (estado atual, linhas 129-134):
```js
  // ── Reports / map ──
  const [reports,     setReports]     = useState([]);
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [mapBounds,   setMapBounds]   = useState(null); // { minLat, maxLat, minLng, maxLng }
  const cancelRef = useRef(false);
```

Substituir por:
```js
  // ── Reports / map ──
  const [mapClusters, setMapClusters] = useState([]); // [{ isCluster, lat, lng, count, ids, report }]
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [mapBounds,   setMapBounds]   = useState(null); // { minLat, maxLat, minLng, maxLng }
  const [mapZoom,     setMapZoom]     = useState(13);
  const cancelRef = useRef(false);
```

- [ ] **Step 2: Substituir `fetchReports` por uma busca via RPC disparada por bounds+zoom**

Localizar o bloco atual (linhas 262-312):
```js
  // ── Fetch reports ──
  const fetchReports = useCallback(async () => {
    cancelRef.current = false;
    setLoading(true);
    try {
      let q = supabase
        .from('reports')
        .select(`
          id, title, description, status, created_at, address,
          category_id, location, pole_number,
          category:categories(name, icon),
          upvotes:signatures(count),
          report_media(url, type)
        `)
        .eq('moderation_status', 'approved')
        .neq('status', 'duplicate')
        .limit(500);

      if (statusFilter === 'active') {
        q = q.in('status', ['pending', 'in-progress']);
      } else {
        q = q.eq('status', statusFilter);
      }

      if (categoryFilter !== 'all') q = q.eq('category_id', categoryFilter);

      q = q.order('created_at', { ascending: false });

      const { data, error } = await q;
      if (error) throw error;
      if (cancelRef.current) return;

      const mapped = (data || [])
        .filter(r => r.location)
        .map(r => ({
          ...r,
          location: { lat: r.location.coordinates[1], lng: r.location.coordinates[0] },
          category:     r.category_id,
          categoryName: r.category?.name || r.category_id,
          coverImage:   (r.report_media || []).find(m => m.type === 'photo')?.url || null,
          upvotes:      Number(r.upvotes?.[0]?.count ?? 0),
          pole_number:  r.pole_number ?? null,
        }));

      setReports(mapped);
    } catch (err) {
      console.error('[MapPage] fetch error:', err);
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [categoryFilter, statusFilter]);

  useEffect(() => {
    cancelRef.current = false;
    fetchReports();
    return () => { cancelRef.current = true; };
  }, [fetchReports]);
```

Substituir por:
```js
  // ── Fetch clusters (RPC espacial) ──
  const fetchClustersTimerRef = useRef(null);

  const fetchClusters = useCallback(async (bounds, zoom) => {
    if (!bounds) return;
    cancelRef.current = false;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('reports_map_clusters', {
        min_lat: bounds.minLat,
        max_lat: bounds.maxLat,
        min_lng: bounds.minLng,
        max_lng: bounds.maxLng,
        zoom: Math.round(zoom),
        status_filter: statusFilter,
        category_filter: categoryFilter === 'all' ? null : categoryFilter,
      });
      if (error) throw error;
      if (cancelRef.current) return;

      const mapped = (data || []).map(row => (
        row.is_cluster
          ? { isCluster: true, lat: row.cluster_lat, lng: row.cluster_lng, count: row.item_count, ids: row.report_ids }
          : {
              isCluster: false,
              lat: row.cluster_lat,
              lng: row.cluster_lng,
              count: 1,
              ids: row.report_ids,
              report: {
                id: row.report.id,
                title: row.report.title,
                description: row.report.description,
                status: row.report.status,
                created_at: row.report.created_at,
                category: row.report.category_id,
                categoryName: row.report.category_name || row.report.category_id,
                coverImage: row.report.cover_image,
                upvotes: row.report.upvotes,
                location: { lat: row.report.lat, lng: row.report.lng },
              },
            }
      ));

      setMapClusters(mapped);
    } catch (err) {
      console.error('[MapPage] fetch clusters error:', err);
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    if (!mapBounds) return;
    clearTimeout(fetchClustersTimerRef.current);
    fetchClustersTimerRef.current = setTimeout(() => {
      fetchClusters(mapBounds, mapZoom);
    }, 300);
    return () => clearTimeout(fetchClustersTimerRef.current);
  }, [mapBounds, mapZoom, fetchClusters]);
```

- [ ] **Step 3: Atualizar `handleBoundsChange` para capturar também o zoom**

Localizar (linhas 343-359):
```js
  const handleBoundsChange = useCallback((bounds) => {
    if (!bounds) return;
    setMapBounds({
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    });

    const center = bounds.getCenter?.();
    if (center) {
      clearTimeout(boundsCityTimerRef.current);
      boundsCityTimerRef.current = setTimeout(() => {
        syncCityFromCoords({ lat: center.lat, lng: center.lng });
      }, 1200);
    }
  }, [syncCityFromCoords]);
```

Substituir por (adiciona captura de zoom; `bounds` continua sendo o `LatLngBounds` do Leaflet, mas agora `MapView` deve passar também o zoom — ver Task 4, Step 1):
```js
  const handleBoundsChange = useCallback((bounds, zoom) => {
    if (!bounds) return;
    setMapBounds({
      minLat: bounds.getSouth(),
      maxLat: bounds.getNorth(),
      minLng: bounds.getWest(),
      maxLng: bounds.getEast(),
    });
    if (Number.isFinite(zoom)) setMapZoom(zoom);

    const center = bounds.getCenter?.();
    if (center) {
      clearTimeout(boundsCityTimerRef.current);
      boundsCityTimerRef.current = setTimeout(() => {
        syncCityFromCoords({ lat: center.lat, lng: center.lng });
      }, 1200);
    }
  }, [syncCityFromCoords]);
```

- [ ] **Step 4: Substituir `visibleReports` (filtro client-side) por `visibleClusters` (só filtro de busca por título sobre pins individuais) e contagem total**

Localizar (linhas 363-375):
```js
  const visibleReports = useMemo(() => {
    let result = reports || [];
    const term = titleSearchTerm.trim().toLowerCase();
    if (term) result = result.filter(r => String(r.title ?? '').toLowerCase().includes(term));
    if (mapBounds) {
      const { minLat, maxLat, minLng, maxLng } = mapBounds;
      result = result.filter(r => {
        const { lat, lng } = r.location || {};
        return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng;
      });
    }
    return result;
  }, [reports, titleSearchTerm, mapBounds]);
```

Substituir por:
```js
  const visibleClusters = useMemo(() => {
    const term = titleSearchTerm.trim().toLowerCase();
    if (!term) return mapClusters;
    // Busca por título só filtra pins individuais — clusters agregados não têm título.
    return mapClusters.filter(item =>
      !item.isCluster && String(item.report?.title ?? '').toLowerCase().includes(term)
    );
  }, [mapClusters, titleSearchTerm]);

  const totalVisibleCount = useMemo(
    () => visibleClusters.reduce((sum, item) => sum + item.count, 0),
    [visibleClusters]
  );
```

- [ ] **Step 5: Atualizar `handleTitleSearch` (usava `reports`, agora precisa usar `mapClusters`)**

Localizar (linhas 377-386):
```js
  const handleTitleSearch = useCallback(() => {
    const next = titleSearchInput.trim();
    setTitleSearchTerm(next);
    if (!next) { setFlyToTarget(null); return; }
    const first = (reports || []).find(r => String(r.title ?? '').toLowerCase().includes(next.toLowerCase()));
    const loc = first?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      setFlyToTarget({ lat: loc.lat, lng: loc.lng, zoom: 18, nonce: Date.now() });
    }
  }, [titleSearchInput, reports]);
```

Substituir por:
```js
  const handleTitleSearch = useCallback(() => {
    const next = titleSearchInput.trim();
    setTitleSearchTerm(next);
    if (!next) { setFlyToTarget(null); return; }
    const first = mapClusters.find(item =>
      !item.isCluster && String(item.report?.title ?? '').toLowerCase().includes(next.toLowerCase())
    );
    const loc = first?.report?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      setFlyToTarget({ lat: loc.lat, lng: loc.lng, zoom: 18, nonce: Date.now() });
    }
  }, [titleSearchInput, mapClusters]);
```

- [ ] **Step 6: Atualizar o JSX que renderiza `MapView` e o rodapé de contagem**

Localizar (linhas 481-500, incluindo o rodapé já ajustado em commit anterior):
```js
      {/* ── Map ── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {loading && <MapLoader />}
        <Suspense fallback={<MapLoader />}>
          <div className="absolute inset-0">
            <MapView
              reports={visibleReports}
              onReportClick={handleReportClick}
              onUpvote={() => {}}
              showLegend={true}
              showModeToggle={true}
              interactive={true}
              flyToTarget={flyToTarget}
              onBoundsChange={handleBoundsChange}
              onRecenter={syncCityFromCoords}
            />
          </div>
        </Suspense>
```

Substituir por:
```js
      {/* ── Map ── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">
        {loading && <MapLoader />}
        <Suspense fallback={<MapLoader />}>
          <div className="absolute inset-0">
            <MapView
              clusters={visibleClusters}
              onReportClick={handleReportClick}
              onUpvote={() => {}}
              showLegend={true}
              showModeToggle={true}
              interactive={true}
              flyToTarget={flyToTarget}
              onBoundsChange={handleBoundsChange}
              onRecenter={syncCityFromCoords}
            />
          </div>
        </Suspense>
```

E localizar o rodapé de contagem (texto já é "broncas visíveis"):
```js
        <span className="text-sm font-semibold text-foreground">
          {loading ? (
            <span className="text-muted-foreground">Carregando…</span>
          ) : (
            `${visibleReports.length} ${visibleReports.length === 1 ? 'bronca visível' : 'broncas visíveis'}`
          )}
        </span>
```

Substituir por:
```js
        <span className="text-sm font-semibold text-foreground">
          {loading ? (
            <span className="text-muted-foreground">Carregando…</span>
          ) : (
            `${totalVisibleCount} ${totalVisibleCount === 1 ? 'bronca visível' : 'broncas visíveis'}`
          )}
        </span>
```

- [ ] **Step 7: Rodar o app localmente e verificar no navegador que o mapa carrega sem erros**

Run: `npm run dev`
Expected: app sobe sem erro; abrir a página do mapa no navegador, abrir o console DevTools e confirmar que não há erros relacionados a `reports is not defined` ou `visibleReports is not defined`. (A Task 4 ainda precisa ajustar `MapView.jsx` para aceitar o novo prop `clusters` — até lá o mapa pode não renderizar pins corretamente; isso é esperado e resolvido na próxima task.)

- [ ] **Step 8: Commit**

```bash
git add src/pages/MapPage.jsx
git commit -m "feat(mapa): buscar broncas via RPC espacial em vez de fetch fixo de 500"
```

---

### Task 4: `MapView.jsx` — remover clustering client-side, consumir clusters do servidor

**Files:**
- Modify: `src/components/MapView.jsx` (props, estado, render, remoção do toggle)

**Interfaces:**
- Consumes: novo hook `useClusterDetails` da Task 2; novo prop `clusters` (array de `{ isCluster, lat, lng, count, ids, report }`) em vez de `reports`.
- Produces: `MapView` continua exportado como default de `src/components/MapView.jsx`, consumido por `src/pages/MapPage.jsx` (Task 3) e por qualquer outro caller existente (ver Step 6 para verificar outros usos).

- [ ] **Step 1: Verificar todos os outros lugares que usam `MapView` além de `MapPage.jsx`**

Run: `grep -rn "MapView" src --include="*.jsx" -l`
Expected: lista de arquivos que importam `MapView`. Cada um precisa ser revisitado no Step 7 se passar a prop `reports` diretamente (precisa migrar para `clusters` ou for adaptado).

- [ ] **Step 2: Trocar a prop `reports` por `clusters` na assinatura do componente**

Localizar (linhas 153-162):
```js
const MapView = ({
  reports,
  onReportClick,
  onUpvote,
  showLegend = true,
  showModeToggle = true,
  flyToTarget,
  interactive = true,
  onBoundsChange,
}) => {
```

Substituir por:
```js
const MapView = ({
  clusters,
  onReportClick,
  onUpvote,
  showLegend = true,
  showModeToggle = true,
  flyToTarget,
  interactive = true,
  onBoundsChange,
}) => {
```

- [ ] **Step 3: Emitir o zoom atual em `MapInstanceBinder`/`onBoundsChange` (Task 3 espera `handleBoundsChange(bounds, zoom)`)**

Localizar (linhas 120-151):
```js
const MapInstanceBinder = ({ onReady, onBoundsChange }) => {
  const map = useMap();
  useEffect(() => {
    onReady?.(map);
    try {
      const t0 = setTimeout(() => map.invalidateSize?.(), 0);
      const t1 = setTimeout(() => map.invalidateSize?.(), 250);
      map.whenReady?.(() => map.invalidateSize?.());
      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
      };
    } catch {}
  }, [map, onReady]);

  useEffect(() => {
    if (!onBoundsChange) return;
    const emit = () => {
      try { onBoundsChange(map.getBounds()); } catch {}
    };
    map.on('moveend', emit);
    map.on('zoomend', emit);
    // emit initial bounds after map is ready
    map.whenReady?.(emit);
    return () => {
      map.off('moveend', emit);
      map.off('zoomend', emit);
    };
  }, [map, onBoundsChange]);

  return null;
};
```

Substituir por:
```js
const MapInstanceBinder = ({ onReady, onBoundsChange }) => {
  const map = useMap();
  useEffect(() => {
    onReady?.(map);
    try {
      const t0 = setTimeout(() => map.invalidateSize?.(), 0);
      const t1 = setTimeout(() => map.invalidateSize?.(), 250);
      map.whenReady?.(() => map.invalidateSize?.());
      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
      };
    } catch {}
  }, [map, onReady]);

  useEffect(() => {
    if (!onBoundsChange) return;
    const emit = () => {
      try { onBoundsChange(map.getBounds(), map.getZoom()); } catch {}
    };
    map.on('moveend', emit);
    map.on('zoomend', emit);
    // emit initial bounds after map is ready
    map.whenReady?.(emit);
    return () => {
      map.off('moveend', emit);
      map.off('zoomend', emit);
    };
  }, [map, onBoundsChange]);

  return null;
};
```

- [ ] **Step 4: Remover o clustering client-side em grid fixa e o estado do toggle manual**

Localizar (linhas 168-189, dentro do componente `MapView`):
```js
  const [userLocation, setUserLocation] = useState(null);
  const [clusterToZoom, setClusterToZoom] = useState(null);
  const [expandedCluster, setExpandedCluster] = useState(null);

  // Load cluster preference from localStorage, default to false (individual view)
  const [clusterModeEnabled, setClusterModeEnabled] = useState(() => {
    const saved = localStorage.getItem("map-cluster-mode");
    return saved ? JSON.parse(saved) : false;
  });

  // Save preference to localStorage when changed
  useEffect(() => {
    localStorage.setItem(
      "map-cluster-mode",
      JSON.stringify(clusterModeEnabled)
    );
  }, [clusterModeEnabled]);

  const toggleClusterMode = useCallback(() => {
    setClusterModeEnabled((prev) => !prev);
    setExpandedCluster(null);
  }, []);
```

Substituir por:
```js
  const [userLocation, setUserLocation] = useState(null);
  const [clusterToZoom, setClusterToZoom] = useState(null);
  const [expandedCluster, setExpandedCluster] = useState(null);
  const [expandedClusterItems, setExpandedClusterItems] = useState([]);
  const { fetchDetails: fetchClusterDetails } = useClusterDetails();
```

- [ ] **Step 5: Remover o `useMemo` de clustering em grid fixa (`clustered`)**

Localizar (linhas 309-344):
```js
  const clusterSize = 0.003;
  const clustered = useMemo(() => {
    const list = Array.isArray(reports) ? reports : [];
    // Only cluster if clusterModeEnabled is true
    if (!clusterModeEnabled) return null;
    const buckets = new Map();
    for (const r of list) {
      const loc = r.location;
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number")
        continue;
      const keyLat = Math.floor(loc.lat / clusterSize);
      const keyLng = Math.floor(loc.lng / clusterSize);
      const key = `${keyLat}:${keyLng}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    }
    const clusters = [];
    for (const arr of buckets.values()) {
      if (arr.length === 1) {
        const r = arr[0];
        clusters.push({
          count: 1,
          lat: r.location.lat,
          lng: r.location.lng,
          items: arr,
        });
      } else {
        const sumLat = arr.reduce((acc, r) => acc + r.location.lat, 0);
        const sumLng = arr.reduce((acc, r) => acc + r.location.lng, 0);
        const lat = sumLat / arr.length;
        const lng = sumLng / arr.length;
        clusters.push({ count: arr.length, lat, lng, items: arr });
      }
    }
    return clusters;
  }, [reports, clusterModeEnabled]);
```

Remover esse bloco inteiro (nenhuma substituição — os dados já vêm agregados do `clusters` prop).

- [ ] **Step 6: Ajustar `handleClusterClick` para buscar detalhes sob demanda**

Localizar (linhas 290-301):
```js
  const handleClusterClick = useCallback((cluster) => {
    setClusterToZoom(cluster);
    setExpandedCluster(cluster);
  }, []);

  const handleZoomComplete = useCallback(() => {
    setClusterToZoom(null);
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setExpandedCluster(null);
  }, []);
```

Substituir por:
```js
  const handleClusterClick = useCallback(async (cluster) => {
    setExpandedCluster(cluster);
    if (cluster.count <= 20) {
      const details = await fetchClusterDetails(cluster.ids);
      setExpandedClusterItems(details);
    } else {
      setExpandedClusterItems([]);
      setClusterToZoom(cluster);
    }
  }, [fetchClusterDetails]);

  const handleZoomComplete = useCallback(() => {
    setClusterToZoom(null);
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setExpandedCluster(null);
    setExpandedClusterItems([]);
  }, []);
```

- [ ] **Step 7: Ajustar `ClusterZoomHandler` para usar `expandedClusterItems` (fallback: se não há items, dá zoom simples no centróide)**

Localizar (linhas 100-118):
```js
const ClusterZoomHandler = ({ clusterToZoom, onZoomComplete }) => {
  const map = useMap();

  useEffect(() => {
    if (
      clusterToZoom &&
      clusterToZoom.items &&
      clusterToZoom.items.length > 0
    ) {
      const bounds = L.latLngBounds(
        clusterToZoom.items.map((r) => [r.location.lat, r.location.lng])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
      if (onZoomComplete) onZoomComplete();
    }
  }, [clusterToZoom, map, onZoomComplete]);

  return null;
};
```

Substituir por:
```js
const ClusterZoomHandler = ({ clusterToZoom, onZoomComplete }) => {
  const map = useMap();

  useEffect(() => {
    if (!clusterToZoom) return;
    // Cluster grande: sem lista de coordenadas carregada, dá zoom no centróide
    // e deixa o próximo fetch (disparado por zoomend) trazer o próximo nível de agregação.
    map.setView([clusterToZoom.lat, clusterToZoom.lng], Math.min((map.getZoom?.() || 4) + 3, 18), { animate: true });
    if (onZoomComplete) onZoomComplete();
  }, [clusterToZoom, map, onZoomComplete]);

  return null;
};
```

- [ ] **Step 8: Ajustar o círculo de destaque do cluster expandido (usa `expandedClusterItems` em vez de `expandedCluster.items`)**

Localizar (linhas 420-454):
```js
          {expandedCluster &&
            expandedCluster.count > 1 &&
            (() => {
              const cluster = expandedCluster;
              const radius =
                Math.max(
                  ...cluster.items.map((r) => {
                    const dLat = r.location.lat - cluster.lat;
                    const dLng = r.location.lng - cluster.lng;
                    return Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
                  }),
                  50
                ) * 1.3;
              const intensity =
                cluster.count >= 50
                  ? "#ef4444"
                  : cluster.count >= 10
                  ? "#f59e0b"
                  : "#3b82f6";
              return (
                <Circle
                  key={`circle-${cluster.lat}-${cluster.lng}`}
                  center={[cluster.lat, cluster.lng]}
                  radius={radius}
                  pathOptions={{
                    color: intensity,
                    fillColor: intensity,
                    fillOpacity: 0.15,
                    weight: 2,
                    opacity: 0.6,
                    dashArray: "5, 5",
                  }}
                />
              );
            })()}
```

Substituir por:
```js
          {expandedCluster &&
            expandedCluster.count > 1 &&
            expandedClusterItems.length > 0 &&
            (() => {
              const cluster = expandedCluster;
              const radius =
                Math.max(
                  ...expandedClusterItems.map((r) => {
                    const dLat = r.location.lat - cluster.lat;
                    const dLng = r.location.lng - cluster.lng;
                    return Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
                  }),
                  50
                ) * 1.3;
              const intensity =
                cluster.count >= 50
                  ? "#ef4444"
                  : cluster.count >= 10
                  ? "#f59e0b"
                  : "#3b82f6";
              return (
                <Circle
                  key={`circle-${cluster.lat}-${cluster.lng}`}
                  center={[cluster.lat, cluster.lng]}
                  radius={radius}
                  pathOptions={{
                    color: intensity,
                    fillColor: intensity,
                    fillOpacity: 0.15,
                    weight: 2,
                    opacity: 0.6,
                    dashArray: "5, 5",
                  }}
                />
              );
            })()}
```

- [ ] **Step 9: Ajustar a renderização dos pins do cluster expandido (usa `expandedClusterItems`)**

Localizar (linhas 455-540):
```js
          {expandedCluster &&
            expandedCluster.items.map((report) => {
              const location = report.location;
              if (
                !location ||
                typeof location.lat !== "number" ||
                typeof location.lng !== "number"
              ) {
                return null;
              }
              return (
                <Marker
                  key={`expanded-${report.id}`}
```

Substituir a linha de abertura por (o resto do bloco do `Marker`/`Popup`, linhas ~466-539, permanece idêntico — só a fonte da iteração muda):
```js
          {expandedCluster &&
            expandedClusterItems.map((report) => {
              const location = report.location;
              if (
                !location ||
                typeof location.lat !== "number" ||
                typeof location.lng !== "number"
              ) {
                return null;
              }
              return (
                <Marker
                  key={`expanded-${report.id}`}
```

- [ ] **Step 10: Ajustar o loop principal de renderização de markers (usa `clusters` prop em vez de `clustered ? clustered : reports`)**

Localizar (linha 541):
```js
          {(clustered ? clustered : reports).map((item) => {
            const isCluster = !!item.items;
            const isThisClusterExpanded =
              expandedCluster &&
              isCluster &&
              expandedCluster.lat === item.lat &&
              expandedCluster.lng === item.lng;

            if (isThisClusterExpanded) return null;

            const location = isCluster
              ? { lat: item.lat, lng: item.lng }
              : item.location;
            const report = isCluster ? null : item;
```

Substituir por:
```js
          {(clusters || []).map((item) => {
            const isCluster = !!item.isCluster;
            const isThisClusterExpanded =
              expandedCluster &&
              isCluster &&
              expandedCluster.lat === item.lat &&
              expandedCluster.lng === item.lng;

            if (isThisClusterExpanded) return null;

            const location = { lat: item.lat, lng: item.lng };
            const report = isCluster ? null : item.report;
```

- [ ] **Step 11: Ajustar a chave do `Marker` e o ícone (usa `item.count` em vez de `item.items`)**

Localizar (linhas 562-574):
```js
            return (
              <Marker
                key={
                  isCluster
                    ? `cluster-${item.lat}-${item.lng}-${item.count}`
                    : report.id
                }
                position={[location.lat, location.lng]}
                icon={
                  isCluster
                    ? createClusterIcon(item.count)
                    : createMarkerIcon(report.category, report.status)
                }
```

Esse bloco já usa `item.count` e `report.id`/`report.category`/`report.status` — permanece idêntico, pois `report` agora vem de `item.report` (Step 10) com o mesmo formato (`{ id, category, status, ... }`) produzido pelo hook `useClusterDetails`/RPC.

- [ ] **Step 12: Ajustar o popup de cluster para mostrar a lista quando disponível, ou "carregando"/"clique para expandir" quando não**

Localizar (linhas 588-624):
```js
                <Popup>
                  <div className="w-64">
                    {isCluster ? (
                      <>
                        <h3 className="font-bold text-base mb-2">
                          Broncas nesta área ({item.count})
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                          Clique no cluster para expandir a área
                        </p>
                        <ul className="space-y-1 mb-3 max-h-48 overflow-y-auto">
                          {item.items.map((r) => (
                            <li
                              key={r.id}
                              className="text-sm line-clamp-1 cursor-pointer hover:text-primary hover:underline py-1 border-b border-border/50 last:border-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReportClick(r);
                              }}
                              style={{ pointerEvents: "auto" }}
                            >
                              {r.title}
                            </li>
                          ))}
                        </ul>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClusterClick(item);
                          }}
                        >
                          Expandir área
                        </Button>
                      </>
                    ) : (
```

Substituir o bloco `isCluster ? (...)` por:
```js
                <Popup>
                  <div className="w-64">
                    {isCluster ? (
                      <>
                        <h3 className="font-bold text-base mb-2">
                          Broncas nesta área ({item.count})
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                          {item.count <= 20
                            ? "Clique no cluster para ver a lista"
                            : "Clique no cluster para aproximar o zoom"}
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClusterClick(item);
                          }}
                        >
                          {item.count <= 20 ? "Ver broncas" : "Aproximar"}
                        </Button>
                      </>
                    ) : (
```

- [ ] **Step 13: Remover o toggle manual de agrupamento do UI (botão Layers/Grid3X3)**

Localizar (linhas 692-749, dentro do bloco `showModeToggle &&`):
```js
        {showModeToggle && (
          <div className="absolute bottom-3 right-3 z-[800]">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  recenterToUser();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="w-10 h-10 inline-flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
                title="Voltar para minha posição"
              >
                <LocateFixed className="w-4 h-4" />
              </button>
              <div className="h-px w-full bg-border" />
              {expandedCluster && clusterModeEnabled && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCloseExpanded();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-10 h-10 inline-flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
                    title="Voltar ao agrupamento"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="h-px w-full bg-border" />
                </>
              )}
              <MapModeToggle className="w-10 h-10 p-0 bg-transparent shadow-none border-0 rounded-none hover:bg-muted/60" />
              <div className="h-px w-full bg-border" />
              <Toggle
                pressed={clusterModeEnabled}
                onPressedChange={toggleClusterMode}
                className="w-10 h-10 p-0 bg-transparent shadow-none border-0 rounded-none data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
                title={
                  clusterModeEnabled
                    ? "Ver broncas individuais"
                    : "Ver agrupamentos"
                }
              >
                {clusterModeEnabled ? (
                  <Grid3X3 className="w-4 h-4" />
                ) : (
                  <Layers className="w-4 h-4" />
                )}
              </Toggle>
            </div>
          </div>
        )}
```

Substituir por:
```js
        {showModeToggle && (
          <div className="absolute bottom-3 right-3 z-[800]">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  recenterToUser();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="w-10 h-10 inline-flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
                title="Voltar para minha posição"
              >
                <LocateFixed className="w-4 h-4" />
              </button>
              <div className="h-px w-full bg-border" />
              {expandedCluster && (
                <>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      handleCloseExpanded();
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    className="w-10 h-10 inline-flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
                    title="Voltar ao agrupamento"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <div className="h-px w-full bg-border" />
                </>
              )}
              <MapModeToggle className="w-10 h-10 p-0 bg-transparent shadow-none border-0 rounded-none hover:bg-muted/60" />
            </div>
          </div>
        )}
```

- [ ] **Step 14: Remover imports que ficaram sem uso (`Grid3X3`, `Layers`, `Toggle`)**

Localizar (linhas 1-27):
```js
import {
  ThumbsUp,
  Calendar,
  Layers,
  Grid3X3,
  ArrowLeft,
  LocateFixed,
  Megaphone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import { Toggle } from "@/components/ui/toggle";
import L from "leaflet";
import { FLORESTA_COORDS, INITIAL_ZOOM } from "@/config/mapConfig";
import { useMapScrollLock } from "@/hooks/useMapScrollLock";
import { useMapModeToggle } from "@/contexts/MapModeContext";
import MapModeToggle from "@/components/MapModeToggle";
```

Substituir por:
```js
import {
  ThumbsUp,
  Calendar,
  ArrowLeft,
  LocateFixed,
  Megaphone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import L from "leaflet";
import { FLORESTA_COORDS, INITIAL_ZOOM } from "@/config/mapConfig";
import { useMapScrollLock } from "@/hooks/useMapScrollLock";
import { useMapModeToggle } from "@/contexts/MapModeContext";
import MapModeToggle from "@/components/MapModeToggle";
import { useClusterDetails } from "@/hooks/useClusterDetails";
```

- [ ] **Step 15: Verificar build**

Run: `npm run build`
Expected: build finaliza sem erros (sem imports quebrados, sem variáveis não definidas como `reports`, `clustered`, `clusterModeEnabled`, `toggleClusterMode`).

- [ ] **Step 16: Testar manualmente no navegador**

Run: `npm run dev`, abrir a página do mapa.
Expected:
- Zoom alto (bairro): pins individuais aparecem, clicar mostra popup com detalhes reais.
- Dar zoom out até ver várias cidades: pins viram bolhas com contagem (cluster).
- Clicar num cluster pequeno (≤20): populate popup com lista de títulos reais (via `useClusterDetails`).
- Clicar num cluster grande (>20): dá zoom na região, sem travar a UI.
- Rodapé mostra a soma das contagens visíveis, não apenas o número de marcadores.
- Botão de toggle Layers/Grid3X3 não aparece mais; botão de recentralizar e modo dia/noite continuam funcionando.

- [ ] **Step 17: Commit**

```bash
git add src/components/MapView.jsx
git commit -m "refactor(mapa): consumir clusters agregados do servidor, remover clustering client-side"
```

---

## Self-Review

**Spec coverage:**
- RPC agregando por grid adaptativo ao zoom → Task 1.
- Zoom >= limiar devolve individuais → Task 1 (`individual` CTE, zoom >= 13).
- Contagem do rodapé soma `count` dos clusters visíveis → Task 3, Step 4 (`totalVisibleCount`).
- Clique em cluster grande dá zoom automático → Task 4, Step 6/7 (`clusterToZoom` quando `count > 20`).
- Popup busca detalhes sob demanda (não vem agregado no RPC) → Task 2 (`useClusterDetails`) + Task 4, Step 6.
- Remoção do toggle manual → Task 4, Steps 4 e 13.
- Índice GIST em `location` → Task 1, Step 1.

**Placeholder scan:** nenhum "TBD"/"implementar depois" — todo código é completo e copiável.

**Type consistency:** `report_ids`/`ids` tratado como `uuid[]` em todas as camadas (migration, hook, MapPage, MapView). `location` sempre `{ lat, lng }` no formato consumido por `MapView`. Nome do prop `clusters` consistente entre `MapPage.jsx` (produz) e `MapView.jsx` (consome). `handleBoundsChange(bounds, zoom)` consistente entre `MapPage.jsx` (Task 3) e `MapView.jsx`'s `MapInstanceBinder` (Task 4, Step 3).

**Gaps identificados e decisão:** o limiar de zoom (13) está hardcoded na migration SQL, não como constante JS compartilhada — é aceitável pois o spec definiu esse valor como "ajustável depois" e mexer nele é uma mudança de uma linha na migration (`params.zoom_sanitized >= 13` em dois lugares). Não vale introduzir uma tabela de configuração para um valor que ainda não tem dado real para calibrar (YAGNI).
