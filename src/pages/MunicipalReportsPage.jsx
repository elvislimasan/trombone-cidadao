import React, { lazy, Suspense, useEffect, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowUpDown, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, LayoutGrid, LayoutList, Loader2, Map as MapIcon, MapPin, Megaphone, MoreHorizontal, Search, Signpost, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import MunicipalReportDrawer from '@/components/municipality/MunicipalReportDrawer';
import MunicipalDemandDrawer from '@/components/municipality/MunicipalDemandDrawer';
import MunicipalServiceOrderDialog from '@/components/municipality/MunicipalServiceOrderDialog';
import { selectPageRecords } from '@/lib/municipalExport';
import AgencyReportImage from '@/components/municipality/AgencyReportImage';
import { MunicipalEmptyState, MunicipalPageHeader } from '@/components/municipality/MunicipalPageUi';
import Icon, { categoryIconName } from '@/design-system/icons';
import { supabase } from '@/lib/customSupabaseClient';
import { loadMunicipalReportFacets, loadMunicipalReportPage, REPORT_AGES, REPORT_PAGE_SIZES, REPORT_STATUSES, reportAge, reportPageNumbers } from '@/lib/municipalReports';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';

const ReportsMap = lazy(() => import('@/components/municipality/MunicipalReportsMap'));
const date = (value) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const time = (value) => value ? new Date(value).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '';
const statusLabels = Object.fromEntries(REPORT_STATUSES);
const statusTone = { pending: 'bg-status-pendingBg text-status-pendingFg', 'in-progress': 'bg-status-progressBg text-status-progressFg', pending_resolution: 'bg-status-progressBg text-status-progressFg' };
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
const filterKeys = ['q', 'categoria', 'idade', 'bairro', 'status', 'sem_ordem', 'de', 'ate'];
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(new Date(value + 'T00:00:00').getTime()) ? value : '';
const selectClass = 'h-9 min-w-0 rounded-lg border border-edge-subtle bg-surface-raised px-2.5 text-xs text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand';

function CategoryIcon({ id, ...props }) {
  return id === 'sinalizacao' ? <Signpost className="h-4 w-4 shrink-0" {...props} /> : <Icon name={categoryIconName(id)} size={16} className="shrink-0" {...props} />;
}

function CategoryBadge({ report }) {
  return <span className={'inline-flex max-w-full items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold ' + (categoryTones[report.category_id] || 'bg-surface-subtle text-content-secondary')}>
    <CategoryIcon id={report.category_id} /><span className="truncate">{report.category?.name || 'Sem categoria'}</span>
  </span>;
}

function StatusBadge({ status }) {
  return <span className={'inline-flex rounded-lg px-2 py-1 text-[11px] font-medium ' + (statusTone[status] || 'bg-surface-subtle text-content-secondary')}>{statusLabels[status] || status || 'Sem status'}</span>;
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
  const [facets, setFacets] = useState(null);
  const [facetsError, setFacetsError] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [revision, setRevision] = useState(0);
  const [serviceOrderOpen, setServiceOrderOpen] = useState(false);
  const [mobileLayout, setMobileLayout] = useState('list');
  const query = params.get('q') || '';
  const category = params.get('categoria') || 'all';
  const neighborhood = params.get('bairro') || 'all';
  const status = REPORT_STATUSES.some(([id]) => id === params.get('status')) ? params.get('status') : 'all';
  const age = REPORT_AGES.some(([id]) => id === params.get('idade')) ? params.get('idade') : 'all';
  const dateFrom = validDate(params.get('de'));
  const dateTo = validDate(params.get('ate'));
  const sort = params.get('ordem') === 'antigas' ? 'antigas' : 'recentes';
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
        const result = await loadMunicipalReportPage(supabase, { municipalityId, cityId, category, neighborhood, status, age, query, sort, dateFrom, dateTo, signal: controller.signal }, page, pageSize);
        if (controller.signal.aborted) return;
        setReports(result.reports);
        setTotal(result.total);
        const lastPage = Math.max(1, Math.ceil(result.total / pageSize));
        if (page > lastPage) setParams((current) => { const next = new URLSearchParams(current); next.set('pagina', String(lastPage)); return next; }, { replace: true });
      } catch (failure) {
        if (!controller.signal.aborted) { setReports([]); setTotal(0); setError(failure.message || 'Não foi possível carregar as broncas.'); }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }, query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [municipalityId, cityId, category, neighborhood, status, age, query, sort, dateFrom, dateTo, page, pageSize, revision, view, setParams]);

  useEffect(() => {
    if (!municipalityId || view === 'map') return undefined;
    const controller = new AbortController();
    setFacets(null);
    setFacetsError(false);
    const timer = window.setTimeout(() => loadMunicipalReportFacets(supabase, { municipalityId, cityId, neighborhood, status, age, query, dateFrom, dateTo, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) setFacets(result); })
      .catch(() => { if (!controller.signal.aborted) setFacetsError(true); }), query ? 250 : 0);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [municipalityId, cityId, neighborhood, status, age, query, dateFrom, dateTo, revision, view]);

  useEffect(() => { setSelectedIds([]); setServiceOrderOpen(false); }, [municipalityId]);

  const change = (key, value) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value && value !== 'all') next.set(key, value); else next.delete(key);
    if (filterKeys.includes(key) || key === 'por_pagina' || key === 'ordem') next.delete('pagina');
    return next;
  }, { replace: true });
  const clearFilters = () => setParams((current) => {
    const next = new URLSearchParams(current);
    [...filterKeys, 'pagina'].forEach((key) => next.delete(key));
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
  const hasFilters = Boolean(query || category !== 'all' || neighborhood !== 'all' || status !== 'all' || age !== 'all' || dateFrom || dateTo);
  const allSelected = reports.length > 0 && reports.every((item) => selectedIds.includes(item.id));
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const countLabel = (id) => facets ? (facets.counts[id] || 0).toLocaleString('pt-BR') : '—';
  const locationLabel = [context.municipality.cidade?.name, context.municipality.cidade?.states?.uf].filter(Boolean).join(' - ');
  const categoryButton = (id, label, compact = false) => {
    const active = category === id;
    return <button key={id} type="button" aria-pressed={active} onClick={() => change('categoria', id)} className={(compact ? 'flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px] font-semibold ' : 'flex min-h-10 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold xl:min-w-[9rem] ') + 'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (active ? 'border-brand bg-brand text-content-onBrand shadow-sm' : 'border-edge-subtle bg-surface-raised text-content-primary hover:bg-surface-subtle')}>
      <span className={active ? '' : (categoryTones[id] || 'text-content-secondary').split(' ').filter((item) => item.startsWith('text-') || item.startsWith('dark:text-')).join(' ')}>{id === 'all' ? <Megaphone className="h-4 w-4" /> : <CategoryIcon id={id} />}</span>
      <span className={compact ? 'w-full truncate text-center' : 'truncate'}>{label}</span><span className={(compact ? '' : 'ml-auto ') + 'rounded-md px-1.5 py-0.5 text-[10px] font-medium tabular-nums ' + (active ? 'bg-white/20 text-content-onBrand' : 'bg-surface-subtle text-content-secondary')}>{countLabel(id)}</span>
    </button>;
  };
  const quickSelect = (label, key, value, options) => <label className="flex min-w-0 items-center gap-2 text-xs text-content-secondary"><span className="shrink-0">{label}:</span><select aria-label={'Filtrar por ' + label.toLowerCase()} value={value} onChange={(event) => change(key, event.target.value)} className={selectClass + ' max-w-44'}><option value="all">Todos</option>{options.map(([id, title]) => <option key={id} value={id}>{title}</option>)}</select></label>;
  const reportDetails = (item) => <div className="flex min-w-0 items-center gap-3"><AgencyReportImage report={item} thumbnail /><div className="min-w-0"><p className="line-clamp-2 text-[13px] font-semibold leading-5">{item.title || 'Bronca sem título'}</p><p className="mt-1 flex min-w-0 items-start gap-1 text-[11px] leading-4 text-content-secondary"><MapPin className="mt-0.5 h-3 w-3 shrink-0" /><span className="line-clamp-1">{item.address || 'Endereço não informado'}</span></p><p className="ml-4 truncate text-[10px] leading-4 text-content-tertiary">{[item.neighborhood, locationLabel].filter(Boolean).join(' · ')}</p></div></div>;
  const reportActions = (item) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label={'Ações da bronca ' + (item.title || item.id)}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
    <DropdownMenuItem onSelect={() => change('bronca', item.id)}>Ver detalhes da bronca</DropdownMenuItem>
    {context.canEdit && <DropdownMenuItem onSelect={() => { setSelectedIds([item.id]); setServiceOrderOpen(true); }}>Gerar ordem de serviço</DropdownMenuItem>}
    <DropdownMenuItem asChild><Link to={'/bronca/' + item.id} target="_blank" rel="noopener noreferrer">Abrir página pública</Link></DropdownMenuItem>
  </DropdownMenuContent></DropdownMenu>;

  return <div className="page-shell-fluid min-w-0 pb-10 pt-6 sm:pt-8" style={{ paddingInline: 'clamp(1rem, 2vw, 2rem)' }}>
    <Helmet><title>{view === 'map' ? 'Mapa de broncas' : 'Consulta de broncas'} | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <MunicipalPageHeader eyebrow="Escuta da cidade" title="Broncas da cidade" description="Gerencie as broncas pendentes e gere ordens de serviço." action={view !== 'map' && context.canEdit && <Button onClick={() => setServiceOrderOpen(true)} className="h-9 px-3 text-xs sm:h-10 sm:text-sm"><Download className="mr-1.5 h-4 w-4" /><span className="sm:hidden">Gerar OS</span><span className="hidden sm:inline">Gerar Ordem de Serviço</span></Button>}>
      <nav className="flex gap-1 rounded-lg border border-edge-subtle bg-surface-subtle p-1" aria-label="Visualização das broncas">{[['list', '/prefeitura/broncas', 'Lista', LayoutList], ['map', '/prefeitura/mapa', 'Mapa', MapIcon]].map(([key, to, label, ViewIcon]) => <Button key={key} asChild variant={view === key ? 'default' : 'ghost'} size="sm" className="h-8 text-xs"><Link to={to} aria-current={view === key ? 'page' : undefined}><ViewIcon className="mr-2 h-4 w-4" />{label}</Link></Button>)}</nav>
    </MunicipalPageHeader>
    {view === 'map' ? <Suspense fallback={<div className="mt-8"><Loader2 className="h-6 w-6 animate-spin" /></div>}><ReportsMap cityId={cityId} municipalityId={municipalityId} onSelect={(id) => change('bronca', id)} /></Suspense> : <>
      <nav aria-label="Categorias de broncas" className="mt-5 hidden min-w-0 flex-wrap gap-2 sm:flex">
        {categoryButton('all', 'Todas')}{orderedCategories.map((item) => categoryButton(item.id, item.name))}
      </nav>
      <nav aria-label="Categorias de broncas no celular" className="mt-4 grid min-w-0 grid-cols-5 gap-1.5 sm:hidden">
        {categoryButton('all', 'Todas', true)}{featuredCategories.map((item) => categoryButton(item.id, ({ poda: 'Poda', 'vazamento-de-agua': 'Vazamento', sinalizacao: 'Sinalização' })[item.id] || item.name, true))}
        {extraCategories.length > 0 && <DropdownMenu><DropdownMenuTrigger asChild><button type="button" className="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border border-edge-subtle bg-surface-raised px-1 py-1.5 text-[10px] font-semibold" aria-label="Mais categorias"><MoreHorizontal className="h-4 w-4" /><span>Mais</span><ChevronDown className="h-3 w-3" /></button></DropdownMenuTrigger><DropdownMenuContent align="end">{extraCategories.map((item) => <DropdownMenuItem key={item.id} onSelect={() => change('categoria', item.id)}>{item.name} · {countLabel(item.id)}</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>}
      </nav>
      {facetsError && <p role="status" className="mt-2 text-xs text-content-secondary">Não foi possível carregar as categorias e os bairros. <button type="button" onClick={() => setRevision((value) => value + 1)} className="font-medium text-brand underline">Tentar novamente</button></p>}
      <section aria-label="Broncas publicadas" className="mt-3 min-w-0 overflow-hidden rounded-xl border border-edge-subtle bg-surface-raised shadow-sm">
        <div className="space-y-3 border-b border-edge-subtle p-3 sm:p-4">
          <div className="flex min-w-0 items-center gap-2">
            <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar broncas</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input value={query} onChange={(event) => change('q', event.target.value)} placeholder="Buscar por título, endereço, bairro ou descrição…" className="h-10 bg-surface-subtle pl-9 text-xs" /></label>
            <Popover><PopoverTrigger asChild><Button variant="outline" className="h-10 gap-2 text-xs"><Filter className="h-4 w-4" />Filtros{hasFilters && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}<ChevronDown className="h-3 w-3" /></Button></PopoverTrigger><PopoverContent align="end" className="max-w-[calc(100vw-2rem)] space-y-4">
              <p className="text-sm font-semibold">Filtrar broncas da cidade</p>
              <label className="grid gap-1.5 text-xs text-content-secondary">Tipo de demanda<select value={category} onChange={(event) => change('categoria', event.target.value)} className={selectClass}><option value="all">Todas</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
              <label className="grid gap-1.5 text-xs text-content-secondary">Idade<select value={age} onChange={(event) => change('idade', event.target.value)} className={selectClass}>{REPORT_AGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
              {quickSelect('Bairro', 'bairro', neighborhood, (facets?.neighborhoods || []).map((name) => [name, name]))}
              <div className="grid grid-cols-2 gap-2"><label className="grid gap-1.5 text-xs text-content-secondary">Publicada de<Input type="date" value={dateFrom} onChange={(event) => change('de', event.target.value)} className={selectClass + ' w-full'} /></label><label className="grid gap-1.5 text-xs text-content-secondary">Publicada até<Input type="date" min={dateFrom || undefined} value={dateTo} onChange={(event) => change('ate', event.target.value)} className={selectClass + ' w-full'} /></label></div>
              <Button variant="outline" size="sm" className="w-full" disabled={!hasFilters} onClick={clearFilters}>Limpar filtros</Button>
            </PopoverContent></Popover>
            <label className="relative ml-auto hidden sm:block"><span className="sr-only">Ordenar broncas</span><select value={sort} onChange={(event) => change('ordem', event.target.value)} className={selectClass + ' h-10 cursor-pointer appearance-none pl-3 pr-9'}><option value="recentes">Mais recentes</option><option value="antigas">Mais antigas</option></select><ArrowUpDown className="pointer-events-none absolute right-3 top-3.5 h-3 w-3 text-content-secondary" /></label>
          </div>
          <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-4">
            <div className="-mx-3 flex min-w-0 items-center gap-1.5 overflow-x-auto px-3 text-xs sm:mx-0 sm:flex-wrap sm:px-0"><span className="mr-1 hidden shrink-0 text-content-secondary sm:inline">Idade:</span>{REPORT_AGES.map(([id, label]) => <button key={id} type="button" aria-pressed={age === id} onClick={() => change('idade', id)} className={'shrink-0 whitespace-nowrap rounded-lg border px-2 py-1.5 text-[10px] transition-colors focus-visible:ring-2 focus-visible:ring-brand sm:px-2.5 sm:text-[11px] ' + (age === id ? 'border-brand bg-brand-subtleBg text-brand-subtleFg' : 'border-edge-subtle bg-surface-subtle text-content-secondary hover:text-content-primary')}>{label}</button>)}</div>
            <div className="hidden sm:contents">{quickSelect('Tipo de demanda', 'categoria', category, categories.map((item) => [item.id, item.name]))}{quickSelect('Bairro', 'bairro', neighborhood, (facets?.neighborhoods || []).map((name) => [name, `${name} (${facets.neighborhoodCounts[name] || 0})`]))}</div>
            {(dateFrom || dateTo) && <span className="rounded-md bg-surface-subtle px-2 py-1 text-xs text-content-secondary">Período: {dateFrom ? dateFrom.split('-').reverse().join('/') : 'início'} a {dateTo ? dateTo.split('-').reverse().join('/') : 'hoje'}</span>}{hasFilters && <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 text-xs text-content-secondary hover:text-brand focus-visible:ring-2 focus-visible:ring-brand"><X className="h-3.5 w-3.5" />Limpar</button>}
          </div>
        </div>
        <div className="flex items-center gap-2 border-b border-edge-subtle px-3 py-2 text-[11px] text-content-secondary sm:hidden">
          <span className="mr-auto tabular-nums">{loading ? 'Carregando…' : `${total.toLocaleString('pt-BR')} registros`}</span>
          <label className="relative"><span className="sr-only">Ordenar broncas</span><select value={sort} onChange={(event) => change('ordem', event.target.value)} className="h-8 max-w-32 cursor-pointer appearance-none rounded-lg border border-edge-subtle bg-surface-raised pl-2 pr-6 text-[11px]"><option value="recentes">Mais recentes</option><option value="antigas">Mais antigas</option></select><ArrowUpDown className="pointer-events-none absolute right-2 top-2.5 h-3 w-3" /></label>
          <div className="flex rounded-lg border border-edge-subtle bg-surface-subtle p-0.5" role="group" aria-label="Formato da lista"><button type="button" aria-label="Exibir lista" aria-pressed={mobileLayout === 'list'} onClick={() => setMobileLayout('list')} className={'rounded-md p-1.5 ' + (mobileLayout === 'list' ? 'bg-surface-raised text-brand shadow-sm' : '')}><LayoutList className="h-3.5 w-3.5" /></button><button type="button" aria-label="Exibir grade" aria-pressed={mobileLayout === 'grid'} onClick={() => setMobileLayout('grid')} className={'rounded-md p-1.5 ' + (mobileLayout === 'grid' ? 'bg-surface-raised text-brand shadow-sm' : '')}><LayoutGrid className="h-3.5 w-3.5" /></button></div>
        </div>
        {!loading && reports.length > 0 && <label className="flex cursor-pointer items-center gap-2 border-b border-edge-subtle px-4 py-2 text-xs text-content-secondary xl:hidden"><input type="checkbox" checked={allSelected} onChange={(event) => setSelectedIds((current) => selectPageRecords(current, reports.map((item) => item.id), event.target.checked))} className="h-3.5 w-3.5 accent-brand" />Selecionar todos desta página</label>}
        {selectedIds.length > 0 && <div className="flex flex-wrap items-center justify-between gap-2 border-b border-edge-subtle bg-brand-subtleBg px-4 py-2"><p role="status" className="text-xs font-medium text-brand">{selectedIds.length} {selectedIds.length === 1 ? 'bronca selecionada' : 'broncas selecionadas'}</p><div className="flex flex-wrap items-center gap-2">{context.canEdit && <Button size="sm" onClick={() => setServiceOrderOpen(true)} className="h-8 text-xs">Gerar Ordem de Serviço e baixar PDF</Button>}<Button variant="ghost" size="sm" onClick={() => setSelectedIds([])} className="h-8 text-xs">Limpar seleção</Button></div></div>}
        {error ? <div role="alert" className="flex flex-wrap items-center gap-3 p-5 text-sm text-danger"><p>{error}</p><Button variant="outline" size="sm" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</Button></div> : loading ? <div className="flex h-48 items-center justify-center" role="status" aria-label="Carregando broncas"><Loader2 className="h-6 w-6 animate-spin text-brand" /></div> : reports.length === 0 ? <MunicipalEmptyState title={hasFilters ? 'Nenhuma bronca para estes filtros' : 'Nenhuma bronca pendente'} description={hasFilters ? 'Tente outro termo de busca ou ajuste os filtros.' : 'Novas broncas sem ordem de serviço aparecerão aqui.'} action={hasFilters && <Button variant="outline" onClick={clearFilters}>Limpar filtros</Button>} /> : <>
          <div className="hidden min-w-0 xl:block"><table className="w-full table-fixed text-left text-xs"><caption className="sr-only">Broncas publicadas na cidade. Abra uma linha para consultar os detalhes.</caption><colgroup><col className="w-10" /><col /><col className="w-[15%]" /><col className="w-[13%]" /><col className="w-[11%]" /><col className="w-[9%]" /><col className="w-[16%]" /><col className="w-16" /></colgroup>
            <thead className="border-b border-edge-subtle bg-surface-subtle/70 text-[10px] uppercase tracking-wide text-content-secondary"><tr><th scope="col" className="px-3 py-3"><input type="checkbox" aria-label="Selecionar broncas desta página" checked={allSelected} ref={(input) => { if (input) input.indeterminate = reports.some((item) => selectedIds.includes(item.id)) && !allSelected; }} onChange={(event) => setSelectedIds((current) => selectPageRecords(current, reports.map((item) => item.id), event.target.checked))} className="h-3.5 w-3.5 accent-brand" /></th><th scope="col" className="px-3 py-3 font-semibold">Bronca</th><th scope="col" className="px-3 py-3 font-semibold">Categoria</th><th scope="col" className="px-3 py-3 font-semibold">Bairro</th><th scope="col" className="px-3 py-3 font-semibold"><button type="button" onClick={() => change('ordem', sort === 'recentes' ? 'antigas' : 'recentes')} className="inline-flex items-center gap-1 uppercase focus-visible:ring-2 focus-visible:ring-brand">Publicada em<ArrowUpDown className="h-3 w-3" /></button></th><th scope="col" className="px-3 py-3 font-semibold">Idade</th><th scope="col" className="px-3 py-3 font-semibold">Status</th><th scope="col" className="px-2 py-3 text-center font-semibold">Ações</th></tr></thead>
            <tbody className="divide-y divide-edge-subtle">{reports.map((item) => <tr key={item.id} tabIndex={0} aria-label={'Abrir bronca: ' + (item.title || 'Sem título')} onClick={() => change('bronca', item.id)} onKeyDown={(event) => { if (event.target === event.currentTarget && ['Enter', ' '].includes(event.key)) { event.preventDefault(); change('bronca', item.id); } }} className={'cursor-pointer transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ' + (selectedIds.includes(item.id) ? 'bg-brand-subtleBg' : '')}>
              <td className="cursor-default px-3 py-3" onClick={(event) => event.stopPropagation()}><input type="checkbox" aria-label={'Selecionar bronca ' + item.title} checked={selectedIds.includes(item.id)} onChange={() => toggleSelection(item.id)} className="h-3.5 w-3.5 accent-brand" /></td><td className="px-3 py-3">{reportDetails(item)}</td><td className="px-3 py-3"><CategoryBadge report={item} /></td><td className="break-words px-3 py-3 text-content-secondary">{item.neighborhood || 'Não informado'}</td><td className="px-3 py-3 text-[11px] tabular-nums text-content-secondary">{date(item.created_at)}<span className="mt-0.5 block text-[10px] text-content-tertiary">{time(item.created_at)}</span></td><td className="px-3 py-3"><AgeBadge createdAt={item.created_at} /></td><td className="break-words px-3 py-3"><StatusBadge status={item.status} /></td><td className="cursor-default px-2 py-3 text-center" onClick={(event) => event.stopPropagation()}>{reportActions(item)}</td>
            </tr>)}</tbody>
          </table></div>
          <div className={(mobileLayout === 'grid' ? 'grid grid-cols-2 gap-2 p-2 sm:grid-cols-1 sm:gap-0 sm:p-0' : 'divide-y divide-edge-subtle') + ' xl:hidden'}>{reports.map((item) => <article key={item.id} className={(mobileLayout === 'grid' ? 'min-w-0 rounded-lg border border-edge-subtle p-2 sm:rounded-none sm:border-0 sm:p-4' : 'p-3 sm:p-4') + (selectedIds.includes(item.id) ? ' bg-brand-subtleBg' : '')}>
            {mobileLayout === 'grid' ? <div className="flex items-center justify-between sm:hidden"><input type="checkbox" aria-label={'Selecionar bronca ' + item.title} checked={selectedIds.includes(item.id)} onChange={() => toggleSelection(item.id)} className="h-3.5 w-3.5 accent-brand" />{reportActions(item)}</div> : null}
            <div className="flex items-start gap-2 sm:gap-3"><input type="checkbox" aria-label={'Selecionar bronca ' + item.title} checked={selectedIds.includes(item.id)} onChange={() => toggleSelection(item.id)} className={(mobileLayout === 'grid' ? 'hidden sm:block ' : '') + 'mt-1 h-3.5 w-3.5 shrink-0 accent-brand'} /><button type="button" onClick={() => change('bronca', item.id)} className="min-w-0 flex-1 rounded-lg text-left hover:text-brand focus-visible:ring-2 focus-visible:ring-brand">{mobileLayout === 'grid' ? <div className="sm:hidden"><AgencyReportImage report={item} thumbnail /><strong className="mt-2 line-clamp-2 text-xs">{item.title || 'Bronca sem título'}</strong><span className="mt-1 block truncate text-[10px] text-content-secondary">{item.neighborhood || 'Bairro não informado'}</span></div> : null}<div className={mobileLayout === 'grid' ? 'hidden sm:block' : ''}>{reportDetails(item)}</div></button><div className={mobileLayout === 'grid' ? 'hidden sm:block' : ''}>{reportActions(item)}</div></div>
            <div className={(mobileLayout === 'grid' ? 'mt-2 ' : 'ml-6 mt-2 ') + 'flex flex-wrap items-center gap-1.5 sm:gap-2'}><CategoryBadge report={item} /><AgeBadge createdAt={item.created_at} /><StatusBadge status={item.status} /><span className="ml-auto text-[10px] text-content-tertiary sm:text-[11px]">{date(item.created_at)}</span></div>
          </article>)}</div>
        </>}
        <nav aria-label="Paginação das broncas" className="grid grid-cols-1 items-center gap-3 border-t border-edge-subtle bg-surface-subtle/30 px-4 py-3 text-xs text-content-secondary sm:grid-cols-[1fr_auto_1fr]">
          <p aria-live="polite">{loading ? 'Carregando registros…' : total ? ((page - 1) * pageSize + 1) + '–' + Math.min(page * pageSize, total) + ' de ' + total.toLocaleString('pt-BR') + ' registros' : '0 registros'}</p>
          <div className="flex items-center justify-center gap-1.5"><Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => change('pagina', String(page - 1))}><ChevronLeft className="h-3.5 w-3.5" /></Button>{reportPageNumbers(page, pages).map((value) => typeof value === 'string' ? <span key={value} className="px-1" aria-hidden="true">…</span> : <button key={value} type="button" aria-label={'Página ' + value} aria-current={value === page ? 'page' : undefined} disabled={loading} onClick={() => change('pagina', String(value))} className={'h-8 min-w-8 rounded-lg border px-2 text-xs tabular-nums focus-visible:ring-2 focus-visible:ring-brand ' + (value === page ? 'border-brand bg-brand-subtleBg font-semibold text-brand-subtleFg' : 'border-edge-subtle bg-surface-raised hover:bg-surface-subtle')}>{value}</button>)}<Button variant="outline" size="icon" className="h-8 w-8 rounded-lg" aria-label="Próxima página" disabled={loading || page >= pages} onClick={() => change('pagina', String(page + 1))}><ChevronRight className="h-3.5 w-3.5" /></Button></div>
          <label className="flex items-center justify-end gap-3">Itens por página<select aria-label="Itens por página" value={pageSize} onChange={(event) => change('por_pagina', event.target.value)} className={selectClass + ' h-8'} disabled={loading}>{REPORT_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        </nav>
      </section>
    </>}
    {serviceOrderOpen && <MunicipalServiceOrderDialog context={context} selectedIds={selectedIds} onRemove={(id) => setSelectedIds((current) => current.filter((value) => value !== id))} onClose={() => setServiceOrderOpen(false)} onCreated={() => { setRevision((value) => value + 1); setSelectedIds([]); }} onOpenOrder={(id) => { setServiceOrderOpen(false); openDemand(id); }} />}
    <MunicipalReportDrawer open={Boolean(activeReportId) && !activeDemandId} reportId={activeReportId} context={context} onClose={closeReport} onCreateDemand={(id) => { closeReport(); setSelectedIds([id]); setServiceOrderOpen(true); }} onOpenDemand={(id) => openDemand(id)} />
    <MunicipalDemandDrawer open={Boolean(activeDemandId)} demandId={activeDemandId} reportId={linkedReportId} context={context} onClose={closeDemand} onSaved={saved} />
  </div>;
}
