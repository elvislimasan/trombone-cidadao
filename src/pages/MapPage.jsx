import React, { useState, useEffect, useCallback, useMemo, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';

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

      const { data, error } = await q;
      if (error) throw error;
      if (cancelRef.current) return;

      setReports(
        (data || [])
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
          }))
      );
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

  useEffect(() => {
    if (categoryFilter !== 'iluminacao') {
      setSearchMode('title');
      setPoleSearchInput('');
      setPoleSearchTerm('');
    }
  }, [categoryFilter]);

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

      {/* ── Row 1: Status chips ── */}
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
