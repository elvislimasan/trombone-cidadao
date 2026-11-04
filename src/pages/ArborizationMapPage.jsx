import { Helmet } from 'react-helmet';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Leaf, List, Loader2, MapPin, Pencil, Search, Filter, Trees, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, FormDialogContent } from '@/components/ui/dialog';
import CitySelector from '@/components/CitySelector';
import FullscreenMapPanel from '@/components/map/FullscreenMapPanel';
import { MAP_LAYER } from '@/components/map/MapDisplayControls';
import TreeInventorySummary from '@/components/arborization/TreeInventorySummary';
import TreeLocationSelect from '@/components/arborization/TreeLocationSelect';
import '@/components/arborization/treeInventoryRedesign.css';
import '@/components/arborization/treeInventoryList.css';
import TreeMap from '@/components/arborization/TreeMap';
import TreeFormDialog from '@/components/arborization/TreeFormDialog';
import TreePlanningReport from '@/components/arborization/TreePlanningReport';
import { treePlanningCsv, treePlanningLocations, treeStreetKey, treeStreetName, isLivingTree } from '@/lib/treePlanning';
import TreePhoto from '@/components/arborization/TreePhoto';
import TreeMaintenanceDialog from '@/components/arborization/TreeMaintenanceDialog';
import TreeInventoryActions from '@/components/arborization/TreeInventoryActions';
import TreeNeighborhoodSidebar from '@/components/arborization/TreeNeighborhoodSidebar';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import { useCanManageArborization } from '@/hooks/useCanManageArborization';
import { supabase } from '@/lib/customSupabaseClient';
import { salvarDocumento } from '@/lib/nativeDownload';
import { TREE_STATUS, TREE_ORIGINS, TREE_ACTIONS, TREE_PLANTED_BY, filterTrees, loadCityTrees, treesCsv, treeLabel } from '@/lib/arborization';
import { treeInventoryHighlights, withTreeSpecies } from '@/lib/treeSpecies';
import { allTreeRows, treeNeighborhoodCounts, treeRequestCounts, uploadTreePhoto } from '@/lib/treeInventory';
import { treeMaintenancePayload, treeMaintenanceSelection } from '@/lib/treeMaintenance';

const EMPTY_FILTERS = { street: 'all', registration: 'all', planningYear: '', search: '', species: 'all', status: 'all', origin: 'all', neighborhood: 'all', action: 'all', plantedBy: 'all', plantedYear: '', historic: 'all', centenarian: 'all', minAge: '', maxAge: '' };
const selectClass = 'arborization-select';
const COMPACT_FILTERS_QUERY = '(max-width: 979px)';
const LIST_PAGE_SIZE = 12;

function StatusBadge({ status }) {
  const info = TREE_STATUS[status];
  if (!info) return null;
  return <span className="arborization-tree-status" style={{ '--tree-status': info.color }}><span aria-hidden="true" />{info.label}</span>;
}

export function ArborizationContent({ management, embedded = false }) {
  const location = useLocation();
  const { cityId, cityName, city, cities } = useCityView();
  const { canManage, loading: permissionsLoading } = useCanManageArborization(cityId);
  const [trees, setTrees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [filterDialogOpen, setFilterDialogOpen] = useState(false);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [statisticsOpen, setStatisticsOpen] = useState(false);
  const [compactFilters, setCompactFilters] = useState(() => typeof window !== 'undefined' && window.matchMedia(COMPACT_FILTERS_QUERY).matches);
  const [view, setView] = useState(management && !embedded ? 'list' : 'map');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [batchMode, setBatchMode] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [mapExpanded, setMapExpanded] = useState(false);
  const inventoryMapRef = useRef(null);
  const [registrationView, setRegistrationView] = useState(null);
  const handleMapReady = useCallback(map => { inventoryMapRef.current = map; }, []);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);
  const [catalogNeighborhoods, setCatalogNeighborhoods] = useState([]);
  const [catalogStreets, setCatalogStreets] = useState([]);
  const [speciesCatalog, setSpeciesCatalog] = useState([]);
  const [counts, setCounts] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  useEffect(() => {
    setFilters(current => ({ ...current, species: 'all' }));
    setDraftFilters(current => ({ ...current, species: 'all' }));
    setPage(1); setSelected(null);
  }, [cityId]);
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
    window.addEventListener('tree-adoption-updated', refresh);
    return () => { window.removeEventListener('reports-updated', refresh); window.removeEventListener('tree-adoption-updated', refresh); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    setCounts(null); setCatalogNeighborhoods([]); setCatalogStreets([]); setSpeciesCatalog([]); setSummaryError('');
    const neighborhoods = cityId ? allTreeRows(supabase, 'bairros', query => query.eq('city_id', cityId)) : Promise.resolve([]);
    const species = allTreeRows(supabase, 'city_tree_species', query => cityId ? query.eq('city_id', cityId) : query);
    const streets = allTreeRows(supabase, 'pavement_streets', query => cityId ? query.eq('city_id', cityId) : query);
    Promise.allSettled([neighborhoods, treeRequestCounts(supabase, cityId), species, streets]).then(([catalogs, requests, speciesResult, streetsResult]) => {
      if (cancelled) return;
      if (catalogs.status === 'fulfilled') setCatalogNeighborhoods(catalogs.value);
      if (requests.status === 'fulfilled') setCounts(requests.value);
      if (speciesResult.status === 'fulfilled') setSpeciesCatalog(speciesResult.value);
      if (streetsResult.status === 'fulfilled') setCatalogStreets(streetsResult.value);
      const failed = [];
      if (catalogs.status === 'rejected') failed.push('O cadastro de bairros não pôde ser carregado.');
      if (requests.status === 'rejected') failed.push('Os indicadores de solicitações não puderam ser carregados.');
      if (speciesResult.status === 'rejected') failed.push('As imagens ilustrativas das espécies não puderam ser carregadas.');
      setSummaryError(failed.join(' '));
    });
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

  const treesWithImages = useMemo(() => {
    const catalog = new Map(speciesCatalog.map(species => [species.id, species]));
    return treePlanningLocations(trees, catalogNeighborhoods, catalogStreets).map(tree => withTreeSpecies(tree, catalog.get(tree.species_id)));
  }, [trees, speciesCatalog, catalogNeighborhoods, catalogStreets]);
  const speciesOptions = useMemo(() => {
    const options = new Map(speciesCatalog.map(item => [String(item.id), item]));
    for (const tree of trees) if (tree.species_id && !options.has(String(tree.species_id))) options.set(String(tree.species_id), { id: tree.species_id, common_name: tree.common_name, scientific_name: tree.scientific_name });
    return [...options.values()].sort((a, b) => a.common_name.localeCompare(b.common_name, 'pt-BR'));
  }, [trees, speciesCatalog]);
  const filtered = useMemo(() => filterTrees(treesWithImages, filters).map(tree => ({ ...tree, service_requests: counts ? Number(counts.get(tree.id)?.total || 0) : null })), [treesWithImages, filters, counts]);
  const neighborhoodCounts = useMemo(() => treeNeighborhoodCounts(filtered, catalogNeighborhoods), [filtered, catalogNeighborhoods]);
  const stats = useMemo(() => treeInventoryHighlights(filtered, neighborhoodCounts), [filtered, neighborhoodCounts]);
  const neighborhoods = useMemo(() => [...new Set(treesWithImages.map(tree => tree.neighborhood).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [treesWithImages]);
  const streetOptions = useMemo(() => [...new Map(treesWithImages.filter(tree => treeStreetName(tree)).map(tree => [treeStreetKey(tree), treeStreetName(tree)])).entries()].sort((a, b) => a[1].localeCompare(b[1], 'pt-BR')), [treesWithImages]);
  const planningYears = useMemo(() => [...new Set(trees.map(tree => tree.planting_year).filter(Boolean))].sort((a, b) => a - b), [trees]);
  const previewCount = useMemo(() => filterTrees(treesWithImages, draftFilters).length, [treesWithImages, draftFilters]);
  const setFilter = (key, value) => setDraftFilters(current => ({ ...current, [key]: value }));
  const setMainFilter = (key, value) => {
    setFilters(current => ({ ...current, [key]: value }));
    setDraftFilters(current => ({ ...current, [key]: value }));
    setPage(1); setSelected(null);
  };
  const applyFilters = event => { event.preventDefault(); setFilters(draftFilters); setPage(1); setSelected(null); setFilterDialogOpen(false); };
  const resetFilters = () => { setFilters(EMPTY_FILTERS); setDraftFilters(EMPTY_FILTERS); setPage(1); setSelected(null); };
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => value !== EMPTY_FILTERS[key]).length;
  const advancedFilterCount = Object.entries(filters).filter(([key, value]) => !['search', 'registration'].includes(key) && value !== EMPTY_FILTERS[key]).length;
  const activeFilters = activeFilterCount > 0;
  const pageCount = Math.max(1, Math.ceil(filtered.length / LIST_PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const save = useCallback(async (payload, id, photo) => {
    if (!canManage || String(payload.city_id) !== String(cityId)) throw new Error('Você não tem permissão para gerenciar a arborização desta cidade.');
    const uploaded = await uploadTreePhoto(supabase, photo, cityId);
    if (uploaded) payload = { ...payload, photo_url: uploaded.url };
    const query = id ? supabase.from('city_trees').update(payload).eq('id', id).eq('city_id', cityId) : supabase.from('city_trees').insert(payload);
    const { data, error: saveError } = await query.select().single();
    if (saveError) { if (uploaded) await supabase.storage.from('tree-photos').remove([uploaded.path]); throw new Error('Não foi possível salvar. Verifique sua conexão e a permissão na cidade.'); }
    setTrees(current => id ? current.map(tree => tree.id === id ? data : tree) : [data, ...current]);
    setSelected(null); setView('map'); setNotice(id ? '' : `Árvore cadastrada.${data.public_code ? ` Código: ${data.public_code}.` : ''}`);
  }, [canManage, cityId]);

  const saveBatch = useCallback(async (payloads, photo) => {
    if (!canManage || !cityId || !payloads.length || payloads.some(payload => String(payload.city_id) !== String(cityId))) throw new Error('Você não tem permissão para gerenciar a arborização desta cidade.');
    // Um único INSERT mantém o lote atômico: uma falha não deixa cadastros parciais.
    const uploaded = await uploadTreePhoto(supabase, photo, cityId);
    if (uploaded) payloads = payloads.map(payload => ({ ...payload, photo_url: uploaded.url }));
    const { data, error: saveError } = await supabase.from('city_trees').insert(payloads).select();
    if (saveError) { if (uploaded) await supabase.storage.from('tree-photos').remove([uploaded.path]); throw new Error('Não foi possível salvar o lote. Verifique sua conexão e a permissão na cidade. Os pontos foram mantidos.'); }
    setTrees(current => [...data, ...current]);
    setSelected(null);
    setNotice(`${data.length} árvores cadastradas em lote.`);
  }, [canManage, cityId]);
  const startRegistration = (batch, tree = {}) => {
    const map = inventoryMapRef.current;
    setRegistrationView(map ? { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() } : null);
    setSelected(null); setMapExpanded(false); setView('map'); setBatchMode(batch); setForm(tree);
  };
  const startSingle = tree => startRegistration(false, tree);
  const startBatch = () => startRegistration(true);
  const startMaintenance = () => {
    const map = inventoryMapRef.current;
    setRegistrationView(map ? { center: [map.getCenter().lat, map.getCenter().lng], zoom: map.getZoom() } : null);
    setSelected(null); setMapExpanded(false); setView('map'); setMaintenanceOpen(true);
  };
  const saveMaintenance = async (treeIds, values) => {
    if (!canManage) throw new Error('Você não tem permissão para programar manejo nesta cidade.');
    const ids = treeMaintenanceSelection(trees, treeIds, cityId);
    const payload = treeMaintenancePayload(values.maintenance_action, values.maintenance_due_at || '');
    const { data, error: saveError } = await supabase.rpc('schedule_city_tree_maintenance', {
      p_city_id: cityId, p_tree_ids: ids, p_action: payload.maintenance_action, p_due_at: payload.maintenance_due_at,
    });
    if (saveError) {
      if (saveError.code === 'PGRST202') throw new Error('O manejo em lote ainda não está disponível nesta instalação.');
      if (['42501', '22023'].includes(saveError.code)) throw new Error(saveError.message);
      throw new Error('Não foi possível programar o manejo. Verifique a conexão. A seleção foi mantida para tentar novamente.');
    }
    if (Number(data?.updated_count) !== ids.length) throw new Error('Não foi possível confirmar a programação. Atualize o mapa antes de tentar novamente.');
    const changed = new Set(ids);
    setTrees(current => current.map(tree => changed.has(tree.id) ? { ...tree, ...payload, ...(data.updated_at ? { updated_at: data.updated_at } : {}) } : tree));
    setNotice(`Manejo programado em ${ids.length} ${ids.length === 1 ? 'árvore' : 'árvores'}.`);
  };
  const endRegistration = () => { setForm(null); setBatchMode(false); setMapExpanded(false); };
  const changeView = value => { setView(value); if (value !== 'map') setMapExpanded(false); };

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

  const download = async (planningYear = null, reportTrees = null) => {
    setBusy(true);
    try {
      const planning = typeof planningYear === 'string';
      const csv = planning ? treePlanningCsv((reportTrees || filtered).filter(tree => planningYear === 'all' || String(tree.planting_year) === planningYear), cities) : treesCsv(filtered, cities);
      const fileName = `${planning ? 'planejamento_arborizacao' : 'arborizacao'}_${cityId || 'cidades'}_${new Date().toISOString().slice(0, 10)}.csv`;
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
        <div className="arborization-filter-heading"><DialogTitle>Filtros avançados</DialogTitle></div>
        <div className="arborization-filter-scroll">
        <div className="arborization-filter-fields" id="arborization-filter-fields">
          {[
            ['neighborhood', 'Bairro', [['unidentified', 'Sem bairro identificado'], ...neighborhoods.map(name => [name, name])]],
            ['street', 'Rua', [['unidentified', 'Sem rua identificada'], ...streetOptions]],
            ['status', 'Situação', [['living', 'Árvores vivas'], ...Object.entries(TREE_STATUS).map(([value, info]) => [value, info.label])]],
            ['registration', 'Tipo de cadastro', [['existing', 'Árvores existentes'], ['planned', 'Plantios planejados']]],
            ['species', 'Espécie', [['unidentified', 'Não identificada / sem vínculo no catálogo'], ...speciesOptions.map(item => [String(item.id), `${item.common_name}${item.scientific_name ? ` — ${item.scientific_name}` : ''}`])]],
            ['origin', 'Origem', Object.entries(TREE_ORIGINS)],
            ['action', 'Manejo', [['pending', 'Todos os manejos pendentes'], ...Object.entries(TREE_ACTIONS)]],
            ['plantedBy', 'Responsável pelo plantio', Object.entries(TREE_PLANTED_BY)],
            ['historic', 'Sítio histórico', [['yes', 'Sim'], ['no', 'Não']]],
          ].map(([key, label, options]) => <div key={key} className="arborization-filter-row">{key === 'street' ? <TreeLocationSelect label={label} items={options.map(([id, name]) => ({ id, name }))} value={draftFilters.street} onChange={value => setFilter('street', value)} placeholder="Todos" emptyLabel="Todos" emptyValue="all" searchLabel="Pesquisar rua" /> : <label>{label}<select className={selectClass} value={draftFilters[key]} onChange={event => setFilter(key, event.target.value)}><option value="all">Todos</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>}</div>)}
          <div className="arborization-filter-row"><label>Ano previsto de plantio<select className={selectClass} value={draftFilters.planningYear} onChange={event => setFilter('planningYear', event.target.value)}><option value="">Todos os anos</option>{planningYears.map(year => <option key={year} value={year}>{year}</option>)}</select></label></div>
          <div className="arborization-filter-row"><fieldset className="min-w-0 flex-1"><legend>Faixa de idade</legend><div className="arborization-age-range"><Input type="number" min="0" max={draftFilters.maxAge || undefined} aria-label="Idade mínima" placeholder="Mín." value={draftFilters.minAge} onChange={event => setFilter('minAge', event.target.value)} /><span>–</span><Input type="number" min={draftFilters.minAge || '0'} aria-label="Idade máxima" placeholder="Máx." value={draftFilters.maxAge} onChange={event => setFilter('maxAge', event.target.value)} /><span>anos</span></div></fieldset></div>
          <details className="arborization-additional-filters"><summary>Outros filtros</summary><label>Ano do plantio<Input type="number" min="1" max={new Date().getFullYear()} placeholder="Ex.: 2025" value={draftFilters.plantedYear} onChange={event => setFilter('plantedYear', event.target.value)} /></label><label>Idade estimada<select className={selectClass} value={draftFilters.centenarian} onChange={event => setFilter('centenarian', event.target.value)}><option value="all">Todas as idades</option><option value="yes">Centenárias (100 anos ou mais)</option></select></label></details>
        </div>
        </div>
        <div className="arborization-filter-footer">
        <Button type="submit" aria-label="Aplicar filtros" className="arborization-primary arborization-apply" disabled={loading}>Aplicar filtros ({previewCount.toLocaleString('pt-BR')})</Button>
        {activeFilters && <Button type="button" variant="ghost" size="sm" aria-label="Limpar filtros" onClick={resetFilters}>Limpar filtros</Button>}
        </div>
        </form>
  );

  const inventoryActions = <TreeInventoryActions canManage={canManage} loading={loading} error={error} busy={busy} hasResults={filtered.length > 0} hasLivingTrees={trees.some(isLivingTree)} cityId={cityId} view={view}
    onRegister={() => startSingle({})} onPlan={() => startSingle({ status: 'planejada' })} onBatch={startBatch} onMaintenance={startMaintenance}
    onPlanning={() => { setMapExpanded(false); setPlanningOpen(true); }} onStatistics={() => { setMapExpanded(false); setStatisticsOpen(true); }} onExport={() => download()} onChangeView={changeView} />;
  const Root = embedded ? 'div' : 'main';
  const FilterDialogContent = compactFilters ? FormDialogContent : DialogContent;
  const title = management ? 'Gerenciar arborização' : 'Mapa de arborização';
  const emptyState = <div className="rounded-xl border border-dashed bg-surface-raised p-5 text-center"><Trees className="mx-auto mb-2 h-7 w-7 text-content-secondary" /><h2 className="font-semibold">Nenhuma árvore encontrada</h2><p className="mt-1 text-sm text-content-secondary">Ajuste os filtros para encontrar outros registros.</p>{activeFilters && <Button variant="outline" className="mt-3" onClick={resetFilters}>Limpar filtros</Button>}</div>;
  const statusView = error ? <div role="alert" className="grid h-full place-content-center gap-3 p-8 text-center"><p>{error}</p><Button variant="outline" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div>
    : loading ? <div role="status" className="flex h-full min-h-48 items-center justify-center gap-2"><Loader2 className="h-5 w-5 animate-spin" />Carregando árvores…</div> : null;
  const dataNote = <p className="arborization-data-note">Solicitações conforme sua permissão de acesso. Uma solicitação não significa serviço executado.</p>;
  const listView = <div className="arborization-list">
    {statusView || (filtered.length ? <div className="arborization-tree-grid">{filtered.slice((currentPage - 1) * LIST_PAGE_SIZE, currentPage * LIST_PAGE_SIZE).map(tree => <article key={tree.id} className="arborization-tree-card">
      <div className="arborization-tree-card-heading"><button type="button" className="arborization-tree-title" onClick={() => showTreeOnMap(tree)}><h3>{treeLabel(tree)}</h3></button><StatusBadge status={tree.status} /></div>
      <div className="arborization-tree-card-body">
        <div className="arborization-tree-description">
          <p className="arborization-tree-address" title={[tree.address, tree.neighborhood].filter(Boolean).join(' · ')}>{tree.address || 'Endereço não informado'}{tree.neighborhood ? ` · ${tree.neighborhood}` : ''}</p>
          {!cityId && <p>{cities.find(item => String(item.id) === String(tree.city_id))?.name || `Cidade ${tree.city_id}`}</p>}
          <p>{tree.planting_year ? `Ano previsto: ${tree.planting_year} · ` : ''}{TREE_ORIGINS[tree.origin]} · {TREE_ACTIONS[tree.maintenance_action]}</p>
        </div>
        <TreePhoto tree={tree} className="arborization-tree-thumbnail" imageClassName="arborization-tree-thumbnail-image" captionClassName="arborization-tree-thumbnail-caption" />
      </div>
      <div className="arborization-tree-card-actions"><Button variant="outline" size="sm" asChild><Link to={`/arborizacao/arvore/${tree.id}`}>Ver detalhes</Link></Button><Button variant="ghost" size="sm" onClick={() => showTreeOnMap(tree)}><MapPin aria-hidden="true" />No mapa</Button>{canManage && <Button variant="ghost" size="sm" onClick={() => startSingle(tree)}><Pencil aria-hidden="true" />Editar</Button>}</div>
    </article>)}</div> : emptyState)}
    <footer className="arborization-list-footer">
      {dataNote}
      {!loading && !error && filtered.length > 0 && <nav className="arborization-list-pagination" aria-label="Paginação do inventário"><Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span aria-live="polite" aria-atomic="true">{currentPage} / {pageCount}</span><Button variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</Button></nav>}
    </footer>
  </div>;
  const emptyMapResults = view === 'map' && !loading && !error && !filtered.length && trees.length > 0;
  const filterToolbar = <div className="arborization-primary-filters" data-testid="arborization-filters-toolbar" aria-label="Filtros principais">
    <label className="arborization-search"><span className="sr-only">Buscar árvore</span><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-tertiary" /><Input className="h-10 pl-9 text-base sm:text-sm" placeholder="Buscar árvores…" value={filters.search} onChange={event => setMainFilter('search', event.target.value)} /></label>
    <label className="arborization-record-select"><span className="sr-only">Tipo de registro</span><Leaf className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-secondary" /><select className="h-10 w-full min-w-0 rounded-md border border-input bg-background pl-9 pr-6 text-sm" value={filters.registration} onChange={event => setMainFilter('registration', event.target.value)}><option value="all">Todos os registros</option><option value="existing">Árvores existentes</option><option value="planned">Plantios planejados</option></select></label>
    <Button variant="outline" className="arborization-filter-trigger h-10 gap-2" aria-expanded={filterDialogOpen} aria-controls="arborization-filters" onClick={() => setFilterDialogOpen(true)}><Filter size={16} />Filtros{advancedFilterCount > 0 && <span className="rounded-full bg-brand px-1.5 text-[10px] font-bold text-content-onBrand">{advancedFilterCount}</span>}</Button>
    {view === 'list' && <>
      <div className="arborization-list-view-toggle" role="group" aria-label="Visualização do inventário"><Button variant="ghost" aria-pressed={false} onClick={() => changeView('map')}><MapPin aria-hidden="true" />Mapa</Button><Button variant="ghost" aria-pressed={true} onClick={() => changeView('list')}><List aria-hidden="true" />Lista</Button></div>
      <p className="arborization-list-record-count" role="status">{loading ? 'Carregando…' : `${filtered.length.toLocaleString('pt-BR')} ${filtered.length === 1 ? 'registro' : 'registros'}`}</p>
    </>}
    {(activeFilters || emptyMapResults) && <div className="arborization-filter-feedback" role={emptyMapResults ? 'status' : undefined}>
      {emptyMapResults && <span>Nenhuma árvore encontrada com estes filtros.</span>}
      {activeFilters && <Button type="button" variant="ghost" size="sm" className="arborization-reset-filters h-7 gap-1 px-0 text-xs text-brand" onClick={resetFilters}><X size={14} />Limpar filtros ({activeFilterCount})</Button>}
    </div>}
  </div>;
  return <Root className={`${embedded ? 'min-w-0 arborization-embedded' : 'page-shell-fluid'} arborization-page arborization-inventory-layout arborization-redesign ${view === 'map' ? 'is-map-view' : 'is-list-view'}`} style={embedded ? undefined : { paddingInline: 'clamp(1rem, 1.5vw, 1.5rem)' }} data-testid="arborization-page">
    <Helmet><title>{title} — Trombone Cidadão</title><meta name="description" content="Consulte o inventário de árvores da cidade, espécies, estado de conservação e planejamento de plantio." /></Helmet>
    <header className={`arborization-header ${embedded ? 'is-embedded' : ''}`}>
      <div className="arborization-header-identity">
        {!embedded && <div className="arborization-intro"><span className="arborization-title-icon"><Trees aria-hidden="true" /></span><h1>{title}</h1></div>}
        {!embedded && <div className="arborization-city"><CitySelector /></div>}
        <span className="arborization-count-badge" role="status"><Trees size={15} aria-hidden="true" />{loading ? 'Carregando…' : `${filtered.length.toLocaleString('pt-BR')} ${filtered.length === 1 ? 'árvore' : 'árvores'}`}</span>
      </div>
      {inventoryActions}
    </header>
    <section className="arborization-explorer" aria-label="Explorar inventário">
      {(notice || summaryError || (management && !permissionsLoading && !canManage)) && <div className="arborization-notices">
        {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border bg-surface-raised p-3 text-sm">{notice}<Button variant="ghost" size="icon" aria-label="Fechar aviso" onClick={() => setNotice('')}><X className="h-4 w-4" /></Button></div>}
        {management && !permissionsLoading && !canManage && <p className="rounded-xl border bg-surface-raised p-3 text-sm text-content-secondary">{cityId ? 'Consulta pública. O gerenciamento exige permissão de Arborização nesta cidade.' : 'Selecione uma cidade para acessar o gerenciamento do inventário.'}</p>}
        {summaryError && <p role="alert" className="text-sm text-destructive">{summaryError} <Button variant="outline" size="sm" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></p>}
      </div>}
      {view === 'map' && <div className="arborization-map-summary"><TreeInventorySummary alwaysVisible stats={stats} loading={loading} plannedCount={filtered.filter(tree => tree.status === 'planejada').length} /></div>}
      {filterToolbar}
      <div className="arborization-workspace"><section className="arborization-results min-w-0 space-y-3" aria-label="Resultados do inventário">
        {view === 'map' ? <div className="arborization-map-panel relative isolate overflow-hidden rounded-2xl border border-edge-subtle" data-testid="tree-map">
          <FullscreenMapPanel title="Mapa de arborização" open={mapExpanded} onOpenChange={setMapExpanded} buttonClassName="arborization-fullscreen left-3 top-3" actions={inventoryActions}>
            {statusView || <TreeMap initialLayer={MAP_LAYER.SATELLITE} onMapReady={handleMapReady} showLegend trees={filtered} city={city} selected={selected} onSelect={setSelected} onDeselect={id => setSelected(current => current?.id === id ? null : current)} canManage={canManage} onEdit={startSingle} onDelete={setDeleting} />}
          </FullscreenMapPanel>
        </div> : listView}
      </section></div>
    </section>
    {view === 'map' && dataNote}
      <Dialog open={filterDialogOpen} onOpenChange={setFilterDialogOpen}>
        <FilterDialogContent {...(!compactFilters ? { placement: 'right' } : {})} aria-describedby={undefined} id="arborization-filters" className={`arborization-filters arborization-filter-dialog ${!compactFilters ? 'arborization-filter-drawer' : ''}`}>{filterForm}</FilterDialogContent>
      </Dialog>
      <TreePlanningReport hideTrigger open={planningOpen} onOpenChange={setPlanningOpen} trees={treesWithImages} initialFilters={filters} cities={cities} cityName={cityName} loading={loading} onDownload={download} busy={busy} />
      <TreeNeighborhoodSidebar hideTrigger open={statisticsOpen} onOpenChange={setStatisticsOpen} neighborhoods={neighborhoodCounts} unidentified={filtered.filter(tree => !tree.neighborhood && isLivingTree(tree)).length} loading={loading} error={error} summary={<TreeInventorySummary alwaysVisible stats={stats} loading={loading} plannedCount={filtered.filter(tree => tree.status === 'planejada').length} />} />
      {form && canManage && <TreeFormDialog tree={form} city={city} cityId={cityId} onClose={endRegistration} onSave={save} batchMode={batchMode} onSaveBatch={saveBatch} initialMapView={registrationView} existingTrees={treesWithImages} onSpeciesChanged={item => setSpeciesCatalog(current => [...current.filter(species => species.id !== item.id), item])} />}
      {maintenanceOpen && canManage && <TreeMaintenanceDialog trees={treesWithImages} city={city} cityId={cityId} initialMapView={registrationView} onSave={saveMaintenance} onClose={() => { setMaintenanceOpen(false); setMapExpanded(false); }} />}
      <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}><DialogContent role="alertdialog"><DialogHeader><DialogTitle>Excluir cadastro de {treeLabel(deleting)}?</DialogTitle><DialogDescription>Esta ação exclui o registro do inventário. Para manter o histórico de uma árvore retirada, edite sua situação para “Removida”.</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button><Button disabled={busy} onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{busy ? 'Excluindo…' : 'Excluir cadastro'}</Button></DialogFooter></DialogContent></Dialog>
  </Root>;
}

function ScopedContent(props) {
  const { cityId } = useCityView();
  // Trocar a cidade descarta seleções e rascunhos da anterior.
  return <ArborizationContent key={String(cityId)} {...props} />;
}

export default function ArborizationMapPage(props) {
  return <CityViewProvider><ScopedContent {...props} /></CityViewProvider>;
}
