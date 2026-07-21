import { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Loader2, Search, X, MapPin, ChevronDown, LocateFixed, Check,
  SlidersHorizontal, ChevronRight,
} from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useCity, parseCityFromNominatim, matchCityInList } from '@/contexts/CityContext';

const MapView = lazy(() => import('@/components/MapView'));

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUSES = [
  { id: 'active',      label: 'Ativas' },
  { id: 'pending',     label: 'Pendentes' },
  { id: 'in-progress', label: 'Em Andamento' },
  { id: 'resolved',    label: 'Resolvidas' },
];

const CATEGORIES = [
  { id: 'all',               label: 'Todas' },
  { id: 'iluminacao',        label: 'Iluminação' },
  { id: 'buracos',           label: 'Buracos' },
  { id: 'esgoto',            label: 'Esgoto' },
  { id: 'limpeza',           label: 'Limpeza' },
  { id: 'poda',              label: 'Poda' },
  { id: 'vazamento-de-agua', label: 'Vazamento' },
  { id: 'outros',            label: 'Outros' },
];


// ─── Small helpers ────────────────────────────────────────────────────────────

const FilterChip = ({ label, onRemove }) => (
  <span className="inline-flex items-center gap-1 bg-primary/10 text-primary border border-primary/30 rounded-full text-xs font-semibold px-2.5 py-1">
    {label}
    <button type="button" onClick={onRemove} className="hover:opacity-70">
      <X size={11} />
    </button>
  </span>
);

const SheetChip = ({ active, onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className={`rounded-full border text-sm font-semibold px-4 py-1.5 transition-colors ${
      active
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-background text-foreground border-border hover:border-primary/40'
    }`}
  >
    {children}
  </button>
);

// ─── Bottom Sheet ─────────────────────────────────────────────────────────────

const BottomSheet = ({ open, onClose, title, children }) => {

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1002] flex flex-col justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ background: 'rgba(0,0,0,0.4)' }}
    >
      <div className="bg-background rounded-t-2xl shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-200" style={{ maxHeight: 'calc(85vh - env(safe-area-inset-bottom, 0px))', paddingBottom: 'max(env(safe-area-inset-bottom), 0px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-border" />
        </div>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-3 flex-shrink-0 border-b border-border">
          <span className="font-bold text-base">{title}</span>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground p-1">
            <X size={18} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
};

// ─── MapLoader ────────────────────────────────────────────────────────────────

const MapLoader = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm z-20">
    <Loader2 size={36} className="animate-spin text-primary" />
    <p className="text-sm text-muted-foreground font-medium">Carregando mapa…</p>
  </div>
);

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const navigate = useNavigate();
  const { cities, loadingCities } = useCity();
  const citiesRef = useRef(cities);
  useEffect(() => { citiesRef.current = cities; }, [cities]);

  // ── City state ──
  const [mapCityId,   setMapCityId]   = useState(null);
  const [mapCityName, setMapCityName] = useState(null);
  const [mapGpsInitDone, setMapGpsInitDone] = useState(false);
  const [citySheetOpen,  setCitySheetOpen]  = useState(false);
  const [citySearch,     setCitySearch]     = useState('');
  const [showAllCities,  setShowAllCities]  = useState(false);
  const [gpsLoading,     setGpsLoading]     = useState(false);
  const [nearbyLoading,  setNearbyLoading]  = useState(false);
  const [nearbyCities,   setNearbyCities]   = useState([]);

  // ── Filter state ──
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [statusFilter,    setStatusFilter]    = useState('active');
  const [categoryFilter,  setCategoryFilter]  = useState('all');
  // pending changes inside sheet
  const [pendingStatus,   setPendingStatus]   = useState('active');
  const [pendingCategory, setPendingCategory] = useState('all');

  // ── Search ──
  const [titleSearchInput, setTitleSearchInput] = useState('');
  const [titleSearchTerm,  setTitleSearchTerm]  = useState('');

  // ── Reports / map ──
  const [mapClusters, setMapClusters] = useState([]); // [{ isCluster, lat, lng, count, ids, report }]
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [mapBounds,   setMapBounds]   = useState(null); // { minLat, maxLat, minLng, maxLng }
  const [mapZoom,     setMapZoom]     = useState(13);
  const cancelRef = useRef(false);

  // Open filter sheet: seed pending state from committed state
  const openFilterSheet = () => {
    setPendingStatus(statusFilter);
    setPendingCategory(categoryFilter);
    setFilterSheetOpen(true);
  };

  const applyFilters = () => {
    setStatusFilter(pendingStatus);
    setCategoryFilter(pendingCategory);
    setFilterSheetOpen(false);
  };

  // ── Active filter chips ──
  const activeFilterChips = useMemo(() => {
    const chips = [];
    if (statusFilter !== 'active') {
      const s = STATUSES.find(s => s.id === statusFilter);
      if (s) chips.push({ key: 'status', label: s.label, clear: () => setStatusFilter('active') });
    }
    if (categoryFilter !== 'all') {
      const c = CATEGORIES.find(c => c.id === categoryFilter);
      if (c) chips.push({ key: 'cat', label: c.label, clear: () => setCategoryFilter('all') });
    }
    return chips;
  }, [statusFilter, categoryFilter]);

  const clearAllFilters = () => {
    setStatusFilter('active');
    setCategoryFilter('all');
  };

  // ── selectMapCity ──
  const selectMapCity = useCallback(async (city) => {
    setMapCityId(city ? city.id : null);
    setMapCityName(city ? (city.state?.uf ? `${city.name} · ${city.state.uf}` : city.name) : null);
    if (!city) return;
    try {
      const uf = city.state?.uf || '';
      const q  = encodeURIComponent(`${city.name}${uf ? `, ${uf}, Brasil` : ', Brasil'}`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=pt-BR&countrycodes=br`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.[0]?.lat && json?.[0]?.lon) {
        setFlyToTarget({ lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon), zoom: 13, nonce: Date.now() });
      }
    } catch {}
  }, []);

  // ── GPS auto-init on mount ──
  useEffect(() => {
    if (mapGpsInitDone || !navigator.geolocation) { setMapGpsInitDone(true); return; }
    setMapGpsInitDone(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
          );
          if (!res.ok) return;
          const json = await res.json();
          const { name, uf } = parseCityFromNominatim(json.address || {});
          const found = matchCityInList(citiesRef.current, name, uf);
          if (found) selectMapCity(found);
        } catch {}
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 300000 }
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Guarda as coordenadas GPS mais recentes para recalcular nearby quando cidades carregam
  const gpsCoordsCacheRef = useRef(null);

  const buildNearby = useCallback((coords, cityList) => {
    if (!cityList.length) return;
    const doFetch = async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
        );
        if (!res.ok) throw new Error();
        const json = await res.json();
        const { name: curName, uf: curUf } = parseCityFromNominatim(json.address || {});
        const cur = matchCityInList(cityList, curName, curUf);
        const sameState = cityList
          .filter(c => (c.state?.uf || '') === curUf && (!cur || c.id !== cur.id))
          .slice(0, 4);
        setNearbyCities(cur ? [cur, ...sameState] : sameState);
      } catch {
        setNearbyCities([]);
      } finally {
        setNearbyLoading(false);
      }
    };
    doFetch();
  }, []);

  // ── Load nearby cities when city sheet opens ──
  useEffect(() => {
    if (!citySheetOpen) return;
    if (!navigator.geolocation) { setNearbyCities([]); return; }
    // Se já temos coordenadas em cache e cidades carregadas, recalcula direto
    if (gpsCoordsCacheRef.current && cities.length > 0) {
      setNearbyLoading(true);
      buildNearby(gpsCoordsCacheRef.current, cities);
      return;
    }
    setNearbyLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        gpsCoordsCacheRef.current = position.coords;
        buildNearby(position.coords, citiesRef.current);
      },
      () => { setNearbyLoading(false); setNearbyCities([]); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  }, [citySheetOpen, cities, buildNearby]);

  // Recalcula nearby quando cidades chegam e sheet está aberto
  useEffect(() => {
    if (!citySheetOpen || cities.length === 0 || !gpsCoordsCacheRef.current) return;
    buildNearby(gpsCoordsCacheRef.current, cities);
  }, [cities, citySheetOpen, buildNearby]);

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

  // Reajusta a cidade do filtro sem mover o mapa (usado após pan/zoom manual e após recentralização por GPS)
  const syncCityFromCoords = useCallback(async (coords) => {
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=json&accept-language=pt-BR`
      );
      if (!res.ok) return;
      const json = await res.json();
      const { name, uf } = parseCityFromNominatim(json.address || {});
      const found = matchCityInList(citiesRef.current, name, uf);
      setMapCityId(prevId => {
        if (found && found.id !== prevId) {
          setMapCityName(found.state?.uf ? `${found.name} · ${found.state.uf}` : found.name);
          return found.id;
        }
        return prevId;
      });
    } catch {}
  }, []);

  // Debounce: só reconsulta a cidade depois que o usuário para de arrastar/zoomar por um tempo
  const boundsCityTimerRef = useRef(null);

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

  useEffect(() => () => clearTimeout(boundsCityTimerRef.current), []);

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

  const handleReportClick = useCallback(
    (report) => navigate(`/bronca/${report.id ?? report}`),
    [navigate]
  );

  const filteredCities = useMemo(() => {
    if (!citySearch.trim()) return cities;
    const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
    const term = norm(citySearch.trim());
    return cities.filter(c =>
      norm(c.name).includes(term) || (c.state?.uf || '').toLowerCase().includes(term)
    );
  }, [cities, citySearch]);

  const handleGpsDetect = useCallback(() => {
    if (!navigator.geolocation || gpsLoading) return;
    setGpsLoading(true);
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${coords.latitude}&lon=${coords.longitude}&format=json&accept-language=pt-BR`
          );
          if (!res.ok) throw new Error();
          const json = await res.json();
          const { name, uf } = parseCityFromNominatim(json.address || {});
          const found = matchCityInList(citiesRef.current, name, uf);
          if (found) { selectMapCity(found); setCitySheetOpen(false); }
        } catch {}
        finally { setGpsLoading(false); }
      },
      () => setGpsLoading(false),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
    );
  }, [gpsLoading, selectMapCity]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col bg-background flex-1 min-h-0 overflow-hidden">

      {/* ── Top bar: search + filtros ── */}
      <div className="flex-shrink-0 bg-background border-b border-border px-3 py-2 flex items-center gap-2">
        <div className="flex-1 flex items-center gap-2 bg-muted rounded-full px-3 py-2">
          <Search size={15} className="text-muted-foreground flex-shrink-0" />
          <input
            value={titleSearchInput}
            onChange={e => setTitleSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleTitleSearch(); }}
            placeholder="Buscar bronca..."
            className="bg-transparent outline-none text-sm flex-1 min-w-0"
          />
          {titleSearchInput && (
            <button type="button" onClick={() => { setTitleSearchInput(''); setTitleSearchTerm(''); setFlyToTarget(null); }}>
              <X size={14} className="text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={openFilterSheet}
          className="flex-shrink-0 flex items-center gap-1.5 border border-border rounded-full px-3 py-2 text-sm font-medium text-foreground hover:border-primary/40 transition-colors"
        >
          <SlidersHorizontal size={14} />
          <span className="text-xs">Filtros</span>
          {(statusFilter !== 'active' || categoryFilter !== 'all') && (
            <span className="w-2 h-2 rounded-full bg-primary" />
          )}
        </button>
      </div>

      {/* ── City pill + active filter chips ── */}
      <div className="flex-shrink-0 bg-background px-3 py-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => { setCitySheetOpen(true); setCitySearch(''); }}
          className="flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-semibold text-foreground hover:border-primary/40 transition-colors shadow-sm"
        >
          <MapPin size={13} className="text-primary flex-shrink-0" />
          <span className="truncate max-w-[160px]">{mapCityName ?? 'Selecionar cidade'}</span>
          <ChevronDown size={13} className="opacity-60 flex-shrink-0" />
        </button>

        {activeFilterChips.map(chip => (
          <FilterChip key={chip.key} label={chip.label} onRemove={chip.clear} />
        ))}

        {activeFilterChips.length > 0 && (
          <button type="button" onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-primary transition-colors ml-auto">
            Limpar tudo
          </button>
        )}
      </div>

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
      </div>

      {/* ── Bottom bar: contagem ── */}
      <div className="flex-shrink-0 bg-background border-t border-border px-4 py-2.5 flex items-center">
        <span className="text-sm font-semibold text-foreground">
          {loading ? (
            <span className="text-muted-foreground">Carregando…</span>
          ) : (
            `${totalVisibleCount} ${totalVisibleCount === 1 ? 'bronca visível' : 'broncas visíveis'}`
          )}
        </span>
      </div>

      {/* ══ Bottom Sheet: Filtros ══════════════════════════════════════════════ */}
      <BottomSheet open={filterSheetOpen} onClose={() => setFilterSheetOpen(false)} title="Filtros">
        <div className="px-5 py-4 flex flex-col gap-6">
          {/* Status */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Status</p>
            <div className="flex flex-wrap gap-2">
              {STATUSES.map(s => (
                <SheetChip key={s.id} active={pendingStatus === s.id} onClick={() => setPendingStatus(s.id)}>
                  {s.label}
                </SheetChip>
              ))}
            </div>
          </div>

          {/* Categoria */}
          <div>
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Categoria</p>
            <div className="flex flex-wrap gap-2">
              {CATEGORIES.map(c => (
                <SheetChip key={c.id} active={pendingCategory === c.id} onClick={() => setPendingCategory(c.id)}>
                  {c.label}
                </SheetChip>
              ))}
            </div>
          </div>

          {/* Apply */}
          <button
            type="button"
            onClick={applyFilters}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm"
          >
            Aplicar filtros
          </button>
        </div>
      </BottomSheet>

      {/* ══ Bottom Sheet: Cidade ══════════════════════════════════════════════ */}
      <BottomSheet open={citySheetOpen} onClose={() => { setCitySheetOpen(false); setShowAllCities(false); setCitySearch(''); }} title="Selecionar cidade">
        <div>
          {/* Search — sticky para ficar visível ao rolar */}
          <div className="sticky top-0 z-10 bg-background px-4 py-3 border-b border-border">
            <div className="flex items-center gap-2 bg-muted rounded-full px-3 py-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                autoFocus
                type="text"
                placeholder="Buscar cidade..."
                value={citySearch}
                onChange={e => setCitySearch(e.target.value)}
                className="bg-transparent outline-none text-sm flex-1 min-w-0"
              />
              {citySearch && (
                <button type="button" onClick={() => setCitySearch('')}>
                  <X size={14} className="text-muted-foreground hover:text-foreground" />
                </button>
              )}
            </div>
          </div>

          {/* GPS / localização atual */}
          {!citySearch && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Localização atual</p>
              <button
                type="button"
                disabled={gpsLoading}
                onClick={handleGpsDetect}
                className="w-full flex items-center gap-3 py-2.5 text-sm font-semibold text-primary"
              >
                {gpsLoading
                  ? <Loader2 size={18} className="animate-spin shrink-0" />
                  : <LocateFixed size={18} className="shrink-0" />}
                <span>{mapCityName ?? (gpsLoading ? 'Detectando...' : 'Usar minha localização')}</span>
                {mapCityId && <Check size={16} className="ml-auto shrink-0 text-primary" />}
              </button>
            </div>
          )}

          {/* Cidades próximas */}
          {!citySearch && (
            <div className="px-4 py-3 border-b border-border">
              <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Cidades próximas</p>
              {nearbyLoading ? (
                <div className="flex justify-center py-3">
                  <Loader2 size={18} className="animate-spin text-muted-foreground" />
                </div>
              ) : nearbyCities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-1">Ative o GPS para ver cidades próximas</p>
              ) : (
                <div className="flex flex-col gap-0">
                  {nearbyCities.slice(0, 3).map((city, i) => {
                    const isActive = String(mapCityId) === String(city.id);
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => { selectMapCity(city); setCitySheetOpen(false); }}
                        className={`flex items-center gap-3 py-2.5 text-sm ${i > 0 ? 'border-t border-border/40' : ''} ${isActive ? 'font-semibold text-primary' : 'text-foreground'}`}
                      >
                        <MapPin size={15} className={isActive ? 'text-primary' : 'text-muted-foreground'} />
                        <span>
                          {city.name}
                          {city.state?.uf && <span className="ml-1 text-xs text-muted-foreground">- {city.state.uf}</span>}
                        </span>
                        {isActive && <Check size={15} className="ml-auto text-primary shrink-0" />}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => setShowAllCities(true)}
                    className="flex items-center gap-1 py-2 text-sm font-semibold text-primary mt-1"
                  >
                    Ver todas as cidades
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Lista filtrada — aparece quando há busca ou "Ver todas" foi clicado */}
          {(citySearch.trim() || showAllCities) && (
            <div>
              {loadingCities ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-muted-foreground" />
                </div>
              ) : filteredCities.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Nenhuma cidade encontrada</p>
              ) : (
                (citySearch.trim() ? filteredCities : filteredCities.slice(0, 100)).map((city, i) => {
                  const isActive = String(mapCityId) === String(city.id);
                  return (
                    <button
                      key={city.id}
                      type="button"
                      onClick={() => { selectMapCity(city); setCitySheetOpen(false); setCitySearch(''); }}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                        i > 0 ? 'border-t border-border/40' : ''
                      } ${isActive ? 'font-semibold text-primary bg-primary/5' : 'text-foreground hover:bg-muted'}`}
                    >
                      <span className="flex-1 truncate">
                        {city.name}
                        {city.state?.uf && <span className="ml-2 text-xs text-muted-foreground">{city.state.uf}</span>}
                      </span>
                      {isActive && <Check size={15} className="shrink-0 text-primary" />}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
