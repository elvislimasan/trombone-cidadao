import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, Search, X, MapPin, ChevronDown, LocateFixed, Check } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useCity, parseCityFromNominatim, matchCityInList } from '@/contexts/CityContext';

const MapView         = lazy(() => import('@/components/MapView'));

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUSES = [
  { id: 'active',      label: 'Ativas' },
  { id: 'pending',     label: 'Pendentes' },
  { id: 'in-progress', label: 'Em Andamento' },
  { id: 'resolved',    label: 'Resolvidas' },
];

const CATEGORIES = [
  { id: 'all',                label: 'Todas' },
  { id: 'iluminacao',         label: '💡 Iluminação' },
  { id: 'buracos',            label: '🕳️ Buracos' },
  { id: 'esgoto',             label: '🚰 Esgoto' },
  { id: 'limpeza',            label: '🧹 Limpeza' },
  { id: 'poda',               label: '🌳 Poda' },
  { id: 'vazamento-de-agua',  label: '💧 Vazamento' },
  { id: 'outros',             label: '📍 Outros' },
];

// ─── Chip ────────────────────────────────────────────────────────────────────

const Chip = ({ active, onClick, children }) => (
  <button
    onClick={onClick}
    className={`flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-full border transition-all duration-150 whitespace-nowrap shadow-sm ${
      active
        ? 'bg-primary text-primary-foreground border-primary'
        : 'bg-background/90 text-muted-foreground border-border/80 hover:border-primary/40 hover:text-foreground backdrop-blur-sm'
    }`}
  >
    {children}
  </button>
);

// ─── Loading fallback ─────────────────────────────────────────────────────────

const MapLoader = () => (
  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-background/70 backdrop-blur-sm z-20">
    <Loader2 size={36} className="animate-spin text-primary" />
    <p className="text-sm text-muted-foreground font-medium">Carregando mapa…</p>
  </div>
);

const normalizePole = (value) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/\s+/g, '');

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const navigate = useNavigate();
  const { cities, loadingCities } = useCity();
  const citiesRef = useRef(cities);
  useEffect(() => { citiesRef.current = cities; }, [cities]);
  const [mapCityId, setMapCityId] = useState(null);
  const [mapCityName, setMapCityName] = useState(null);
  const [mapGpsInitDone, setMapGpsInitDone] = useState(false);
  const [cityPickerOpen, setCityPickerOpen] = useState(false);
  const [citySearch, setCitySearch] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const cityPickerRef = useRef(null);

  const selectMapCity = useCallback(async (city) => {
    setMapCityId(city ? city.id : null);
    setMapCityName(city ? (city.state?.uf ? `${city.name} · ${city.state.uf}` : city.name) : null);
    if (!city) return;
    // Geocodifica o nome da cidade para centralizar o mapa mesmo sem broncas
    try {
      const uf = city.state?.uf || '';
      const q = encodeURIComponent(`${city.name}${uf ? `, ${uf}, Brasil` : ', Brasil'}`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1&accept-language=pt-BR&countrycodes=br`);
      if (!res.ok) return;
      const json = await res.json();
      if (json?.[0]?.lat && json?.[0]?.lon) {
        setFlyToTarget({ lat: parseFloat(json[0].lat), lng: parseFloat(json[0].lon), zoom: 13, nonce: Date.now() });
      }
    } catch {}
  }, []);
  const [reports,        setReports]        = useState([]);
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [loading,        setLoading]        = useState(true);
  const [statusFilter,   setStatusFilter]   = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [searchMode, setSearchMode] = useState('title');
  const [titleSearchInput, setTitleSearchInput] = useState('');
  const [titleSearchTerm, setTitleSearchTerm] = useState('');
  const [poleSearchInput, setPoleSearchInput] = useState('');
  const [poleSearchTerm, setPoleSearchTerm] = useState('');
  const cancelRef = useRef(false);

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
        .order('created_at', { ascending: false })
        .limit(500);

      if (statusFilter === 'active') {
        q = q.in('status', ['pending', 'in-progress']);
      } else {
        q = q.eq('status', statusFilter);
      }

      if (categoryFilter !== 'all') {
        q = q.eq('category_id', categoryFilter);
      }

      if (mapCityId) {
        q = q.eq('city_id', mapCityId);
      }

      const { data, error } = await q;
      if (error) throw error;
      if (cancelRef.current) return;

      const mapped = (data || [])
        .filter((r) => r.location)
        .map((r) => ({
          ...r,
          location: {
            lat: r.location.coordinates[1],
            lng: r.location.coordinates[0],
          },
          category:     r.category_id,
          categoryName: r.category?.name || r.category_id,
          coverImage:   (r.report_media || []).find((m) => m.type === 'photo')?.url || null,
          upvotes:      Number(r.upvotes?.[0]?.count ?? 0),
          pole_number:  r.pole_number ?? null,
        }));

      setReports(mapped);
    } catch (err) {
      console.error('[MapPage] fetch error:', err);
    } finally {
      if (!cancelRef.current) setLoading(false);
    }
  }, [categoryFilter, statusFilter, mapCityId]);

  useEffect(() => {
    cancelRef.current = false;
    fetchReports();
    return () => { cancelRef.current = true; };
  }, [fetchReports]);

  useEffect(() => {
    if (categoryFilter !== 'iluminacao') {
      setSearchMode('title');
      setPoleSearchInput('');
      setPoleSearchTerm('');
    }
  }, [categoryFilter]);

  useEffect(() => {
    if (!cityPickerOpen) return;
    const handler = (e) => {
      if (cityPickerRef.current && !cityPickerRef.current.contains(e.target)) {
        setCityPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [cityPickerOpen]);

  // Auto-detecta cidade pelo GPS ao abrir o mapa (uma vez)
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

  const visibleReports = useMemo(() => {
    let result = reports || [];

    if (categoryFilter === 'iluminacao') {
      const poleTerm = normalizePole(poleSearchTerm);
      if (poleTerm) {
        result = result.filter((r) => normalizePole(r.pole_number).includes(poleTerm));
      }
    }

    const titleTerm = String(titleSearchTerm ?? '').trim().toLowerCase();
    if (titleTerm) {
      result = result.filter((r) => String(r.title ?? '').toLowerCase().includes(titleTerm));
    }

    return result;
  }, [reports, categoryFilter, poleSearchTerm, titleSearchTerm]);

  const handleReportClick = useCallback(
    (report) => navigate(`/bronca/${report.id ?? report}`),
    [navigate]
  );

  const handlePoleSearch = useCallback(() => {
    if (categoryFilter !== 'iluminacao') return;
    const next = String(poleSearchInput ?? '').trim();
    setPoleSearchTerm(next);

    const term = normalizePole(next);
    if (!term) {
      setFlyToTarget(null);
      return;
    }

    const first = (reports || []).find((r) => normalizePole(r.pole_number).includes(term));
    const loc = first?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      setFlyToTarget({ lat: loc.lat, lng: loc.lng, zoom: 18, nonce: Date.now() });
    } else {
      setFlyToTarget(null);
    }
  }, [categoryFilter, poleSearchInput, reports]);

  const handleTitleSearch = useCallback(() => {
    const next = String(titleSearchInput ?? '').trim();
    setTitleSearchTerm(next);

    const term = next.toLowerCase();
    if (!term) {
      setFlyToTarget(null);
      return;
    }

    let base = reports || [];
    if (categoryFilter === 'iluminacao') {
      const poleTerm = normalizePole(poleSearchTerm);
      if (poleTerm) {
        base = base.filter((r) => normalizePole(r.pole_number).includes(poleTerm));
      }
    }

    const first = base.find((r) => String(r.title ?? '').toLowerCase().includes(term));
    const loc = first?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      setFlyToTarget({ lat: loc.lat, lng: loc.lng, zoom: 18, nonce: Date.now() });
    } else {
      setFlyToTarget(null);
    }
  }, [titleSearchInput, reports, categoryFilter, poleSearchTerm]);

  const noResultsMessage = useMemo(() => {
    if (loading) return null;
    if (visibleReports.length > 0) return null;
    const hasPoleSearch = categoryFilter === 'iluminacao' && Boolean(poleSearchTerm);
    const hasTitleSearch = Boolean(String(titleSearchTerm ?? '').trim());
    if (!hasPoleSearch && !hasTitleSearch) return null;
    if (hasPoleSearch && !hasTitleSearch) return 'Nenhuma bronca encontrada para este poste';
    if (!hasPoleSearch && hasTitleSearch) return 'Nenhuma bronca encontrada para este título';
    return 'Nenhuma bronca encontrada';
  }, [loading, visibleReports.length, categoryFilter, poleSearchTerm, titleSearchTerm]);

  return (
    <div className="flex flex-col bg-background flex-1 min-h-0 overflow-hidden">

      {/* ── Row 1: Status chips + filtro de cidade ── */}
      <div className="flex-shrink-0 bg-background border-b border-border">
        <div className="flex items-center gap-1.5 px-3 py-2 overflow-x-auto no-scrollbar">
          <span className="flex-shrink-0 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1">
            Status
          </span>
          {STATUSES.map((s) => (
            <Chip
              key={s.id}
              active={statusFilter === s.id}
              onClick={() => setStatusFilter(s.id)}
            >
              {s.label}
            </Chip>
          ))}

          <button
            onClick={fetchReports}
            disabled={loading}
            className="flex-shrink-0 ml-auto flex items-center justify-center w-8 h-8 rounded-full border border-border/80 bg-background text-muted-foreground hover:text-primary hover:border-primary/40 transition-colors disabled:opacity-50"
            aria-label="Atualizar mapa"
          >
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Map area ── */}
      <div className="flex-1 min-h-0 relative overflow-hidden">

        {/* ── Row 2: Category chips flutuantes sobre o mapa ── */}
        <div className="absolute top-2 left-0 right-0 z-[700] px-3">
          <div className="flex flex-col gap-2">
            <div className="bg-background/90 backdrop-blur-sm border border-border/80 rounded-full px-2 py-2 shadow-sm flex items-center gap-2">
              <Search size={14} className="text-muted-foreground flex-shrink-0" />
              {categoryFilter === 'iluminacao' && (
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setSearchMode('title')}
                    className={`h-7 px-2 rounded-full text-[11px] font-semibold border transition-colors ${
                      searchMode === 'title'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background/70 text-muted-foreground border-border/80 hover:text-foreground'
                    }`}
                  >
                    Título
                  </button>
                  <button
                    type="button"
                    onClick={() => setSearchMode('pole')}
                    className={`h-7 px-2 rounded-full text-[11px] font-semibold border transition-colors ${
                      searchMode === 'pole'
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background/70 text-muted-foreground border-border/80 hover:text-foreground'
                    }`}
                  >
                    Poste
                  </button>
                </div>
              )}
              <input
                value={searchMode === 'pole' ? poleSearchInput : titleSearchInput}
                onChange={(e) => {
                  if (searchMode === 'pole') setPoleSearchInput(e.target.value);
                  else setTitleSearchInput(e.target.value);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    if (searchMode === 'pole') handlePoleSearch();
                    else handleTitleSearch();
                  }
                }}
                placeholder={searchMode === 'pole' ? 'Buscar por nº do poste' : 'Buscar bronca pelo título'}
                className="bg-transparent outline-none text-sm flex-1 min-w-0"
                inputMode="search"
              />
              {(searchMode === 'pole' ? poleSearchInput : titleSearchInput) && (
                <button
                  type="button"
                  onClick={() => {
                    if (searchMode === 'pole') {
                      setPoleSearchInput('');
                      setPoleSearchTerm('');
                    } else {
                      setTitleSearchInput('');
                      setTitleSearchTerm('');
                    }
                    setFlyToTarget(null);
                  }}
                  className="w-8 h-8 rounded-full inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  aria-label="Limpar busca"
                >
                  <X size={14} />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  if (searchMode === 'pole') handlePoleSearch();
                  else handleTitleSearch();
                }}
                className="px-3 h-8 rounded-full bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90"
              >
                Buscar
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
              <span className="flex-shrink-0 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mr-1 bg-background/80 backdrop-blur-sm px-1.5 py-0.5 rounded">
                Cat.
              </span>
              {CATEGORIES.map((c) => (
                <Chip
                  key={c.id}
                  active={categoryFilter === c.id}
                  onClick={() => setCategoryFilter(c.id)}
                >
                  {c.label}
                </Chip>
              ))}
            </div>

          </div>
        </div>

        {/* ── City picker — canto inferior esquerdo ── */}
        <div
          ref={cityPickerRef}
          className="absolute bottom-10 left-3 z-[700]"
        >
          {/* Dropdown — abre para cima */}
          {cityPickerOpen && (
            <div className="absolute bottom-full mb-2 left-0 w-64 rounded-xl border border-border bg-background shadow-xl overflow-hidden">
              {/* Busca */}
              <div className="flex items-center gap-2 p-2 border-b border-border">
                <input
                  autoFocus
                  type="text"
                  placeholder="Buscar cidade..."
                  value={citySearch}
                  onChange={e => setCitySearch(e.target.value)}
                  className="flex-1 rounded-lg bg-muted px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
                {citySearch && (
                  <button type="button" onClick={() => setCitySearch('')} className="text-muted-foreground hover:text-foreground">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="max-h-56 overflow-y-auto">
                {/* GPS */}
                <button
                  type="button"
                  disabled={gpsLoading}
                  onClick={() => {
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
                          if (found) {
                            selectMapCity(found);
                            setCityPickerOpen(false);
                          }
                        } catch {}
                        finally { setGpsLoading(false); }
                      },
                      () => setGpsLoading(false),
                      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 }
                    );
                  }}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-primary hover:bg-muted transition-colors"
                >
                  {gpsLoading
                    ? <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                    : <LocateFixed className="h-4 w-4 shrink-0" />}
                  {gpsLoading ? 'Detectando...' : 'Usar minha localização'}
                </button>

                {/* Lista */}
                {loadingCities ? (
                  <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : cities
                  .filter(c => {
                    if (!citySearch.trim()) return true;
                    const norm = s => s.toLowerCase().normalize('NFD').replace(/\p{Mn}/gu, '');
                    const term = norm(citySearch.trim());
                    return norm(c.name).includes(term) || (c.state?.uf || '').toLowerCase().includes(term);
                  })
                  .slice(0, citySearch.trim() ? undefined : 50)
                  .map(city => {
                    const isActive = String(mapCityId) === String(city.id);
                    return (
                      <button
                        key={city.id}
                        type="button"
                        onClick={() => { selectMapCity(city); setCityPickerOpen(false); setCitySearch(''); }}
                        className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-muted border-t border-border/50 transition-colors ${isActive ? 'font-semibold text-primary' : 'text-foreground'}`}
                      >
                        <span className="flex-1 truncate">
                          {city.name}
                          {city.state?.uf && <span className="ml-1 text-xs text-muted-foreground">{city.state.uf}</span>}
                        </span>
                        {isActive && <Check className="h-4 w-4 shrink-0 text-primary" />}
                      </button>
                    );
                  })
                }
              </div>
            </div>
          )}

          {/* Botão pill */}
          <button
            type="button"
            onClick={() => { setCityPickerOpen(v => !v); setCitySearch(''); }}
            className={`flex items-center gap-1.5 rounded-full border shadow-lg px-3 py-2 text-xs font-semibold transition-colors ${
              mapCityId
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background/95 text-foreground border-border backdrop-blur-sm'
            }`}
          >
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="max-w-[130px] truncate">
              {mapCityName ?? 'Todas as cidades'}
            </span>
            <ChevronDown className={`h-3 w-3 shrink-0 opacity-70 transition-transform ${cityPickerOpen ? 'rotate-180' : ''}`} />
          </button>
        </div>

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
            />
          </div>
        </Suspense>

        {!loading && visibleReports.length > 0 && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[600] pointer-events-none">
            <div className="bg-background/90 backdrop-blur-md border border-border rounded-full px-4 py-1.5 text-xs font-semibold text-foreground shadow-lg">
              {visibleReports.length} {visibleReports.length === 1 ? 'bronca' : 'broncas'} visíveis
            </div>
          </div>
        )}

        {noResultsMessage && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[600] pointer-events-none">
            <div className="bg-background/90 backdrop-blur-md border border-border rounded-full px-4 py-1.5 text-xs font-semibold text-foreground shadow-lg">
              {noResultsMessage}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
