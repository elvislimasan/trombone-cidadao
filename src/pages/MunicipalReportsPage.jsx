import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, LayoutGrid, LayoutList, Loader2, LockKeyhole, Map as MapIcon, MapPin, Megaphone, MoreHorizontal, Search, Signpost, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import MunicipalReportDrawer from '@/components/municipality/MunicipalReportDrawer';
import MunicipalDemandDrawer from '@/components/municipality/MunicipalDemandDrawer';
import MunicipalServiceOrderDialog from '@/components/municipality/MunicipalServiceOrderDialog';
import MunicipalReportCreateDialog from '@/components/municipality/MunicipalReportCreateDialog';
import { selectPageRecords } from '@/lib/municipalExport';
import AgencyReportImage from '@/components/municipality/AgencyReportImage';
import { MunicipalEmptyState, MunicipalPageHeader } from '@/components/municipality/MunicipalPageUi';
import Icon, { categoryIconName } from '@/design-system/icons';
import { supabase } from '@/lib/customSupabaseClient';
import { loadMunicipalReportFacets, loadMunicipalReportPage, REPORT_AGES, REPORT_PAGE_SIZES, REPORT_PHASES, REPORT_STATUSES, reportAge, reportPageNumbers } from '@/lib/municipalReports';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';
import { TIPOS_DE_PROBLEMA_ESGOTO, TIPOS_DE_PROBLEMA_ILUMINACAO, rotuloDoTipoDeProblema } from '@/lib/reportCategoryFields';
import { confirmApp } from '@/lib/appConfirm';
import { showAppError, showAppNotice } from '@/lib/appError';

const ReportsMap = lazy(() => import('@/components/municipality/MunicipalReportsMap'));
const date = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const time = (value) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const statusLabels = Object.fromEntries(REPORT_STATUSES);
const statusTone = {
  pending: 'border-amber-200 bg-amber-100 text-amber-900 dark:border-amber-700 dark:bg-amber-950/60 dark:text-amber-200',
  'in-progress': 'border-blue-200 bg-blue-100 text-blue-900 dark:border-blue-700 dark:bg-blue-950/60 dark:text-blue-200',
  pending_resolution: 'border-violet-200 bg-violet-100 text-violet-900 dark:border-violet-700 dark:bg-violet-950/60 dark:text-violet-200',
  resolved: 'border-emerald-200 bg-emerald-100 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-200',
};
const statusDot = { pending: 'bg-amber-600 dark:bg-amber-300', 'in-progress': 'bg-blue-600 dark:bg-blue-300', pending_resolution: 'bg-violet-600 dark:bg-violet-300', resolved: 'bg-emerald-600 dark:bg-emerald-300' };
const categoryTones = {
  iluminacao: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  buracos: 'bg-surface-subtle text-content-secondary',
  esgoto: 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  poda: 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300',
  limpeza: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  sinalizacao: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  'vazamento-de-agua': 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
};
const primaryCategoryIds = ['iluminacao', 'buracos', 'esgoto', 'poda', 'limpeza', 'sinalizacao'];
const filterKeys = ['q', 'categoria', 'subtipo', 'idade', 'bairro', 'status', 'sem_ordem', 'de', 'ate'];
const advancedFilterKeys = ['idade', 'bairro', 'de', 'ate'];
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(new Date(value + 'T00:00:00').getTime()) ? value : '';
const selectClass = 'h-9 min-w-0 rounded-lg border border-edge-subtle bg-surface-raised px-2.5 text-xs text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

function CategoryIcon({ id, ...props }) {
  return id === 'sinalizacao' ? <Signpost className="h-4 w-4 shrink-0" {...props} /> : <Icon name={categoryIconName(id)} size={16} className="shrink-0" {...props} />;
}

function CategoryBadge({ report }) {
  return <span className="flex min-w-0 flex-wrap items-center gap-1"><span className={'inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ' + (categoryTones[report.category_id] || 'bg-surface-subtle text-content-secondary')}>
    <CategoryIcon id={report.category_id} /><span className="truncate">{report.category?.name || 'Sem categoria'}</span>
  </span></span>;
}

function StatusBadge({ status }) {
  return <span className={'inline-flex max-w-full items-center gap-1.5 rounded-full border px-2.5 py-1 text-left text-[11px] font-semibold leading-4 ' + (statusTone[status] || 'border-edge-subtle bg-surface-subtle text-content-secondary')}><span aria-hidden="true" className={'h-1.5 w-1.5 shrink-0 rounded-full ' + (statusDot[status] || 'bg-current')} />{statusLabels[status] || status || 'Sem status'}</span>;
}

function AgeBadge({ createdAt }) {
  const age = reportAge(createdAt);
  const tone = age > 30 ? 'bg-danger-subtleBg text-danger-subtleFg' : age > 15 ? 'bg-status-pendingBg text-status-pendingFg' : 'bg-surface-subtle text-content-secondary';
  return <span className={'inline-flex whitespace-nowrap rounded-lg px-2 py-1 text-[11px] font-semibold tabular-nums ' + tone}>{age === null ? '—' : age === 0 ? 'Hoje' : age + (age === 1 ? ' dia' : ' dias')}</span>;
}

export default function MunicipalReportsPage({ view = 'list' }) {
  const { reportId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const context = useMunicipalityWorkspace();
  const [reports, setReports] = useState([]);
  const [linkedIds, setLinkedIds] = useState(new Set());
  const [facets, setFacets] = useState(null);
  const [facetsError, setFacetsError] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [revision, setRevision] = useState(0);
  const [serviceOrderOpen, setServiceOrderOpen] = useState(false);
  const [reportCreateOpen, setReportCreateOpen] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [mobileLayout, setMobileLayout] = useState('list');
  const query = params.get('q') || '';
  const category = params.get('categoria') || 'all';
  const visibility = params.get('visibilidade') === 'internas' ? 'internal' : 'public';
  const phase = REPORT_PHASES.some(([id]) => id === params.get('fase')) ? params.get('fase')
    : params.get('status') === 'resolved' ? 'finished'
      : ['in-progress', 'pending_resolution'].includes(params.get('status')) ? 'in_progress' : 'pending';
  const issueType = ['iluminacao', 'esgoto'].includes(category) ? params.get('subtipo') || 'all' : 'all';
  const neighborhood = params.get('bairro') || 'all';
  const age = REPORT_AGES.some(([id]) => id === params.get('idade')) ? params.get('idade') : 'all';
  const dateFrom = validDate(params.get('de'));
  const dateTo = validDate(params.get('ate'));
  const sort = ['antigas', 'status_asc', 'status_desc'].includes(params.get('ordem')) ? params.get('ordem') : 'recentes';
  const requestedPageSize = Number(params.get('por_pagina'));
  const pageSize = REPORT_PAGE_SIZES.includes(requestedPageSize) ? requestedPageSize : 20;
  const page = Math.max(1, Math.floor(Number(params.get('pagina')) || 1));
  const activeReportId = reportId || params.get('bronca');
  const activeDemandId = params.get('demanda');
  const linkedReportId = params.get('vinculo');
  const municipalityId = context.municipality?.id;
  const cityId = context.municipality?.city_id;

  useEffect(() => {
    if (!municipalityId || view === 'map') return undefined;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const timer = window.setTimeout(async () => {
      try {
        const result = await loadMunicipalReportPage(supabase, { municipalityId, cityId, category, issueType, neighborhood, phase, age, query, sort, dateFrom, dateTo, visibility, includeLinked: true, signal: controller.signal }, page, pageSize);
        if (controller.signal.aborted) return;
        setReports(result.reports);
        setLinkedIds(new Set(result.links.map((item) => item.report_id)));
        setTotal(result.total);
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > lastPage) setParams((current) => { const next = new URLSearchParams(current); next.set('pagina', String(lastPage)); return next; }, { replace: true });
      } catch (failure) {
        if (!controller.signal.aborted) { setReports([]); setLinkedIds(new Set()); setTotal(0); setError(failure.message || 'Não foi possível carregar as solicitações.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [municipalityId, cityId, category, issueType, neighborhood, phase, age, query, sort, dateFrom, dateTo, visibility, page, pageSize, revision, view, setParams]);

  useEffect(() => {
    if (!municipalityId || view === 'map') return undefined;
    const controller = new AbortController();
    setFacets(null);
    setFacetsError(false);
    const timer = window.setTimeout(() => loadMunicipalReportFacets(supabase, { municipalityId, cityId, neighborhood, phase, age, query, dateFrom, dateTo, visibility, includeLinked: true, includeAllStatuses: true, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setFacets(result); })
      .catch(() => { if (!controller.signal.aborted) setFacetsError(true); }), query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [municipalityId, cityId, neighborhood, phase, age, query, dateFrom, dateTo, visibility, revision, view]);

  useEffect(() => { setSelectedIds([]); setServiceOrderOpen(false); }, [municipalityId]);

  const change = (key, value) => {
    if (key === 'visibilidade' || key === 'fase') setSelectedIds([]);
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (value && value !== 'all' && !(key === 'fase' && value === 'pending')) next.set(key, value); else next.delete(key);
      if (key === 'categoria') next.delete('subtipo');
      if (key === 'fase') next.delete('status');
      if (filterKeys.includes(key) || key === 'visibilidade' || key === 'fase' || key === 'por_pagina' || key === 'ordem') next.delete('pagina');
      return next;
    }, { replace: true });
  };
  const clearFilters = () => setParams((current) => {
    const next = new URLSearchParams(current);
    [...filterKeys, 'pagina'].forEach((key) => next.delete(key));
    return next;
  }, { replace: true });
  const clearAdvancedFilters = () => setParams((current) => {
    const next = new URLSearchParams(current);
    [...advancedFilterKeys, 'pagina'].forEach((key) => next.delete(key));
    return next;
  }, { replace: true });
  const closeReport = () => {
    if (reportId) { navigate('/prefeitura/broncas', { replace: true }); return; }
    change('bronca', '');
  };
  const closeDemand = () => setParams((current) => {
    const next = new URLSearchParams(current);
    next.delete('demanda'); next.delete('vinculo');
    return next;
  }, { replace: true });
  const openDemand = (demandId, sourceId = null) => {
    const next = new URLSearchParams(params);
    next.delete('bronca');
    next.set('demanda', demandId);
    if (sourceId) next.set('vinculo', sourceId); else next.delete('vinculo');
    if (reportId) navigate('/prefeitura/broncas?' + next, { replace: true });
    else setParams(next, { replace: true });
  };
  const saved = () => { closeDemand(); setRevision((value) => value + 1); };
  const toggleSelection = (id) => setSelectedIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const canDeleteReport = (item) => Boolean(context.canEdit && item.created_by_municipality === municipalityId
    && (context.isAdministrator || item.author_id === context.userId));
  const deleteReport = async (item) => {
    if (!canDeleteReport(item) || linkedIds.has(item.id) || deletingId) return;
    if (!await confirmApp({ title: 'Excluir esta solicitação?', description: `A solicitação ${item.protocol || item.title}, suas fotos, seu comprovante e o histórico vinculado deixarão de aparecer. Esta ação não pode ser desfeita.`, confirmLabel: 'Excluir solicitação', destructive: true })) return;
    setDeletingId(item.id);
    try {
      const { error: failure } = await supabase.rpc('excluir_solicitacao_municipal', {
        p_prefeitura: municipalityId, p_report: item.id,
      });
      if (failure) throw failure;
      if (activeReportId === item.id) closeReport();
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      setRevision((value) => value + 1);
      showAppNotice({ title: 'Solicitação excluída' });
    } catch (failure) {
      showAppError({ title: 'Não foi possível excluir a solicitação', description: failure.message });
    } finally {
      setDeletingId(null);
    }
  };

  if (context.loading) return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!context.municipality) return <div className="page-shell-fluid py-10"><h1 className="text-2xl font-bold">Acesso institucional necessário</h1><p className="mt-2 text-sm text-content-secondary">{context.error}</p></div>;
  const categories = context.categories;
  const orderedCategories = [...categories].sort((a, b) => {
    const aIndex = primaryCategoryIds.indexOf(a.id);
    const bIndex = primaryCategoryIds.indexOf(b.id);
    return (aIndex < 0 ? primaryCategoryIds.length : aIndex) - (bIndex < 0 ? primaryCategoryIds.length : bIndex) || a.name.localeCompare(b.name, 'pt-BR');
  });
  const rankedCategories = [...orderedCategories].sort((a, b) => (facets?.counts[b.id] || 0) - (facets?.counts[a.id] || 0));
  const featuredCategories = rankedCategories.slice(0, 3);
  if (category !== 'all' && !featuredCategories.some((item) => item.id === category)) {
    const selectedCategory = rankedCategories.find((item) => item.id === category);
    if (selectedCategory) featuredCategories.splice(2, 1, selectedCategory);
  }
  const extraCategories = rankedCategories.filter((item) => !featuredCategories.some((featured) => featured.id === item.id));
  const hasAdvancedFilters = Boolean(neighborhood !== 'all' || age !== 'all' || dateFrom || dateTo);
  const hasFilters = Boolean(query || category !== 'all' || issueType !== 'all' || hasAdvancedFilters);
  const subtypeOptions = category === 'iluminacao' ? TIPOS_DE_PROBLEMA_ILUMINACAO : category === 'esgoto' ? TIPOS_DE_PROBLEMA_ESGOTO : [];
  const selectableReports = reports.filter((item) => (item.is_public || !item.created_by_municipality) && !linkedIds.has(item.id));
  const allSelected = selectableReports.length > 0 && selectableReports.every((item) => selectedIds.includes(item.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const countLabel = (id) => facets ? (facets.counts[id] || 0).toLocaleString('pt-BR') : '—';
  // Facets ignore category and subtype; only hide a phase count when its set matches the list.
  const showPhaseCount = (id) => !(id === phase && category === 'all' && issueType === 'all');
  const showCategoryCount = (id) => id !== 'all' && !(facets?.counts.all > 0 && facets.counts[id] === facets.counts.all);
  const emptyPhaseLabel = phase === 'pending' ? 'pendente' : phase === 'in_progress' ? 'em andamento' : 'finalizada';
  const emptyTitle = `Nenhuma solicitação ${visibility === 'internal' ? 'interna ' : 'pública '}${emptyPhaseLabel}`;
  const emptyDescription = visibility === 'internal'
    ? 'As solicitações criadas como públicas ficam na aba Públicas. Confira a visibilidade indicada no comprovante ou busque pelo protocolo.'
    : 'As solicitações desta etapa aparecerão aqui quando forem registradas ou atualizadas.';
  const categoryButton = (id, label, compact = false) => {
    const active = category === id;
    return <button key={id} type="button" aria-pressed={active} onClick={() => change('categoria', id)} className={(compact ? 'flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px] font-semibold ' : 'flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold xl:min-w-[9rem] ') + 'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (active ? 'border-brand bg-brand text-content-onBrand shadow-sm' : 'border-edge-subtle bg-surface-raised text-content-primary hover:bg-surface-subtle')}>
      <span className={active ? '' : (categoryTones[id] || 'text-content-secondary').split(' ').filter((item) => item.startsWith('text-') || item.startsWith('dark:text-')).join(' ')}>{id === 'all' ? <Megaphone className="h-4 w-4" /> : <CategoryIcon id={id} />}</span>
      <span className={compact ? 'w-full truncate text-center' : 'truncate'}>{label}</span>{showCategoryCount(id) && <span className={'text-[10px] font-medium tabular-nums ' + (active ? 'text-content-onBrand/80' : 'text-content-secondary')}>{countLabel(id)}</span>}
    </button>;
  };
  const reportDetails = (item, mobile = false) => <div className="flex min-w-0 items-center gap-3"><AgencyReportImage report={item} thumbnail /><div className="min-w-0"><div className="flex flex-wrap items-center gap-1.5"><p className="line-clamp-2 text-[13px] font-semibold leading-5">{item.title || 'Solicitação sem título'}</p>{item.created_by_municipality && item.is_public && <span className="rounded-md bg-brand-subtleBg px-1.5 py-0.5 text-[10px] font-semibold text-brand-subtleFg">Prefeitura</span>}</div><p className="mt-1 flex min-w-0 items-start gap-1 text-[11px] leading-4 text-content-secondary"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-1">{item.address || 'Endereço não informado'}</span></p>{mobile && item.neighborhood && !item.address?.toLocaleLowerCase('pt-BR').includes(item.neighborhood.toLocaleLowerCase('pt-BR')) && <p className="ml-4 truncate text-[10px] leading-4 text-content-tertiary">{item.neighborhood}</p>}{item.issue_type && <p className="ml-4 truncate text-[10px] text-content-secondary">{rotuloDoTipoDeProblema(item.category_id, item.issue_type)}</p>}</div></div>;
  const reportActions = (item) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label={'Ações da solicitação ' + (item.title || item.id)}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={() => change('bronca', item.id)}>Ver detalhes da solicitação</DropdownMenuItem>
    {context.canEdit && (item.is_public || !item.created_by_municipality) && !linkedIds.has(item.id) && ['pending', 'in-progress'].includes(item.status) && <DropdownMenuItem onSelect={() => { setSelectedIds([item.id]); setServiceOrderOpen(true); }}>Gerar ordem de serviço</DropdownMenuItem>}
    {(item.is_public || !item.created_by_municipality) && <DropdownMenuItem asChild><Link to={'/bronca/' + item.id} target="_blank" rel="noopener noreferrer">Abrir página pública</Link></DropdownMenuItem>}
    {canDeleteReport(item) && <DropdownMenuItem onSelect={() => deleteReport(item)} disabled={linkedIds.has(item.id) || Boolean(deletingId)} className="text-danger focus:text-danger"><Trash2 className="mr-2 h-4 w-4" />{deletingId === item.id ? 'Excluindo…' : 'Excluir solicitação'}</DropdownMenuItem>}
    {canDeleteReport(item) && linkedIds.has(item.id) && <p className="px-2 py-1 text-xs text-content-secondary">Remova primeiro a ordem de serviço vinculada.</p>}
  </DropdownMenuContent></DropdownMenu>;

  return <div className="page-shell-fluid min-w-0 pb-10 pt-6 sm:pt-8" style={{ paddingInline: 'clamp(1rem, 2vw, 2rem)' }}>
    <Helmet><title>{view === 'map' ? 'Mapa de solicitações' : 'Consulta de solicitações'} | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <MunicipalPageHeader eyebrow="Escuta da cidade" title="Solicitações da cidade" description="Acompanhe as solicitações públicas e internas da cidade e gere ordens de serviço." action={context.canEdit && <div className="flex flex-wrap gap-2"><Button onClick={() => setReportCreateOpen(true)} variant="outline" className="h-9 border-amber-400 bg-amber-400 shadow-md px-3 text-xs text-amber-950 hover:border-amber-500 hover:bg-amber-500 hover:text-amber-950 sm:h-10 sm:text-sm"><Megaphone className="mr-1.5 h-4 w-4" />Criar solicitação de serviço</Button>{view !== 'map' && <Button onClick={() => setServiceOrderOpen(true)} className="h-9 px-3 text-xs sm:h-10 sm:text-sm"><Download className="mr-1.5 h-4 w-4" /><span className="sm:hidden">Gerar OS</span><span className="hidden sm:inline">Gerar Ordem de Serviço</span></Button>}</div>}>
      <nav className="flex gap-1 rounded-lg border border-edge-subtle bg-surface-subtle p-1" aria-label="Visualização das solicitações">{[['list', '/prefeitura/broncas', 'Lista', LayoutList], ['map', '/prefeitura/mapa', 'Mapa', MapIcon]].map(([key, to, label, ViewIcon]) => <Button key={key} asChild variant={view === key ? 'default' : 'ghost'} size="sm" className="h-8 text-xs"><Link to={to} aria-current={view === key ? 'page' : undefined}><ViewIcon className="mr-2 h-4 w-4" />{label}</Link></Button>)}</nav>
    </MunicipalPageHeader>
    {view === 'map' ? <Suspense fallback={<div className="mt-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}><ReportsMap cityId={cityId} municipalityId={municipalityId} revision={revision} onSelect={(id) => change('bronca', id)} /></Suspense> : <>
      <div className="mt-5 flex min-w-0 flex-wrap items-center justify-between gap-x-8 gap-y-3 border-b border-edge-subtle pb-3">
        <nav aria-label="Visibilidade das solicitações" className="flex min-w-0 flex-wrap items-center gap-2">
          {[["public", "Públicas", Megaphone], ["internal", "Internas", LockKeyhole]].map(([id, label, TabIcon]) => <button key={id} type="button" aria-current={visibility === id ? 'page' : undefined} onClick={() => change('visibilidade', id === 'internal' ? 'internas' : 'all')} className={'inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (visibility === id ? 'border-brand bg-brand text-content-onBrand' : 'border-edge-subtle bg-surface-raised text-content-primary hover:bg-surface-subtle')}><TabIcon className="h-4 w-4" />{label}<span className={'rounded-md px-1.5 py-0.5 text-[10px] tabular-nums ' + (visibility === id ? 'bg-white/20' : 'bg-surface-subtle text-content-secondary')}>{facets ? facets.visibilityCounts[id].toLocaleString('pt-BR') : '—'}</span></button>)}
        </nav>
        <nav aria-label="Andamento das solicitações" className="flex min-w-0 flex-wrap items-center gap-2">
          {REPORT_PHASES.map(([id, label]) => <button key={id} type="button" aria-current={phase === id ? 'page' : undefined} onClick={() => change('fase', id)} className={'inline-flex min-h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (phase === id ? 'border-brand bg-brand-subtleBg text-brand-subtleFg' : 'border-edge-subtle bg-surface-raised text-content-secondary hover:bg-surface-subtle')}><span>{label}</span>{showPhaseCount(id) && <span className="font-medium text-[10px] tabular-nums text-content-secondary">{facets ? facets.phaseCounts[id].toLocaleString('pt-BR') : '—'}</span>}</button>)}
        </nav>
      </div>
      <nav aria-label="Categorias de solicitações" className="mt-4 hidden min-w-0 flex-wrap gap-2 sm:flex">
        {categoryButton('all', 'Todas')}{orderedCategories.map((item) => categoryButton(item.id, item.name))}
      </nav>
      <nav aria-label="Categorias de solicitações no celular" className="mt-4 grid min-w-0 grid-cols-5 gap-1.5 sm:hidden">
        {categoryButton('all', 'Todas', true)}{featuredCategories.map((item) => categoryButton(item.id, ({ poda: 'Poda', 'vazamento-de-agua': 'Vazamento', sinalizacao: 'Sinalização' })[item.id] || item.name, true))}
        {extraCategories.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-edge-subtle bg-surface-raised px-1 py-1.5 text-[10px] font-semibold" aria-label="Mais categorias"><MoreHorizontal className="h-4 w-4" /><span>Mais</span><ChevronDown className="h-3 w-3" /></button></DropdownMenuTrigger><DropdownMenuContent align="end">{extraCategories.map((item) => <DropdownMenuItem key={item.id} onSelect={() => change('categoria', item.id)}>{item.name}{showCategoryCount(item.id) && <span className="ml-2 text-content-secondary tabular-nums">{countLabel(item.id)}</span>}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
      </nav>
      {facetsError && <p role="status" className="mt-2 text-xs text-content-secondary">Não foi possível carregar as categorias e os bairros. <button type="button" onClick={() => setRevision((value) => value + 1)} className="font-medium text-brand underline">Tentar novamente</button></p>}
      <section aria-label="Solicitações e solicitações da cidade" className="mt-3 min-w-0 overflow-hidden rounded-xl border border-edge-subtle bg-surface-raised shadow-sm">
        <div className="space-y-3 border-b border-edge-subtle p-3 sm:p-4">
          <h2 aria-live="polite" className="text-base font-semibold tabular-nums">{loading ? 'Carregando solicitações…' : error ? 'Solicitações' : `${total.toLocaleString('pt-BR')} ${total === 1 ? 'solicitação' : 'solicitações'}`}</h2>
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <label className="relative min-w-0 basis-full sm:flex-1 sm:basis-0"><span className="sr-only">Buscar solicitações</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input value={query} onChange={(event) => change('q', event.target.value)} placeholder="Buscar por título, protocolo ou endereço…" className="h-10 bg-surface-subtle pl-9 text-xs" /></label>
            <Popover><PopoverTrigger asChild><Button variant="outline" className="h-10 gap-2 text-xs"><Filter className="h-4 w-4" />Filtros{hasAdvancedFilters && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}<ChevronDown className="h-3 w-3" /></Button></PopoverTrigger><PopoverContent align="end" className="max-w-[calc(100vw-2rem)] space-y-4">
              <p className="text-sm font-semibold">Filtros adicionais</p>
              <label className="grid gap-1.5 text-xs text-content-secondary">Idade<select value={age} onChange={(event) => change('idade', event.target.value)} className={selectClass}>{REPORT_AGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              <label className="grid gap-1.5 text-xs text-content-secondary">Bairro<select value={neighborhood} onChange={(event) => change('bairro', event.target.value)} className={selectClass}><option value="all">Todos</option>{(facets?.neighborhoods || []).map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
              <div className="grid grid-cols-2 gap-2"><label className="grid gap-1.5 text-xs text-content-secondary">Registrada de<Input type="date" value={dateFrom} onChange={(event) => change('de', event.target.value)} className={selectClass + ' w-full'} /></label><label className="grid gap-1.5 text-xs text-content-secondary">Registrada até<Input type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => change('ate', event.target.value)} className={selectClass + ' w-full'} /></label></div>
              <Button variant="outline" size="sm" className="w-full" disabled={!hasAdvancedFilters} onClick={clearAdvancedFilters}>Limpar filtros adicionais</Button>
            </PopoverContent></Popover>
            {subtypeOptions.length > 0 && <label className="grid min-w-0 flex-1 gap-1 text-xs font-medium text-content-secondary sm:w-56 sm:flex-none">
              <span>Subcategoria</span>
              <select aria-label="Subcategoria" value={issueType} onChange={(event) => change('subtipo', event.target.value)} className={selectClass + ' h-10 w-full'}>
                <option value="all">Todas as subcategorias</option>
                {issueType !== 'all' && !subtypeOptions.some((item) => item.value === issueType) && <option value={issueType}>{rotuloDoTipoDeProblema(category, issueType)}</option>}
                {subtypeOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>}
            <label className="relative ml-auto hidden sm:block"><span className="sr-only">Ordenar solicitações</span><select value={sort} onChange={(event) => change('ordem', event.target.value)} className={selectClass + ' h-10 cursor-pointer appearance-none pl-3 pr-9'}><option value="recentes">Mais recentes</option><option value="antigas">Mais antigas</option><option value="status_asc">Status: fluxo de atendimento</option><option value="status_desc">Status: fluxo inverso</option></select><ArrowUpDown className="pointer-events-none absolute right-3 top-3.5 h-3 w-3 text-content-secondary" /></label>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 border-b border-edge-subtle px-3 py-2 text-[11px] text-content-secondary sm:hidden">

          <label className="relative"><span className="sr-only">Ordenar solicitações</span><select value={sort} onChange={(event) => change('ordem', event.target.value)} className="h-8 max-w-40 cursor-pointer appearance-none rounded-lg border border-edge-subtle bg-surface-raised pl-2 pr-6 text-[11px]"><option value="recentes">Mais recentes</option><option value="antigas">Mais antigas</option><option value="status_asc">Status: fluxo</option><option value="status_desc">Status: inverso</option></select><ArrowUpDown className="pointer-events-none absolute right-2 top-2.5 h-3 w-3" /></label>
          <div className="flex rounded-lg border border-edge-subtle bg-surface-subtle p-0.5" role="group" aria-label="Formato da lista"><button type="button" aria-label="Exibir lista" aria-pressed={mobileLayout === 'list'} onClick={() => setMobileLayout('list')} className={'rounded-md p-1.5 ' + (mobileLayout === 'list' ? 'bg-surface-raised text-brand shadow-sm' : '')}><LayoutList className="h-3.5 w-3.5" /></button><button type="button" aria-label="Exibir grade" aria-pressed={mobileLayout === 'grid'} onClick={() => setMobileLayout('grid')} className={'rounded-md p-1.5 ' + (mobileLayout === 'grid' ? 'bg-surface-raised text-brand shadow-sm' : '')}><LayoutGrid className="h-3.5 w-3.5" /></button></div>
        </div>
        {!loading && reports.length > 0 && <label className="flex cursor-pointer items-center gap-2 border-b border-edge-subtle px-4 py-2 text-xs text-content-secondary xl:hidden"><input type="checkbox" checked={allSelected} disabled={!selectableReports.length} onChange={(event) => setSelectedIds((current) => selectPageRecords(current, selectableReports.map((item) => item.id), event.target.checked))} className="h-3.5 w-3.5 accent-brand" />Selecionar todos desta página</label>}
        {selectedIds.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-subtle bg-brand-subtleBg px-4 py-2"><p role="status" className="text-xs font-medium text-brand">{selectedIds.length} {selectedIds.length === 1 ? 'solicitação selecionada' : 'solicitações selecionadas'}</p><div className="flex flex-wrap items-center gap-2">{context.canEdit && <Button size="sm" onClick={() => setServiceOrderOpen(true)} className="h-8 text-xs">Gerar ordem de serviço</Button>}<Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="h-8 text-xs">Limpar seleção</Button></div></div>}
        {error ? <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-sm text-danger"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div> : loading ? <div className="flex h-48 items-center justify-center" role="status" aria-label="Carregando solicitações"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div> : reports.length === 0 ? <MunicipalEmptyState title={hasFilters ? 'Nenhuma solicitação para estes filtros' : emptyTitle} description={hasFilters ? 'Tente outro termo de busca ou ajuste os filtros.' : emptyDescription} action={hasFilters && <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button>} /> : <>
          <div className="hidden min-w-0 xl:block"><table className="w-full table-fixed text-left text-xs"><caption className="sr-only">Solicitações da cidade. Abra uma linha para consultar os detalhes.</caption><colgroup><col className="w-10" /><col /><col className="w-[15%]" /><col className="w-[13%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[16%]" /><col className="w-16" /></colgroup>
            <thead className="border-b border-edge-subtle bg-surface-subtle/70 text-[10px] uppercase tracking-wide text-content-secondary"><tr><th scope="col" className="px-3 py-3"><input type="checkbox" aria-label="Selecionar solicitações desta página" checked={allSelected} disabled={!selectableReports.length} ref={(input) => { if (input) input.indeterminate = selectableReports.some((item) => selectedIds.includes(item.id)) && !allSelected; }} onChange={(event) => setSelectedIds((current) => selectPageRecords(current, selectableReports.map((item) => item.id), event.target.checked))} className="h-3.5 w-3.5 accent-brand" /></th><th scope="col" className="px-3 py-3 font-semibold">Solicitação</th><th scope="col" className="px-3 py-3 font-semibold">Categoria</th><th scope="col" className="px-3 py-3 font-semibold">Bairro</th><th scope="col" aria-sort={sort === 'recentes' ? 'descending' : sort === 'antigas' ? 'ascending' : 'none'} className="px-3 py-3 font-semibold"><button type="button" onClick={() => change('ordem', sort === 'recentes' ? 'antigas' : 'recentes')} className="inline-flex items-center gap-1 uppercase focus-visible:ring-2 focus-visible:ring-brand">Registrada em<ArrowUpDown className="h-3 w-3" /></button></th><th scope="col" className="px-3 py-3 font-semibold">Idade</th><th scope="col" aria-sort={sort === 'status_asc' ? 'ascending' : sort === 'status_desc' ? 'descending' : 'none'} className="px-3 py-3 font-semibold"><button type="button" onClick={() => change('ordem', sort === 'status_asc' ? 'status_desc' : 'status_asc')} className={'inline-flex items-center gap-1 uppercase focus-visible:ring-2 focus-visible:ring-brand ' + (sort.startsWith('status_') ? 'text-brand' : '')}>Status<ArrowUpDown className="h-3 w-3" /></button></th><th scope="col" className="px-2 py-3 text-center font-semibold">Ações</th></tr></thead>
            <tbody className="divide-y divide-edge-subtle">{reports.map((item) => <tr key={item.id} tabIndex={0} aria-label={'Abrir solicitação: ' + (item.title || 'Sem título')} onClick={() => change('bronca', item.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); change('bronca', item.id); } }} className={'cursor-pointer transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ' + (selectedIds.includes(item.id) ? 'bg-brand-subtleBg' : '')}>
              <td className="cursor-default px-3 py-3" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={'Selecionar solicitação ' + item.title} checked={selectedIds.includes(item.id)} disabled={Boolean((item.created_by_municipality && !item.is_public) || linkedIds.has(item.id))} onChange={() => toggleSelection(item.id)} className="h-3.5 w-3.5 accent-brand" /></td><td className="px-3 py-3">{reportDetails(item)}</td><td className="px-3 py-3"><CategoryBadge report={item} />{linkedIds.has(item.id) && <span className="ml-1 rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-content-secondary">Com OS</span>}</td><td className="break-words px-3 py-3 text-content-secondary">{item.neighborhood || 'Não informado'}</td><td className="px-3 py-3 text-[11px] tabular-nums text-content-secondary">{date(item.created_at)}<span className="mt-0.5 block text-[10px] text-content-tertiary">{time(item.created_at)}</span></td><td className="px-3 py-3"><AgeBadge createdAt={item.created_at} /></td><td className="break-words px-3 py-3"><StatusBadge status={item.status} /></td><td className="cursor-default px-2 py-3 text-center" onClick={(event) => event.stopPropagation()}>{reportActions(item)}</td>
            </tr>)}</tbody>
          </table></div>
          <div className={(mobileLayout === 'grid' ? 'grid grid-cols-2 gap-2 p-2 sm:grid-cols-1 sm:gap-0 sm:p-0' : 'divide-y divide-edge-subtle') + ' xl:hidden'}>{reports.map((item) => <article key={item.id} className={(mobileLayout === 'grid' ? 'min-w-0 rounded-lg border border-edge-subtle p-2 sm:rounded-none sm:border-0 sm:p-4' : 'p-3 sm:p-4') + (selectedIds.includes(item.id) ? ' bg-brand-subtleBg' : '')}>
            {mobileLayout === 'grid' ? <div className="flex items-center justify-between sm:hidden"><input type="checkbox" aria-label={'Selecionar solicitação ' + item.title} checked={selectedIds.includes(item.id)} disabled={Boolean((item.created_by_municipality && !item.is_public) || linkedIds.has(item.id))} onChange={() => toggleSelection(item.id)} className="h-3.5 w-3.5 accent-brand" />{reportActions(item)}</div> : null}
            <div className="flex items-start gap-2 sm:gap-3"><input type="checkbox" aria-label={'Selecionar solicitação ' + item.title} checked={selectedIds.includes(item.id)} disabled={Boolean((item.created_by_municipality && !item.is_public) || linkedIds.has(item.id))} onChange={() => toggleSelection(item.id)} className={(mobileLayout === 'grid' ? 'hidden sm:block ' : '') + 'mt-1 h-3.5 w-3.5 shrink-0 accent-brand'} /><button type="button" onClick={() => change('bronca', item.id)} className="min-w-0 flex-1 rounded-lg text-left hover:text-brand focus-visible:ring-2 focus-visible:ring-brand">{mobileLayout === 'grid' ? <div className="sm:hidden"><AgencyReportImage report={item} thumbnail /><strong className="mt-2 line-clamp-2 text-xs">{item.title || 'Solicitação sem título'}</strong><span className="mt-1 block truncate text-[10px] text-content-secondary">{item.neighborhood || 'Bairro não informado'}</span></div> : null}<div className={mobileLayout === 'grid' ? 'hidden sm:block' : ''}>{reportDetails(item, true)}</div></button><div className={mobileLayout === 'grid' ? 'hidden sm:block' : ''}>{reportActions(item)}</div></div>
            <div className={(mobileLayout === 'grid' ? 'mt-2 ' : 'ml-6 mt-2 ') + 'flex flex-wrap items-center gap-1.5 sm:gap-2'}><CategoryBadge report={item} />{linkedIds.has(item.id) && <span className="rounded-md bg-surface-subtle px-1.5 py-0.5 text-[10px] text-content-secondary">Com OS</span>}<AgeBadge createdAt={item.created_at} /><StatusBadge status={item.status} /><span className="ml-auto text-[10px] text-content-tertiary sm:text-[11px]">{date(item.created_at)}</span></div>
          </article>)}</div>
        </>}
        <nav aria-label="Paginação das solicitações" className="grid grid-cols-1 items-center gap-3 border-t border-edge-subtle bg-surface-subtle/30 px-4 py-3 text-xs text-content-secondary sm:grid-cols-[1fr_auto_1fr]">
          <p aria-live="polite">{loading ? 'Carregando registros…' : total ? ((page - 1) * pageSize + 1) + '–' + Math.min(page * pageSize, total) + ' de ' + total.toLocaleString('pt-BR') + ' registros' : '0 registros'}</p>
          <div className="flex items-center justify-center gap-1.5"><Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => change('pagina', String(page - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>{reportPageNumbers(page, pages).map((value) => typeof value === 'string' ? <span key={value} className="px-1" aria-hidden="true">…</span> : <button key={value} type="button" aria-label={'Página ' + value} aria-current={value === page ? 'page' : undefined} disabled={loading} onClick={() => change('pagina', String(value))} className={'h-8 min-w-8 rounded-lg border px-2 text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-brand ' + (value === page ? 'border-brand bg-brand-subtleBg font-semibold text-brand-subtleFg' : 'border-edge-subtle bg-surface-raised hover:bg-surface-subtle')}>{value}</button>)}<Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label="Próxima página" disabled={loading || page >= pages} onClick={() => change('pagina', String(page + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button></div>
          <label className="flex items-center justify-end gap-3">Itens por página<select aria-label="Itens por página" value={pageSize} onChange={(event) => change('por_pagina', event.target.value)} className={selectClass + ' h-8'} disabled={loading}>{REPORT_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        </nav>
      </section>
    </>}
    {serviceOrderOpen && <MunicipalServiceOrderDialog context={context} selectedIds={selectedIds} onRemove={(id) => setSelectedIds((current) => current.filter((value) => value !== id))} onClose={() => setServiceOrderOpen(false)} onCreated={() => { setRevision((value) => value + 1); setSelectedIds([]); }} onOpenOrder={(id) => { setServiceOrderOpen(false); openDemand(id); }} />}
    <MunicipalReportCreateDialog open={reportCreateOpen} municipalityId={municipalityId} onClose={() => setReportCreateOpen(false)} onCreated={() => setRevision((value) => value + 1)} onReceiptClose={(created) => { if (created?.id) setParams(new URLSearchParams({ bronca: created.id, ...(created.is_public === false ? { visibilidade: 'internas' } : {}) }), { replace: true }); }} />
    <MunicipalReportDrawer open={Boolean(activeReportId) && !activeDemandId} reportId={activeReportId} context={context} onClose={closeReport} onCreateDemand={(id) => { closeReport(); setSelectedIds([id]); setServiceOrderOpen(true); }} onOpenDemand={(id) => openDemand(id)} onUpdated={() => { setSelectedIds([]); setRevision((value) => value + 1); }} />
    <MunicipalDemandDrawer open={Boolean(activeDemandId)} demandId={activeDemandId} reportId={linkedReportId} context={context} onClose={closeDemand} onSaved={saved} onRemoved={saved} />
  </div>;
}
