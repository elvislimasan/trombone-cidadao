import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { Building2, CalendarDays, ChevronDown, Download, FileText, Filter, Home, Info, Landmark, List, Loader2, Map, MapPin, Pencil, Plus, Scissors, Search, Trees, Trash2, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, FormDialogContent } from '@/components/ui/dialog';
import CitySelector from '@/components/CitySelector';
import FullscreenMapPanel from '@/components/map/FullscreenMapPanel';
import TreeMap from '@/components/arborization/TreeMap';
import TreeFormDialog from '@/components/arborization/TreeFormDialog';
import TreeNeighborhoodSidebar from '@/components/arborization/TreeNeighborhoodSidebar';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import { useCanManagePavement as useCanManageUrbanPlanning } from '@/hooks/useCanManagePavement';
import { supabase } from '@/lib/customSupabaseClient';
import { salvarDocumento } from '@/lib/nativeDownload';
import { TREE_STATUS, TREE_ORIGINS, TREE_ACTIONS, TREE_PLANTED_BY, filterTrees, loadCityTrees, treesCsv, treeStats, treeLabel } from '@/lib/arborization';
import { loadTreeCatalogs, treeNeighborhoodCounts, treeRequestCounts, uploadTreePhoto } from '@/lib/treeInventory';

const EMPTY_FILTERS = { search: '', status: 'all', origin: 'all', neighborhood: 'all', action: 'all', plantedBy: 'all', plantedYear: '', historic: 'all', centenarian: 'all', minAge: '', maxAge: '' };
const selectClass = 'arborization-select';
const COMPACT_FILTERS_QUERY = '(max-width: 979px)';

function InventoryBackdrop() {
  return <svg className="arborization-backdrop" viewBox="0 0 720 180" fill="none" aria-hidden="true">
    <path d="M0 170c110-23 175-4 260-15 153-19 264-8 460-21v46H0Z" fill="#d7ebdf" />
    <g fill="#c9e3d4">
      <path d="M100 165v-39h27v39m10 0V99h32v66m17 0v-52h25v52m19 0V77h28v88m10 0v-45h38v45m18 0v-57h28v57m88 0v-37h41v37m13 0V90h24v75m15 0v-54h31v54m9 0V65h21v100m12 0v-42h30v42m16 0v-68h31v68m12 0V55h26v110m12 0v-36h29v36" />
      <path d="m238 77 6-19 6 19m249-12 10-26 10 26m129-10 11-28 11 28" />
    </g>
    {[{ x: 52, y: 104, scale: 1.1 }, { x: 376, y: 106, scale: 0.85 }, { x: 578, y: 128, scale: 0.6 }, { x: 695, y: 105, scale: 0.8 }].map(({ x, y, scale }) => <g key={x} transform={`translate(${x} ${y}) scale(${scale})`}>
      <path d="M0 57V-4m0 37-23-22M0 27 23 5M0 42l31-20" stroke="#8fb59a" strokeWidth="3" strokeLinecap="round" />
      <path d="M-38 4c-15-21 5-37 22-33 1-18 29-20 37-7 22-5 37 12 30 24 22 21 3 39-17 33-8 16-34 14-41 4-24 9-44-7-31-21Z" fill="#9bc7a3" fillOpacity=".8" />
      <path d="M-28 6C-6-7 22-11 39 0" stroke="#b9d8bb" strokeWidth="9" strokeLinecap="round" />
    </g>)}
  </svg>;
}

function InventoryViewToggle({ view, onChange }) {
  return <ToggleGroup type="single" value={view} onValueChange={value => value && onChange(value)} className="arborization-view-toggle" aria-label="Visualização">
    <ToggleGroupItem value="map" aria-label="Ver mapa"><Map className="h-4 w-4" />Mapa</ToggleGroupItem>
    <ToggleGroupItem value="list" aria-label="Ver lista"><List className="h-4 w-4" />Lista</ToggleGroupItem>
  </ToggleGroup>;
}

function StatusBadge({ status }) {
  const info = TREE_STATUS[status];
  return <span className="inline-flex items-center gap-1.5 text-xs font-semibold"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: info?.color }} />{info?.label}</span>;
}

function ArborizationContent({ management }) {
  const { cityId, cityName, city, cities } = useCityView();
  const { canManage, loading: permissionsLoading } = useCanManageUrbanPlanning(cityId);
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [compactFilters, setCompactFilters] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_FILTERS_QUERY).matches);
  const [view, setView] = useState(management ? 'list' : 'map');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [catalogNeighborhoods, setCatalogNeighborhoods] = useState([]);
  const [counts, setCounts] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  useEffect(() => {
    const media = window.matchMedia(COMPACT_FILTERS_QUERY);
    const update = () => { setCompactFilters(media.matches); if (!media.matches) setFilterDialogOpen(false); };
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
      return () => media.removeEventListener('change', update);
    }
    media.addListener(update);
    return () => media.removeListener(update);
  }, []);
  useEffect(() => {
    const refresh = () => setRevision(value => value + 1);
    window.addEventListener('reports-updated', refresh);
    return () => window.removeEventListener('reports-updated', refresh);
  }, []);
  useEffect(() => {
    let cancelled = false;
    setCounts(null); setSummaryError('');
    Promise.all([loadTreeCatalogs(supabase, cityId), treeRequestCounts(supabase, cityId)]).then(([catalogs, requests]) => {
      if (!cancelled) { setCatalogNeighborhoods(catalogs.neighborhoods); setCounts(requests); }
    }).catch(() => { if (!cancelled) setSummaryError('Os indicadores de solicitações e o cadastro de bairros não puderam ser carregados.'); });
    return () => { cancelled = true; };
  }, [cityId, revision]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    loadCityTrees(supabase, cityId).then(data => { if (!cancelled) setTrees(data); })
      .catch(err => { if (!cancelled) { setTrees([]); setError(['42P01', 'PGRST205'].includes(err.code) ? 'O inventário de arborização ainda não está disponível nesta instalação.' : 'Não foi possível carregar as árvores. Tente novamente.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cityId, revision]);

  const filtered = useMemo(() => filterTrees(trees, filters).map(tree => ({ ...tree, service_requests: counts ? Number(counts.get(tree.id)?.total || 0) : null })), [trees, filters, counts]);
  const stats = useMemo(() => treeStats(filtered), [filtered]);
  const services = useMemo(() => counts ? filtered.reduce((total, tree) => { const row = counts.get(tree.id); return { total: total.total + Number(row?.total || 0), poda: total.poda + Number(row?.poda || 0), remocao: total.remocao + Number(row?.remocao || 0) }; }, { total: 0, poda: 0, remocao: 0 }) : null, [filtered, counts]);
  const neighborhoodCounts = useMemo(() => treeNeighborhoodCounts(filtered, catalogNeighborhoods), [filtered, catalogNeighborhoods]);
  const neighborhoods = useMemo(() => [...new Set(trees.map(tree => tree.neighborhood).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [trees]);
  const previewCount = useMemo(() => filterTrees(trees, draftFilters).length, [trees, draftFilters]);
  const setFilter = (key, value) => setDraftFilters(current => ({ ...current, [key]: value }));
  const applyFilters = event => { event.preventDefault(); setFilters(draftFilters); setPage(1); setSelected(null); setFilterDialogOpen(false); };
  const resetFilters = () => { setFilters(EMPTY_FILTERS); setDraftFilters(EMPTY_FILTERS); setPage(1); setSelected(null); };
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== EMPTY_FILTERS[key]).length;
  const activeFilters = activeFilterCount > 0;
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pageCount);

  const save = useCallback(async (payload, id, photo) => {
    if (!canManage || String(payload.city_id) !== String(cityId)) throw new Error('Você não tem permissão para gerenciar a arborização desta cidade.');
    const uploaded = await uploadTreePhoto(supabase, photo, cityId);
    if (uploaded) payload = { ...payload, photo_url: uploaded.url };
    const query = id ? supabase.from('city_trees').update(payload).eq('id', id).eq('city_id', cityId) : supabase.from('city_trees').insert(payload);
    const { data, error: saveError } = await query.select().single();
    if (saveError) { if (uploaded) await supabase.storage.from('tree-photos').remove([uploaded.path]); throw new Error('Não foi possível salvar. Verifique sua conexão e a permissão na cidade.'); }
    setTrees(current => id ? current.map(tree => tree.id === id ? data : tree) : [data, ...current]);
    setSelected(data); setView('map'); setNotice(id ? 'Árvore atualizada.' : `Árvore cadastrada.${data.public_code ? ` Código: ${data.public_code}.` : ''}`);
  }, [canManage, cityId]);

  const showTreeOnMap = tree => { setSelected(tree); setView('map'); };

  const remove = async event => {
    event.preventDefault();
    if (!canManage || !deleting || busy) return;
    setBusy(true); setNotice('');
    try {
      const { error: deleteError } = await supabase.from('city_trees').delete().eq('id', deleting.id).eq('city_id', cityId).select('id').single();
      if (deleteError) throw deleteError;
      setTrees(current => current.filter(tree => tree.id !== deleting.id));
      if (selected?.id === deleting.id) setSelected(null);
      setDeleting(null); setNotice('Cadastro excluído.');
    } catch { setNotice('Não foi possível excluir. Verifique sua conexão e a permissão na cidade.'); }
    finally { setBusy(false); }
  };

  const download = async () => {
    setBusy(true);
    try {
      if (!counts) throw new Error('Indicadores indisponíveis');
      const csv = treesCsv(filtered, cities);
      const fileName = `arborizacao_${cityId || 'cidades'}_${new Date().toISOString().slice(0, 10)}.csv`;
      if (Capacitor.isNativePlatform()) {
        let binary = ''; for (const byte of new TextEncoder().encode(csv)) binary += String.fromCharCode(byte);
        await salvarDocumento({ base64: btoa(binary), fileName, contentType: 'text/csv', tituloShare: 'Inventário de arborização' });
      } else {
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a'); link.href = url; link.download = fileName; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch { setNotice('Não foi possível exportar o inventário. Tente novamente.'); }
    finally { setBusy(false); }
  };

  const filterForm = (
        <form onSubmit={applyFilters}>
        <div className="arborization-filter-heading"><h2><Filter className="h-4 w-4" aria-hidden="true" /><span className="arborization-filter-title-full hidden lg:inline">Explore o inventário</span><span className="arborization-filter-title-short lg:hidden">Filtros</span></h2><Button type="button" variant="ghost" size="sm" aria-label="Limpar filtros" onClick={resetFilters}><span className="hidden lg:inline">Limpar filtros</span><span className="lg:hidden">Limpar</span></Button></div>
        <label className="arborization-search"><span className="sr-only">Buscar árvore</span><Search aria-hidden="true" /><Input placeholder="Busque por código, espécie, rua ou bairro…" value={draftFilters.search} onChange={event => setFilter('search', event.target.value)} /></label>
        <div className="arborization-filter-fields" id="arborization-filter-fields">
          {[
            ['status', 'Situação', Trees, Object.entries(TREE_STATUS).map(([key, value]) => [key, value.label])],
            ['origin', 'Origem', Info, Object.entries(TREE_ORIGINS)],
            ['neighborhood', 'Bairro', MapPin, neighborhoods.map(value => [value, value])],
            ['action', 'Manejo', Building2, [['pending', 'Todos os manejos pendentes'], ...Object.entries(TREE_ACTIONS)]],
            ['plantedBy', 'Responsável pelo plantio', Home, Object.entries(TREE_PLANTED_BY)],
            ['historic', 'Sítio histórico', Landmark, [['yes', 'Sim'], ['no', 'Não']]],
          ].map(([key, label, Icon, options], index) => <div key={key} className={`arborization-filter-row ${index > 2 ? 'arborization-filter-advanced' : ''}`}><span className="arborization-field-icon"><Icon aria-hidden="true" /></span><label>{label}<select className={selectClass} value={draftFilters[key]} onChange={event => setFilter(key, event.target.value)}><option value="all">Todos</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label></div>)}
          <div className="arborization-filter-row arborization-filter-advanced"><span className="arborization-field-icon"><CalendarDays aria-hidden="true" /></span><fieldset className="min-w-0 flex-1"><legend>Faixa de idade</legend><div className="arborization-age-range"><Input type="number" min="0" max={draftFilters.maxAge || undefined} aria-label="Idade mínima" placeholder="Mín." value={draftFilters.minAge} onChange={event => setFilter('minAge', event.target.value)} /><span>–</span><Input type="number" min={draftFilters.minAge || '0'} aria-label="Idade máxima" placeholder="Máx." value={draftFilters.maxAge} onChange={event => setFilter('maxAge', event.target.value)} /><span>anos</span></div></fieldset></div>
          <details className="arborization-additional-filters arborization-filter-advanced"><summary>Outros filtros</summary><label>Ano do plantio<Input type="number" min="1" max={new Date().getFullYear()} placeholder="Ex.: 2025" value={draftFilters.plantedYear} onChange={event => setFilter('plantedYear', event.target.value)} /></label><label>Idade estimada<select className={selectClass} value={draftFilters.centenarian} onChange={event => setFilter('centenarian', event.target.value)}><option value="all">Todas as idades</option><option value="yes">Centenárias (100 anos ou mais)</option></select></label></details>
        </div>
        <Button type="button" variant="ghost" className="arborization-more-filters lg:hidden" aria-expanded={filtersOpen} aria-controls="arborization-filter-fields" onClick={() => setFiltersOpen(value => !value)}>{filtersOpen ? 'Menos filtros' : 'Mais filtros'}<ChevronDown className={`h-4 w-4 ${filtersOpen ? 'rotate-180' : ''}`} /></Button>
        <Button type="submit" aria-label="Aplicar filtros" className="arborization-primary arborization-apply" disabled={loading}><Search className="h-4 w-4" />Aplicar filtros ({previewCount.toLocaleString('pt-BR')})</Button>
        </form>
  );

  return <main className="page-shell-fluid arborization-page" data-testid="arborization-page">
    <Helmet><title>{management ? 'Gerenciar arborização' : 'Mapa de arborização'} — Trombone Cidadão</title><meta name="description" content="Consulte o inventário de árvores da cidade, espécies, estado de conservação e necessidades de manejo." /></Helmet>
    <InventoryBackdrop />
    <div className="arborization-header">
      <div className="arborization-intro"><span className="arborization-title-icon"><Trees aria-hidden="true" /></span><div className="min-w-0"><p className="arborization-eyebrow">Meio ambiente · {cityName || 'Todas as cidades'}{city?.state?.uf ? ` · ${city.state.uf}` : ''}</p><h1>{management ? 'Gerenciar arborização' : 'Mapa de arborização'}</h1><p className="arborization-subtitle">Conheça as árvores da cidade e acompanhe os cuidados com cada uma.</p></div></div>
      <div className="arborization-city"><CitySelector /><ChevronDown className="arborization-city-chevron" aria-hidden="true" /></div>
    </div>
    <section aria-label="Indicadores do inventário filtrado" className="arborization-stats">
      {[
        [Trees, 'Árvores no inventário', stats.total, 'green', 'Total de árvores cadastradas na cidade'],
        [FileText, 'Solicitações de serviço', services?.total, 'blue', 'Serviços vinculados às árvores'],
        [Scissors, 'Solicitações de poda', services?.poda, 'orange', 'Pedidos de poda registrados'],
        [Trash2, 'Solicitações de remoção', services?.remocao, 'red', 'Pedidos de remoção registrados'],
      ].map(([Icon, label, value, tone, description]) => <div key={label} className="arborization-stat">
        <span className={`arborization-stat-icon arborization-tone-${tone}`}><Icon aria-hidden="true" /></span>
        <div className="min-w-0"><p className="arborization-stat-value">{loading || value == null ? '—' : value.toLocaleString('pt-BR')}</p><p className="arborization-stat-label">{label}</p><p className="arborization-stat-description">{description}</p></div>
      </div>)}
    </section>
    <div className="arborization-actions">{canManage && <Button onClick={() => setForm({})} className="arborization-primary arborization-create"><Plus className="h-4 w-4" />Cadastrar árvore</Button>}<Button variant="outline" className="arborization-export" disabled={loading || busy || !filtered.length || !counts} onClick={download}><Download className="h-4 w-4" />Exportar CSV</Button></div>
    {(notice || summaryError || (management && !permissionsLoading && !canManage)) && <div className="arborization-notices">
      {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border bg-surface-raised p-3 text-sm">{notice}<Button variant="ghost" size="icon" aria-label="Fechar aviso" onClick={() => setNotice('')}><X className="h-4 w-4" /></Button></div>}
      {management && !permissionsLoading && !canManage && <p className="rounded-xl border bg-surface-raised p-3 text-sm text-muted-foreground">{cityId ? 'Consulta pública. O gerenciamento exige permissão de Planejamento Urbano nesta cidade.' : 'Selecione uma cidade para acessar o gerenciamento do inventário.'}</p>}
      {summaryError && <p role="alert" className="text-sm text-destructive">{summaryError} <Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></p>}
    </div>}
    {compactFilters && <div className="arborization-mobile-controls">
      <p>{loading ? 'Carregando árvores…' : `${filtered.length.toLocaleString('pt-BR')} ${filtered.length === 1 ? 'árvore encontrada' : 'árvores encontradas'}`}</p>
      <Dialog open={filterDialogOpen} onOpenChange={open => {
        if (open) { setDraftFilters(filters); setFiltersOpen(false); }
        setFilterDialogOpen(open);
      }}>
        <DialogTrigger asChild><Button variant="outline" className="arborization-filter-trigger"><Filter className="h-4 w-4" />Filtros{activeFilterCount > 0 && <span className="arborization-filter-count">{activeFilterCount}</span>}</Button></DialogTrigger>
        <FormDialogContent aria-describedby={undefined} id="arborization-filters" className={`arborization-filters arborization-filter-dialog ${filtersOpen ? 'is-expanded' : ''}`}>
          <DialogTitle className="sr-only">Filtros de arborização</DialogTitle>
          {filterForm}
        </FormDialogContent>
      </Dialog>
    </div>}
    <div className="arborization-workspace">
      {!compactFilters && <aside id="arborization-filters" className={`arborization-filters ${filtersOpen ? 'is-expanded' : ''}`}>
        {filterForm}
      </aside>}
      <section className="arborization-results min-w-0 space-y-3" aria-label="Resultados do inventário">
        {error ? <div role="alert" className="rounded-2xl border p-8 text-center"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div> : loading ? <div className="flex h-[500px] items-center justify-center gap-2 rounded-2xl border"><Loader2 className="h-5 w-5 animate-spin" />Carregando árvores…</div> : <>
          {!filtered.length && trees.length > 0 && <div className="rounded-xl border border-dashed bg-surface-raised p-5 text-center"><Trees className="mx-auto mb-2 h-7 w-7 text-muted-foreground" /><h2 className="font-semibold">Nenhuma árvore encontrada</h2><p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros para encontrar outros registros.</p>{activeFilters && <Button variant="outline" className="mt-3" onClick={resetFilters}>Limpar filtros</Button>}</div>}
          {view === 'map' ? (
            <div className="arborization-map-panel relative isolate overflow-hidden rounded-2xl border border-edge-subtle" data-testid="tree-map">
              <FullscreenMapPanel title="Mapa de arborização" buttonClassName="arborization-fullscreen right-3 top-3">
                <TreeMap showLegend toolbar={<InventoryViewToggle view={view} onChange={setView} />} trees={filtered} city={city} selected={selected} onSelect={setSelected}
                  onDeselect={id => setSelected(current => current?.id === id ? null : current)}
                  canManage={canManage} onEdit={setForm} onDelete={setDeleting} />
              </FullscreenMapPanel>
            </div>
          ) : (
            <div className="space-y-3"><div className="arborization-list-toolbar"><InventoryViewToggle view={view} onChange={setView} /><p role="status">{filtered.length.toLocaleString('pt-BR')} {filtered.length === 1 ? 'árvore encontrada' : 'árvores encontradas'}</p></div><div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {filtered.slice((currentPage - 1) * 30, currentPage * 30).map(tree => (
                <article key={tree.id} className="min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-4">
                  {tree.photo_url && <img src={tree.photo_url} alt={`Árvore: ${tree.common_name}`} loading="lazy" className="mb-3 h-36 w-full rounded-lg object-cover" />}
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="min-w-0 text-left" onClick={() => showTreeOnMap(tree)}>
                      <h3 className="break-words font-semibold">{treeLabel(tree)}</h3>
                      {tree.scientific_name && <p className="mt-0.5 break-words text-xs italic text-muted-foreground">{tree.scientific_name}</p>}
                    </button>
                    <StatusBadge status={tree.status} />
                  </div>
                  <p className="mt-3 break-words text-sm text-muted-foreground">{tree.address || 'Endereço não informado'}{tree.neighborhood ? ` · ${tree.neighborhood}` : ''}</p>
                  {!cityId && <p className="mt-1 text-xs text-muted-foreground">{cities.find(item => String(item.id) === String(tree.city_id))?.name || `Cidade ${tree.city_id}`}</p>}
                  <p className="mt-2 text-xs">{TREE_ORIGINS[tree.origin]} · {TREE_ACTIONS[tree.maintenance_action]}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" asChild><Link to={`/arborizacao/arvore/${tree.id}`}>Ver detalhes</Link></Button>
                    <Button variant="ghost" size="sm" onClick={() => showTreeOnMap(tree)}><MapPin className="mr-1 h-4 w-4" />No mapa</Button>
                    {canManage && <Button variant="ghost" size="sm" onClick={() => setForm(tree)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>}
                  </div>
                </article>
              ))}
            </div></div>
          )}
          {view === 'list' && pageCount > 1 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span className="text-sm">{currentPage} / {pageCount}</span><Button variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div>}
        </>}
      </section>
      <p className="arborization-data-note">Solicitações conforme sua permissão de acesso. Uma solicitação não significa serviço executado.</p>
      <TreeNeighborhoodSidebar neighborhoods={neighborhoodCounts} unidentified={filtered.filter(tree => !tree.neighborhood && tree.status !== 'removida').length} loading={loading} error={error} />
    </div>
    {form && canManage && <TreeFormDialog tree={form} city={city} cityId={cityId} onClose={() => setForm(null)} onSave={save} />}
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle>Excluir cadastro de {treeLabel(deleting)}?</DialogTitle>
          <DialogDescription>Esta ação exclui o registro do inventário. Para manter o histórico de uma árvore retirada, edite sua situação para “Removida”.</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button disabled={busy} onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{busy ? 'Excluindo…' : 'Excluir cadastro'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </main>;
}

function ScopedContent(props) {
  const { cityId } = useCityView();
  // Trocar a cidade descarta seleções e rascunhos da anterior.
  return <ArborizationContent key={String(cityId)} {...props} />;
}

export default function ArborizationMapPage(props) {
  return <CityViewProvider><ScopedContent {...props} /></CityViewProvider>;
}
