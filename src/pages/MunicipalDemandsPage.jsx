import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Ban, ClipboardCheck, ClipboardCopy, Coins, Info, Settings, AlertCircle, ArrowRight, ArrowUpDown, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ClipboardList, Clock3, Download, Filter, Link2, Loader2, MapPin, MoreHorizontal, Plus, Search, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import MunicipalDemandDrawer from '@/components/municipality/MunicipalDemandDrawer';
import MunicipalExportDialog from '@/components/municipality/MunicipalExportDialog';
import { MunicipalEmptyState, MunicipalMetricCard, MunicipalPageHeader } from '@/components/municipality/MunicipalPageUi';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/customSupabaseClient';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';
import { DEMAND_STATUSES, DEMAND_PRIORITIES, DEMAND_TONES, OPEN_DEMAND_STATUSES } from '@/lib/municipalDemand';
import { municipalDemandsQuery, selectPageRecords } from '@/lib/municipalExport';

const PAGE_SIZES = [10, 25, 50];
const SORTS = { recentes: ['updated_at', false], antigas: ['created_at', true], prazo: ['prazo_em', true] };
const demandTabs = DEMAND_STATUSES.map(([key, label]) => [key, { aberta: 'Abertas', triagem: 'Triagem', programada: 'Programadas', concluida: 'Concluídas', recusada: 'Recusadas', cancelada: 'Canceladas', aguardando_confirmacao: 'Conferência interna' }[key] || label]);
const queueOptions = [['all','Todas as filas'],['em_atendimento','Em andamento'],['minhas','Minhas demandas'],['sem_responsavel','Sem responsável'],['revisao','Precisam de revisão'],['primeira_resposta','Primeira resposta atrasada'],['proxima_acao','Próxima ação em até 24h']];
const date = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const filterClass = 'h-10 w-full min-w-0 rounded-lg border border-edge-default bg-surface-raised px-3 text-sm text-content-primary';
const labelFor = (items, id) => items.find(([value]) => value === id)?.[1] || id;

function FilterChip({ label, onRemove }) {
  return <button type="button" onClick={onRemove} aria-label={'Remover filtro: ' + label} className="inline-flex max-w-full items-center gap-2 rounded-md border border-edge-default bg-surface-subtle px-2.5 py-1.5 text-xs font-medium text-content-primary transition-colors hover:border-edge-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span className="truncate">{label}</span><X className="h-3.5 w-3.5 shrink-0 text-content-secondary" /></button>;
}

const demandTabStyles = {
  aberta: { icon: ClipboardList, color: 'text-red-600 dark:text-red-400', background: 'bg-red-50/70 dark:bg-red-950/30', badge: 'bg-red-600 text-white' },
  triagem: { icon: ClipboardCheck, color: 'text-blue-600 dark:text-blue-400', background: 'bg-blue-50/70 dark:bg-blue-950/30', badge: 'bg-blue-600 text-white' },
  programada: { icon: CalendarDays, color: 'text-violet-600 dark:text-violet-400', background: 'bg-violet-50/70 dark:bg-violet-950/30', badge: 'bg-violet-600 text-white' },
  em_andamento: { icon: Settings, color: 'text-blue-600 dark:text-blue-400', background: 'bg-blue-50/70 dark:bg-blue-950/30', badge: 'bg-blue-600 text-white' },
  aguardando_informacao: { icon: Info, color: 'text-amber-600 dark:text-amber-400', background: 'bg-amber-50/60 dark:bg-amber-950/30', badge: 'bg-amber-600 text-white' },
  aguardando_recurso: { icon: Coins, color: 'text-orange-600 dark:text-orange-400', background: 'bg-orange-50/60 dark:bg-orange-950/30', badge: 'bg-orange-600 text-white' },
  aguardando_confirmacao: { icon: ClipboardCopy, color: 'text-violet-600 dark:text-violet-400', background: 'bg-violet-50/70 dark:bg-violet-950/30', badge: 'bg-violet-600 text-white' },
  concluida: { icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', background: 'bg-emerald-50/70 dark:bg-emerald-950/30', badge: 'bg-emerald-600 text-white' },
  recusada: { icon: X, color: 'text-red-600 dark:text-red-400', background: 'bg-red-50/40 dark:bg-red-950/20', badge: 'bg-red-600 text-white' },
  cancelada: { icon: Ban, color: 'text-slate-500 dark:text-slate-400', background: 'bg-slate-50 dark:bg-slate-900/40', badge: 'bg-slate-600 text-white' },
};

function DemandStatusTabs({ status, counts, onSelect }) {
  const navRef = useRef(null);
  const measurementRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(demandTabs.length);
  const tabClass = 'relative flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-t-xl border border-edge-subtle px-2 py-2.5 text-[10px] font-semibold';
  const tabTone = (key) => demandTabStyles[key].background + ' ' + (status === key ? demandTabStyles[key].color + ' after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:bg-current' : 'text-content-secondary hover:text-content-primary');
  const countBadge = (key) => <span className={'inline-flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1 text-[10px] font-bold tabular-nums ' + (counts[key] > 0 ? demandTabStyles[key].badge : 'bg-surface-subtle text-content-tertiary')}>{counts[key]?.toLocaleString('pt-BR') ?? '—'}</span>;
  const tabContent = (key, label) => {
    const Icon = demandTabStyles[key].icon;
    return <><Icon aria-hidden="true" className={'h-4 w-4 shrink-0 ' + demandTabStyles[key].color} /><span className="whitespace-nowrap">{label}</span>{countBadge(key)}</>;
  };

  useLayoutEffect(() => {
    const nav = navRef.current;
    const measurement = measurementRef.current;
    const measure = () => {
      const widths = Array.from(measurement.children, (element) => element.getBoundingClientRect().width);
      const moreWidth = widths.pop();
      const gap = 8;
      const totalWidth = widths.reduce((sum, width) => sum + width, 0) + gap * (widths.length - 1);
      if (totalWidth <= nav.clientWidth) { setVisibleCount(demandTabs.length); return; }
      let used = moreWidth;
      let count = 0;
      for (const width of widths) {
        if (used + gap + width > nav.clientWidth) break;
        used += gap + width; count++;
      }
      setVisibleCount(count);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    Array.from(measurement.children).forEach((element) => observer.observe(element));
    return () => observer.disconnect();
  }, [counts, status]);

  const hiddenTabs = demandTabs.slice(visibleCount);
  const hiddenActive = hiddenTabs.some(([key]) => key === status);
  return <nav ref={navRef} aria-label="Filas de ordens de serviço" className="relative mt-5 flex min-w-0 items-stretch gap-2 overflow-hidden border-b border-edge-subtle">
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-hidden"><div ref={measurementRef} className="invisible flex w-max gap-2">{demandTabs.map(([key, label]) => <span key={key} className={tabClass + ' ' + tabTone(key)}>{tabContent(key, label)}</span>)}<span className={tabClass}><span>Mais</span><ChevronDown className="h-3.5 w-3.5" /></span></div></div>
    {demandTabs.slice(0, visibleCount).map(([key, label]) => <button key={key} type="button" aria-pressed={status === key} onClick={() => onSelect(key)} className={tabClass + ' grow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ' + tabTone(key)}>{tabContent(key, label)}</button>)}
    {hiddenTabs.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" aria-label={hiddenActive ? 'Mais etapas: ' + labelFor(demandTabs, status) : 'Mais etapas'} aria-pressed={hiddenActive} title={hiddenActive ? labelFor(demandTabs, status) : undefined} className={tabClass + ' focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ' + (hiddenActive ? tabTone(status) : 'bg-surface-subtle text-content-secondary')}><span>Mais</span><ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger><DropdownMenuContent align="start" className="min-w-64">{hiddenTabs.map(([key, label]) => <DropdownMenuItem key={key} onSelect={() => onSelect(key)} className={'gap-2 ' + (status === key ? demandTabStyles[key].background + ' font-semibold' : '')}>{tabContent(key, label)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
  </nav>;
}

function DemandDeadline({ demand }) {
  const due = demand.prazo_em ? new Date(demand.prazo_em) : null;
  const open = OPEN_DEMAND_STATUSES.includes(demand.status);
  const today = due && open && due.toDateString() === new Date().toDateString();
  const late = due && open && due < new Date();
  return <div className="text-xs tabular-nums">
    {today ? <><p className="font-semibold text-content-primary">HOJE</p><p className="mt-1 text-content-secondary">{due.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</p></> : <><p className={late ? 'font-semibold text-danger' : 'text-content-primary'}>{date(demand.prazo_em)}</p>{late && <p className="mt-1 text-danger">Atrasada</p>}</>}
    {demand.proxima_acao && <p className="mt-1 break-words text-content-secondary">{demand.proxima_acao} · {date(demand.proxima_acao_em)}</p>}
  </div>;
}

export default function MunicipalDemandsPage({ view = 'list' }) {
  const { id } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const context = useMunicipalityWorkspace();
  const [items, setItems] = useState([]);
  const [summary, setSummary] = useState(null);
  const [dueTodayCount, setDueTodayCount] = useState(null);
  const [statusCounts, setStatusCounts] = useState({});
  const [countsError, setCountsError] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [exportOpen, setExportOpen] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const generation = useRef(0);
  const countsGeneration = useRef(0);
  const page = view === 'overview' ? 1 : Math.max(1, Number(params.get('pagina')) || 1);
  const requestedPageSize = Number(params.get('por_pagina'));
  const pageSize = view === 'overview' ? 6 : PAGE_SIZES.includes(requestedPageSize) ? requestedPageSize : 10;
  const sort = Object.hasOwn(SORTS, params.get('ordem')) ? params.get('ordem') : 'recentes';
  const query = params.get('q') || '';
  const status = params.get('status') === 'all' ? 'all' : DEMAND_STATUSES.some(([key]) => key === params.get('status')) ? params.get('status') : 'aberta';
  const priority = params.get('prioridade') || 'all';
  const channel = params.get('secretaria') || 'all';
  const category = params.get('categoria') || 'all';
  const queue = params.get('fila') || 'all';
  const overdue = params.get('atrasadas') === '1';
  const linked = params.get('vinculadas') === '1';
  const dueToday = params.get('vencem_hoje') === '1';
  const drawerId = view === 'form' ? id || 'nova' : params.get('demanda');
  const sourceReportId = drawerId === 'nova' ? params.get('bronca') : null;
  const sourcePoleId = drawerId === 'nova' ? params.get('poste') : null;

  const requestForFilters = useCallback((requestedStatus, { head = false } = {}) => {
    return municipalDemandsQuery(supabase, {
      municipalityId: context.municipality.id, userId: context.userId, enabledCategoryIds: context.enabledCategoryIds, assignedOnly: context.isElectrician,
      ...(view === 'overview' ? { sort: 'recentes' } : { status: requestedStatus, priority, channel, category, queue, overdue, linked, dueToday, query, sort }),
    }, { head });
  }, [context.municipality?.id, context.userId, context.enabledCategoryIds, context.isElectrician, view, priority, channel, category, queue, overdue, linked, dueToday, query, sort]);

  const loadCounts = useCallback(async () => {
    if (!context.municipality?.id || view === 'overview') return;
    const token = ++countsGeneration.current;
    setStatusCounts({}); setCountsError(false);
    try {
      const counts = await Promise.all(DEMAND_STATUSES.map(async ([key]) => {
        const { count, error: failure } = await requestForFilters(key, { head: true });
        if (failure) throw failure;
        return [key, count ?? 0];
      }));
      if (token === countsGeneration.current) setStatusCounts(Object.fromEntries(counts));
    } catch { if (token === countsGeneration.current) setCountsError(true); }
  }, [context.municipality?.id, view, requestForFilters]);

  const load = useCallback(async () => {
    if (!context.municipality?.id) return;
    const token = ++generation.current;
    setLoading(true); setError('');
    try {
      const [result, summaryResult, dueTodayResult] = await Promise.all([
        requestForFilters(status).range((page - 1) * pageSize, page * pageSize - 1),
        supabase.rpc('resumo_demandas_municipais', { p_prefeitura: context.municipality.id }).maybeSingle(),
        municipalDemandsQuery(supabase, { municipalityId: context.municipality.id, enabledCategoryIds: context.enabledCategoryIds, statuses: OPEN_DEMAND_STATUSES, dueToday: true }, { head: true }),
      ]);
      if (token !== generation.current) return;
      if (result.error || summaryResult.error) throw result.error || summaryResult.error;
      setItems(result.data || []); setTotal(result.count || 0); setSummary(summaryResult.data);
      setDueTodayCount(dueTodayResult.error ? null : dueTodayResult.count ?? 0);
      const lastPage = Math.max(1, Math.ceil((result.count || 0) / pageSize));
      if (view !== 'overview' && page > lastPage) setParams((current) => { const next = new URLSearchParams(current); next.set('pagina', String(lastPage)); return next; }, { replace: true });
    } catch (failure) { if (token === generation.current) setError(failure.message); }
    finally { if (token === generation.current) setLoading(false); }
  }, [context.municipality?.id, context.enabledCategoryIds, page, pageSize, status, view, setParams, requestForFilters]);
  useEffect(() => {
    const requestGeneration = generation;
    const timer = window.setTimeout(load, query ? 250 : 0);
    return () => { window.clearTimeout(timer); requestGeneration.current++; };
  }, [load, query]);
  useEffect(() => {
    const requestGeneration = countsGeneration;
    const timer = window.setTimeout(loadCounts, query ? 250 : 0);
    return () => { window.clearTimeout(timer); requestGeneration.current++; };
  }, [loadCounts, query]);
  useEffect(() => { setSelectedIds([]); setExportOpen(false); }, [context.municipality?.id]);

  const change = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value && value !== 'all') next.set(key, value); else next.delete(key);
    if (key !== 'pagina' && key !== 'demanda') next.delete('pagina');
    return next;
  }, { replace: true });
  const closeDrawer = () => {
    if (view === 'form') { navigate('/prefeitura/demandas', { replace: true }); return; }
    setParams((current) => { const next = new URLSearchParams(current); ['demanda','bronca','poste'].forEach((key) => next.delete(key)); return next; }, { replace: true });
  };
  const saved = () => { closeDrawer(); load(); loadCounts(); };

  if (context.loading) return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!context.municipality) return <div className="page-shell-fluid py-10"><h1 className="text-2xl font-bold">Acesso institucional necessário</h1><p className="mt-2 text-sm text-content-secondary">{context.error || 'Sua conta não está vinculada a uma prefeitura ativa.'}</p></div>;
  if (view === 'form') return <div className="page-shell-fluid h-full min-h-0 min-w-0 py-3 sm:py-5" aria-label="Cadastro da ordem de serviço"><MunicipalDemandDrawer open inline demandId={drawerId} reportId={sourceReportId} poleId={sourcePoleId} context={context} onClose={closeDrawer} onSaved={saved} onRemoved={saved} /></div>;
  const hasFilters = Boolean(query || priority !== 'all' || channel !== 'all' || category !== 'all' || queue !== 'all' || overdue || linked || dueToday);
  const clearFilters = () => setParams((current) => { const next = new URLSearchParams(current); ['q','prioridade','secretaria','categoria','fila','atrasadas','vinculadas','vencem_hoje','pagina'].forEach((key) => next.delete(key)); return next; }, { replace: true });
  const metrics = [
    ['Total de demandas','total',ClipboardList,'/prefeitura/demandas'],
    ['Abertas','abertas',ClipboardList,'/prefeitura/demandas?status=aberta'],
    ['Em atendimento','em_andamento',Clock3,'/prefeitura/demandas?status=em_andamento'],
    ['Ordens concluídas','concluidas',CheckCircle2,'/prefeitura/demandas?status=concluida','success'],
    ['Atrasadas','atrasadas',AlertCircle,'/prefeitura/demandas?atrasadas=1','alert'],
    ['Conferência interna','aguardando_confirmacao',Clock3,'/prefeitura/demandas?status=aguardando_confirmacao'],
    ['Sem responsável','sem_responsavel',Users,'/prefeitura/demandas?fila=sem_responsavel'],
    ['Precisam de revisão','revisao_pendente',AlertCircle,'/prefeitura/demandas?fila=revisao','alert'],
  ];
  const statusBadge = (demand) => <span className={'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ' + (DEMAND_TONES[demand.status] || 'bg-surface-subtle text-content-secondary')}><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" />{demand.status === 'triagem' ? 'Triagem' : labelFor(DEMAND_STATUSES,demand.status)}</span>;
  const selectTab = (key) => setParams((current) => {
    const next = new URLSearchParams(current);
    ['aba', 'pagina'].forEach((filter) => next.delete(filter));
    if (next.get('fila') === 'em_atendimento') next.delete('fila');
    next.set('status', key);
    return next;
  }, { replace: true });
  const toggleSelection = (demandId) => setSelectedIds((current) => current.includes(demandId) ? current.filter((id) => id !== demandId) : [...current, demandId]);
  const allSelected = items.length > 0 && items.every((item) => selectedIds.includes(item.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const pageNumbers = [...new Set([1, pages, ...Array.from({ length: 5 }, (_, index) => page + index - 2).filter((number) => number >= 1 && number <= pages)])].sort((a, b) => a - b);
  const pagination = pageNumbers.flatMap((number, index) => index && number - pageNumbers[index - 1] > 1 ? ['gap-' + number, number] : [number]);
  const filterOptions = [
    ['Secretaria', 'secretaria', channel, context.channels.map((item) => [item.id, item.nome])],
    ['Categoria', 'categoria', category, context.categories.map((item) => [item.id, item.name])],
    ['Prioridade', 'prioridade', priority, DEMAND_PRIORITIES],
  ];
  const activeFilters = filterOptions.filter(([, , value]) => value !== 'all').map(([, key, value, options]) => ({ key, label: labelFor(options, value) }));
  if (queue !== 'all') activeFilters.push({ key: 'fila', label: queue === 'em_atendimento' ? 'Em andamento' : labelFor(queueOptions, queue) });
  if (overdue) activeFilters.push({ key: 'atrasadas', label: 'Atrasadas' });
  if (linked) activeFilters.push({ key: 'vinculadas', label: 'Solicitação vinculada' });
  if (dueToday) activeFilters.push({ key: 'vencem_hoje', label: 'Vencem hoje' });
  const listMetrics = [
    ['Em andamento', summary?.em_andamento, Clock3, '/prefeitura/demandas?status=all&fila=em_atendimento', 'bg-status-progressBg text-status-progressFg', 'border-t-status-progressFg', 'Serviços em atendimento'],
    ['Atrasadas', summary?.atrasadas, AlertCircle, '/prefeitura/demandas?status=all&atrasadas=1', 'bg-danger-subtleBg text-danger-subtleFg', 'border-t-danger', 'Precisam de atenção'],
    ['Sem responsável', summary?.sem_responsavel, Users, '/prefeitura/demandas?status=all&fila=sem_responsavel', 'bg-status-pendingBg text-status-pendingFg', 'border-t-status-pendingFg', 'Aguardando atribuição'],
    ['Vencem hoje', dueTodayCount, CalendarDays, '/prefeitura/demandas?status=all&vencem_hoje=1', 'bg-brand-subtleBg text-brand-subtleFg', 'border-t-brand', 'Na agenda de hoje'],
  ];
  return <div className="page-shell-fluid min-w-0 pb-10 pt-6 text-content-primary sm:pt-8" style={view !== 'overview' ? { paddingInline: 'clamp(1rem, 2vw, 2rem)' } : undefined}>
    <Helmet><title>{view === 'overview' ? 'Visão geral' : 'Demandas'} | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    {view === 'overview' ? <MunicipalPageHeader eyebrow="Gestão municipal" title="Visão geral" description="Organize os serviços da prefeitura, com responsáveis, prazos e execução." action={context.canEdit && <Button onClick={() => navigate('/prefeitura/demandas/nova')}><Plus className="mr-2 h-4 w-4" />Nova ordem de serviço</Button>} /> : <header className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3"><span className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-brand/10 bg-brand-subtleBg text-brand sm:flex"><ClipboardList className="h-6 w-6" /></span><div className="min-w-0"><p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand">Operação municipal</p><h1 className="font-display text-2xl font-bold tracking-tight">Demandas <span className="text-content-secondary">·</span> Ordens de serviço</h1><p className="mt-2 text-sm text-content-secondary">Organize e acompanhe os serviços da prefeitura.</p></div></div>
      <div className="flex shrink-0 flex-wrap items-center gap-2"><Button variant="outline" className="border-edge-default bg-surface-raised text-content-primary" onClick={() => setExportOpen(true)} disabled={loading}><Download className="mr-2 h-4 w-4" />{selectedIds.length ? 'Exportar selecionadas' : 'Exportar relatório'}</Button>{context.canEdit && <Button onClick={() => navigate('/prefeitura/demandas/nova')}><Plus className="mr-2 h-4 w-4" />Nova ordem</Button>}</div>
    </header>}
    {view === 'overview' ? <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores de demandas">{metrics.map(([label,key,Icon,to,tone]) => <MunicipalMetricCard key={key} label={label} value={summary?.[key]} icon={Icon} to={to} tone={tone} />)}</section> : <>
      <section aria-label="Indicadores de demandas" className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        {listMetrics.map(([label, value, Icon, to, tone, accent, hint]) => <Link key={label} to={to} className={'group flex min-h-[76px] min-w-0 items-center gap-2.5 rounded-xl border border-t-2 border-edge-subtle bg-surface-raised p-3 shadow-sm transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + accent}>
          <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ' + tone}><Icon className="h-4 w-4" /></span>
          <span className="min-w-0 flex-1"><span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5"><strong className="text-2xl font-bold tabular-nums leading-none tracking-tight">{value?.toLocaleString('pt-BR') ?? '—'}</strong><span className="text-xs font-semibold sm:text-sm">{label}</span></span><span className="mt-1 hidden text-[11px] leading-4 text-content-secondary sm:block">{hint}</span></span>
          <ArrowRight className="hidden h-3.5 w-3.5 shrink-0 text-content-tertiary transition-transform group-hover:translate-x-0.5 group-hover:text-content-primary sm:block" />
        </Link>)}
      </section>
      <DemandStatusTabs status={status} counts={statusCounts} onSelect={selectTab} />
    </>}
    {view !== 'overview' && countsError && <p role="status" className="mt-2 text-xs text-content-secondary">Não foi possível carregar as quantidades. <button type="button" onClick={loadCounts} className="font-medium text-brand underline">Tentar novamente</button></p>}
    {view === 'overview' && <nav aria-label="Acesso rápido" className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{[
      ['Minha fila','Atendimentos atribuídos a você.','/prefeitura/demandas?fila=minhas',Users],
      ['Solicitações da cidade','Vincule os relatos ao atendimento municipal.','/prefeitura/broncas',Link2],
      ['Iluminação pública','Consulte postes e abra uma manutenção.','/prefeitura/iluminacao',Clock3],
    ].map(([title,description,to,Icon]) => <Link key={to} to={to} className="group flex min-w-0 items-center gap-4 rounded-2xl border border-edge-subtle bg-surface-raised p-4 hover:border-brand/40"><Icon className="h-5 w-5 shrink-0 text-brand" /><span className="min-w-0 flex-1"><strong className="text-sm">{title}</strong><span className="mt-1 block text-xs leading-5 text-content-secondary">{description}</span></span><ArrowRight className="h-4 w-4 shrink-0 text-content-tertiary" /></Link>)}</nav>}
    <section className="mt-4 min-w-0 overflow-hidden rounded-xl border border-edge-default bg-surface-raised shadow-sm">
      <div className="space-y-4 border-b border-edge-default p-4 sm:p-5">
        {view === 'overview' ? <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">Atendimentos recentes</h2><p className="mt-1 text-xs text-content-secondary">{total.toLocaleString('pt-BR')} resultados no seu escopo de acesso</p></div><Button asChild variant="outline" size="sm"><Link to="/prefeitura/demandas">Ver todas <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div> : <>
          <h2 className="sr-only">Fila de atendimento</h2>
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <label className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto"><span className="sr-only">Buscar demandas</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-secondary" /><Input value={query} onChange={(event) => change('q',event.target.value)} placeholder="Buscar protocolo, atendimento, endereço…" className="border-edge-default bg-surface-raised pl-9 text-sm placeholder:text-content-secondary" /></label>
            <Popover><PopoverTrigger asChild><Button variant="outline" className="gap-2 border-edge-default bg-surface-raised text-content-primary"><Filter className="h-4 w-4" />Filtros{activeFilters.length > 0 && <span className="rounded bg-surface-subtle px-1.5 py-0.5 text-xs tabular-nums">{activeFilters.length}</span>}</Button></PopoverTrigger><PopoverContent align="end" className="max-w-[calc(100vw-2rem)] space-y-3 border-edge-default">
              <p className="text-sm font-semibold">Filtrar ordens de serviço</p>
              {filterOptions.map(([label, key, value, options]) => <label key={key} className="block text-xs font-medium">{label}<select className={filterClass + ' mt-1'} value={value} onChange={(event) => change(key, event.target.value)}><option value="all">Todas</option>{options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>)}
              <label className="block text-xs font-medium">Fila<select className={filterClass + ' mt-1'} value={queue} onChange={(event) => change('fila', event.target.value)}>{queueOptions.map(([value,label]) => <option key={value} value={value}>{label}{value === 'sem_responsavel' ? ` (${summary?.sem_responsavel ?? 0})` : value === 'revisao' ? ` (${summary?.revisao_pendente ?? 0})` : ''}</option>)}</select></label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={overdue} onChange={(event) => change('atrasadas',event.target.checked ? '1' : '')} />Prazo vencido</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={linked} onChange={(event) => change('vinculadas',event.target.checked ? '1' : '')} />Com solicitação vinculada</label>
              <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={dueToday} onChange={(event) => change('vencem_hoje',event.target.checked ? '1' : '')} />Vencem hoje</label>
            </PopoverContent></Popover>
            <label className="relative ml-auto"><span className="sr-only">Ordenar demandas</span><select value={sort} onChange={(event) => change('ordem', event.target.value)} className="h-10 cursor-pointer appearance-none rounded-lg border border-edge-default bg-surface-raised pl-3 pr-9 text-sm text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><option value="recentes">Recentes</option><option value="antigas">Antigas</option><option value="prazo">Menor prazo</option></select><ArrowUpDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-content-secondary" /></label>
          </div>
          {hasFilters && <div className="flex min-w-0 flex-wrap items-center gap-2">{activeFilters.map(({ key, label }) => <FilterChip key={key} label={label} onRemove={() => change(key, '')} />)}<button type="button" onClick={clearFilters} className="ml-auto rounded px-1 py-1.5 text-xs font-medium text-content-secondary underline-offset-4 hover:text-content-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Limpar filtros</button></div>}
          {selectedIds.length > 0 && <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-xs font-medium text-content-secondary">{selectedIds.length} {selectedIds.length === 1 ? 'ordem selecionada' : 'ordens selecionadas'} entre páginas e filtros.</p><Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setSelectedIds([])}>Limpar seleção</Button></div>}
        </>}
      </div>
      {error && <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-sm text-danger"><p>{error}</p><Button variant="outline" size="sm" onClick={load}>Tentar novamente</Button></div>}
      {loading ? <div className="flex h-48 items-center justify-center" role="status" aria-label="Carregando demandas"><Loader2 className="h-6 w-6 animate-spin text-content-secondary" /></div> : !error && !items.length ? <MunicipalEmptyState title={hasFilters ? 'Nenhum resultado para estes filtros' : view === 'overview' ? 'Nenhuma ordem de serviço cadastrada' : 'Nenhuma ordem nesta etapa'} description={hasFilters ? 'Tente outro filtro ou termo de busca.' : view === 'overview' ? 'Cadastre o serviço que a prefeitura precisa realizar.' : `Não há ordens na etapa “${labelFor(DEMAND_STATUSES, status)}”. Consulte outra aba ou cadastre um serviço.`} action={hasFilters ? <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button> : context.canEdit ? <Button onClick={() => navigate('/prefeitura/demandas/nova')}>Criar ordem de serviço</Button> : null} /> : !error && <>
        <div className="hidden min-w-0 xl:block"><table className="w-full table-fixed text-left text-sm"><caption className="sr-only">Ordens de serviço da prefeitura. Clique em uma linha para abrir os detalhes.</caption><colgroup>{view !== 'overview' && <col className="w-11" />}<col className="w-[14%]" /><col /><col className="w-[19%]" /><col className="w-[8%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-[11%]" /><col className="w-12" /></colgroup><thead className="border-b border-edge-default bg-surface-subtleHover text-xs text-content-primary"><tr>{view !== 'overview' && <th scope="col" className="px-3 py-3.5"><input type="checkbox" aria-label="Selecionar ordens desta página" checked={allSelected} ref={(input) => { if (input) input.indeterminate = items.some((item) => selectedIds.includes(item.id)) && !allSelected; }} onChange={(event) => setSelectedIds((current) => selectPageRecords(current, items.map((item) => item.id), event.target.checked))} className="h-4 w-4 accent-brand" /></th>}{['Protocolo','Atendimento','Responsável','Prior.','Etapa','Data de abertura','Prazo'].map((label) => <th key={label} scope="col" className="px-3 py-3.5 font-semibold">{label}</th>)}<th scope="col" className="px-2 py-3.5"><span className="sr-only">Ações</span></th></tr></thead><tbody className="divide-y divide-edge-default">{items.map((demand) => <tr key={demand.id} tabIndex={0} aria-label={'Abrir demanda ' + demand.protocolo + ': ' + demand.titulo} onClick={() => change('demanda', demand.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); change('demanda', demand.id); } }} className={'cursor-pointer align-top transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ' + (selectedIds.includes(demand.id) ? 'bg-surface-subtle' : '')}>
          {view !== 'overview' && <td className="cursor-default px-3 py-5" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={'Selecionar ' + demand.protocolo} checked={selectedIds.includes(demand.id)} onChange={() => toggleSelection(demand.id)} className="h-4 w-4 accent-brand" /></td>}
          <td className="break-words px-3 py-5"><span className="text-left text-xs font-semibold text-brand">{demand.protocolo}</span>{demand.report_id && <p className="mt-1.5 flex items-center gap-1 text-xs text-content-secondary"><Link2 className="h-3 w-3 shrink-0" />Solicitação vinculada</p>}</td>
          <td className="break-words px-3 py-5"><span className="text-left text-sm font-semibold">{demand.titulo}</span><p className="mt-1.5 flex items-start gap-1 text-xs text-content-secondary"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span>{[demand.category?.name,demand.bairro].filter(Boolean).join(' · ') || demand.endereco || 'Local não informado'}</span></p>{demand.revisao_pendente && <p className="mt-1 text-xs font-semibold text-danger">Manifestação precisa de revisão</p>}</td>
          <td className="break-words px-3 py-5"><p className="text-sm font-medium">{demand.secretaria?.nome || 'Aguardando distribuição'}</p><p className="mt-1.5 text-xs text-content-secondary">{demand.responsavel?.name || 'Sem responsável'}</p></td>
          <td className="px-3 py-5"><span className={'text-xs font-medium ' + (demand.prioridade === 'urgente' ? 'text-danger' : 'text-content-primary')}>{labelFor(DEMAND_PRIORITIES,demand.prioridade)}</span></td>
          <td className="break-words px-3 py-5">{statusBadge(demand)}</td>
          <td className="px-3 py-5 text-xs tabular-nums text-content-secondary">{date(demand.created_at)}</td>
          <td className="break-words px-3 py-5"><DemandDeadline demand={demand} /></td>
          <td className="cursor-default px-2 py-4" onClick={(event) => event.stopPropagation()}><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-8 w-8 text-content-secondary hover:text-content-primary" aria-label={'Ações da ordem ' + demand.protocolo}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => change('demanda', demand.id)}>Abrir ordem de serviço</DropdownMenuItem>{demand.report_id && <DropdownMenuItem asChild><Link to={'/prefeitura/broncas?bronca=' + demand.report_id}>Ver solicitação vinculada</Link></DropdownMenuItem>}</DropdownMenuContent></DropdownMenu></td>
        </tr>)}</tbody></table></div>
        <div className="divide-y divide-edge-default xl:hidden">{items.map((demand) => <article key={demand.id} className={'p-4 ' + (selectedIds.includes(demand.id) ? 'bg-surface-subtle' : '')}>
          <div className="flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-3">{view !== 'overview' && <input type="checkbox" aria-label={'Selecionar ' + demand.protocolo} checked={selectedIds.includes(demand.id)} onChange={() => toggleSelection(demand.id)} className="h-4 w-4 accent-brand" />}<button type="button" onClick={() => change('demanda', demand.id)} className="rounded text-xs font-semibold focus-visible:ring-2 focus-visible:ring-brand">{demand.protocolo}</button></div>{statusBadge(demand)}</div>
          <button type="button" onClick={() => change('demanda', demand.id)} className="mt-3 block w-full rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"><span className="block break-words text-sm font-semibold">{demand.titulo}</span><span className="mt-1.5 flex items-start gap-1 text-xs text-content-secondary"><MapPin className="h-3.5 w-3.5 shrink-0" />{[demand.category?.name, demand.bairro].filter(Boolean).join(' · ') || demand.endereco || 'Local não informado'}</span><span className="mt-3 block text-xs font-medium">{demand.secretaria?.nome || 'Aguardando distribuição'}</span><span className="mt-1 block text-xs text-content-secondary">{demand.responsavel?.name || 'Sem responsável'}</span></button>
          <p className={'mt-3 text-xs ' + (demand.prioridade === 'urgente' ? 'font-semibold text-danger' : 'text-content-secondary')}>Prioridade: {labelFor(DEMAND_PRIORITIES, demand.prioridade)}</p>
          <div className="mt-3 grid grid-cols-2 gap-4 border-t border-edge-subtle pt-3 text-xs">
            <div><p className="font-semibold text-content-secondary">Data de abertura</p><p className="mt-1 tabular-nums text-content-primary">{date(demand.created_at)}</p></div>
            <div><p className="font-semibold text-content-secondary">Prazo</p><div className="mt-1"><DemandDeadline demand={demand} /></div></div>
          </div>
          {demand.report_id && <p className="mt-2 flex items-center gap-1 text-xs text-content-secondary"><Link2 className="h-3 w-3" />Solicitação vinculada</p>}{demand.revisao_pendente && <p className="mt-2 text-xs font-semibold text-danger">Precisa de revisão</p>}
        </article>)}</div>
      </>}
      {view !== 'overview' && <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-4 border-t border-edge-default p-4 text-xs text-content-secondary sm:p-5">
        <p aria-live="polite">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} de ${total.toLocaleString('pt-BR')}` : '0 resultados'}</p>
        <div className="order-last flex w-full items-center justify-center gap-1 sm:order-none sm:w-auto"><Button variant="ghost" size="icon" className="h-8 w-8 text-content-secondary" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => change('pagina', String(page - 1))}><ChevronLeft className="h-4 w-4" /></Button>{pagination.map((number) => typeof number === 'string' ? <span key={number} className="px-1" aria-hidden="true">…</span> : <button key={number} type="button" aria-label={'Página ' + number} aria-current={page === number ? 'page' : undefined} disabled={loading} onClick={() => change('pagina', String(number))} className={'flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 ' + (page === number ? 'border border-edge-default bg-surface-subtle font-semibold text-content-primary' : 'hover:bg-surface-subtle hover:text-content-primary')}>{number}</button>)}<Button variant="ghost" size="icon" className="h-8 w-8 text-content-secondary" aria-label="Próxima página" disabled={loading || page >= pages} onClick={() => change('pagina', String(page + 1))}><ChevronRight className="h-4 w-4" /></Button></div>
        <label className="flex items-center justify-end gap-2"><span className="sr-only">Itens por página</span><select value={pageSize} onChange={(event) => change('por_pagina', event.target.value)} className="h-9 rounded-lg border border-edge-default bg-surface-raised px-2 text-xs text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" disabled={loading}>{PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select><span>/ página</span></label>
      </nav>}
    </section>
    {exportOpen && <MunicipalExportDialog kind="demands" context={context} selectedIds={selectedIds} initialFilters={{ statuses: status === 'all' ? [] : [status], priority, channel, category, queue, overdue, dueToday, query, sort, orderLink: linked ? 'linked' : 'all' }} onClose={() => setExportOpen(false)} />}
    <MunicipalDemandDrawer open={Boolean(drawerId)} demandId={drawerId} reportId={sourceReportId} poleId={sourcePoleId} context={context} onClose={closeDrawer} onSaved={saved} onRemoved={saved} />
  </div>;
}
