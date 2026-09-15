import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Bookmark, MapPin, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { Button } from '@/components/ui/button';
import StatusBadge from '@/design-system/primitives/StatusBadge';
import TimeAgo from '@/components/TimeAgo';

const PAGE_SIZE = 12;
export default function SavedReports() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState('all');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoading(true); setError(false);
    const load = async () => {
      try {
        let query = supabase.from('favorite_reports').select('report_id, report:reports!inner(id, title, address, status, created_at, featured_image_url, report_media(url, type, is_resolution_proof))', { count: 'exact' }).eq('user_id', user.id);
        if (filter !== 'all') query = query.eq('report.status', filter);
        const { data, count, error } = await query.order('report_id', { ascending: false }).range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1).abortSignal(controller.signal);
        if (error) throw error;
        if (active) { setRows((data || []).filter(row => row.report)); setTotal(count || 0); }
      } catch { if (active) setError(true); }
      finally { if (active) setLoading(false); }
    };
    load();
    return () => { active = false; controller.abort(); };
  }, [user.id, page, filter, retry]);
  return <div className="min-w-0 w-full space-y-4">
    <div className="grid min-w-0 w-full grid-cols-2 gap-2 sm:flex sm:flex-wrap" role="group" aria-label="Filtrar broncas salvas">
      {[['all', 'Todas'], ['pending', 'Pendentes'], ['in-progress', 'Em andamento'], ['resolved', 'Resolvidas']].map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => { setFilter(value); setPage(0); }} className={`min-h-11 min-w-0 rounded-full border px-3 text-sm font-semibold sm:px-4 ${filter === value ? 'border-brand bg-brand text-content-onBrand' : 'border-edge-subtle bg-surface-raised text-content-secondary'}`}>{label}</button>)}
    </div>
    {loading ? <div role="status" className="space-y-3 py-3"><p className="text-sm text-content-secondary">Carregando broncas salvas…</p>{[0, 1, 2].map(n => <div key={n} className="h-28 animate-pulse rounded-2xl bg-surface-sunken motion-reduce:animate-none" />)}</div>
      : error ? <div role="alert" className="rounded-2xl border border-edge-subtle p-5"><p className="text-sm text-content-secondary">Não foi possível carregar suas broncas salvas.</p><Button variant="outline" className="mt-3" onClick={() => setRetry(n => n + 1)}>Tentar novamente</Button></div>
      : !rows.length ? <div className="rounded-2xl border border-dashed border-edge-subtle bg-surface-raised px-5 py-10 text-center"><Bookmark className="mx-auto h-7 w-7 text-brand" /><h2 className="mt-3 text-lg font-bold text-content-primary">{filter === 'all' ? 'Suas broncas salvas ficam aqui' : 'Nenhuma bronca com esta situação'}</h2><p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-content-secondary">{filter === 'all' ? 'Toque em Salvar em uma bronca para reencontrá-la e consultar seu andamento.' : 'Escolha outro filtro para ver suas broncas salvas.'}</p><Button asChild variant="outline" className="mt-5"><Link to="/feed">Explorar broncas</Link></Button></div>
      : <div className="space-y-3">{rows.map(({ report }) => {
        const cover = report.featured_image_url || report.report_media?.find(media => media.type === 'photo' && !media.is_resolution_proof)?.url;
        return <Link key={report.id} to={`/bronca/${report.id}`} className="group flex gap-4 rounded-2xl border border-edge-subtle bg-surface-raised p-4 transition-colors hover:border-brand/40">
          <div className="min-w-0 flex-1"><StatusBadge status={report.status} withIcon size="sm" /><h2 className="mt-2 line-clamp-2 text-base font-bold text-content-primary">{report.title}</h2>{report.address && <p className="mt-1 flex items-center gap-1 text-xs text-content-secondary"><MapPin className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{report.address}</span></p>}<p className="mt-2 text-xs text-content-tertiary">Registrada <TimeAgo date={report.created_at} /></p><span className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-brand">Ver andamento <ArrowRight className="h-4 w-4" /></span></div>
          {cover && <img src={cover} alt="" loading="lazy" className="h-24 w-24 shrink-0 rounded-xl object-cover sm:h-28 sm:w-36" />}
        </Link>;
      })}</div>}
    {!loading && !error && total > PAGE_SIZE && <nav aria-label="Páginas de broncas salvas" className="flex items-center justify-between gap-3"><Button variant="outline" disabled={page === 0} onClick={() => setPage(n => n - 1)}>Anterior</Button><span className="text-sm text-content-secondary">{page + 1} de {Math.ceil(total / PAGE_SIZE)}</span><Button variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(n => n + 1)}>Próxima</Button></nav>}
  </div>;
}
