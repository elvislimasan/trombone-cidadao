import React, { useState, useEffect, useCallback, useRef, Suspense, lazy } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, RefreshCw } from 'lucide-react';
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

// Altura total da tela menos header(4rem) + bottomnav(4.5rem) + buffer(0.5rem)
const MAP_HEIGHT_STYLE = {
  height: 'calc(100vh - 9.5rem)',
  minHeight: '400px',
};

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

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function MapPage() {
  const navigate = useNavigate();
  const [reports,        setReports]        = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [statusFilter,   setStatusFilter]   = useState('active');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const cancelRef = useRef(false);

  const fetchReports = useCallback(async () => {
    cancelRef.current = false;
    setLoading(true);
    try {
      let q = supabase
        .from('reports')
        .select(`
          id, title, description, status, created_at, address,
          category_id, location,
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

  const handleReportClick = useCallback(
    (report) => navigate(`/bronca/${report.id ?? report}`),
    [navigate]
  );

  return (
    <div className="flex flex-col bg-background" style={MAP_HEIGHT_STYLE}>

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
      <div className="flex-1 relative overflow-hidden">

        {/* ── Row 2: Category chips flutuantes sobre o mapa ── */}
        <div className="absolute top-2 left-0 right-0 z-[700] px-3">
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

        {loading && <MapLoader />}
        <Suspense fallback={<MapLoader />}>
          <div className="w-full h-full">
            <MapView
              reports={reports}
              onReportClick={handleReportClick}
              onUpvote={() => {}}
              showLegend={true}
              showModeToggle={true}
              interactive={true}
            />
          </div>
        </Suspense>

        {!loading && reports.length > 0 && (
          <div className="absolute bottom-14 left-1/2 -translate-x-1/2 z-[600] pointer-events-none">
            <div className="bg-background/90 backdrop-blur-md border border-border rounded-full px-4 py-1.5 text-xs font-semibold text-foreground shadow-lg">
              {reports.length} {reports.length === 1 ? 'bronca' : 'broncas'} visíveis
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
