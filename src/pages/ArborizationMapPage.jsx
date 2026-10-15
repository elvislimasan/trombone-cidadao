import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Download, Leaf, List, Loader2, Map, MapPin, Pencil, Plus, RefreshCw, Search, ShieldAlert, SlidersHorizontal, Sprout, Trees, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import CitySelector from '@/components/CitySelector';
import FullscreenMapPanel from '@/components/map/FullscreenMapPanel';
import TreeMap from '@/components/arborization/TreeMap';
import TreeFormDialog from '@/components/arborization/TreeFormDialog';
import { CityViewProvider, useCityView } from '@/contexts/CityContext';
import { useCanManagePavement as useCanManageUrbanPlanning } from '@/hooks/useCanManagePavement';
import { supabase } from '@/lib/customSupabaseClient';
import { salvarDocumento } from '@/lib/nativeDownload';
import { TREE_STATUS, TREE_ORIGINS, TREE_ACTIONS, filterTrees, loadCityTrees, treesCsv, treeStats } from '@/lib/arborization';

const EMPTY_FILTERS = { search: '', status: 'all', origin: 'all', neighborhood: 'all', action: 'all' };
const selectClass = 'h-10 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm';

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
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [view, setView] = useState(management ? 'list' : 'map');
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError('');
    loadCityTrees(supabase, cityId).then(data => { if (!cancelled) setTrees(data); })
      .catch(err => { if (!cancelled) { setTrees([]); setError(['42P01', 'PGRST205'].includes(err.code) ? 'O inventário de arborização ainda não está disponível nesta instalação.' : 'Não foi possível carregar as árvores. Tente novamente.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [cityId, revision]);

  const filtered = useMemo(() => filterTrees(trees, filters), [trees, filters]);
  const stats = useMemo(() => treeStats(filtered), [filtered]);
  const neighborhoods = useMemo(() => [...new Set(trees.map(tree => tree.neighborhood).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [trees]);
  const setFilter = (key, value) => { setFilters(current => ({ ...current, [key]: value })); setPage(1); setSelected(null); };
  const resetFilters = () => { setFilters(EMPTY_FILTERS); setPage(1); setSelected(null); };
  const activeFilters = Object.entries(filters).some(([key, value]) => value !== EMPTY_FILTERS[key]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 30));
  const currentPage = Math.min(page, pageCount);

  const save = useCallback(async (payload, id) => {
    if (!canManage || String(payload.city_id) !== String(cityId)) throw new Error('Você não tem permissão para gerenciar a arborização desta cidade.');
    const query = id ? supabase.from('city_trees').update(payload).eq('id', id).eq('city_id', cityId) : supabase.from('city_trees').insert(payload);
    const { data, error: saveError } = await query.select().single();
    if (saveError) throw new Error('Não foi possível salvar. Verifique sua conexão e a permissão na cidade.');
    setTrees(current => id ? current.map(tree => tree.id === id ? data : tree) : [data, ...current]);
    setSelected(data); setView('map'); setNotice(id ? 'Árvore atualizada.' : 'Árvore cadastrada.');
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

  return <main className="page-shell-fluid min-w-0 space-y-5 py-5 sm:py-7" data-testid="arborization-page">
    <Helmet><title>{management ? 'Gerenciar arborização' : 'Mapa de arborização'} — Trombone Cidadão</title><meta name="description" content="Consulte o inventário de árvores da cidade, espécies, estado de conservação e necessidades de manejo." /></Helmet>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex min-w-0 items-start gap-3"><span className="rounded-2xl bg-emerald-600/10 p-3 text-emerald-700 dark:text-emerald-400"><Trees className="h-7 w-7" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Meio ambiente · {cityName || 'Todas as cidades'}</p><h1 className="mt-1 text-2xl font-bold tracking-tight sm:text-3xl">{management ? 'Gerenciar arborização' : 'Mapa de arborização'}</h1><p className="mt-1 text-sm text-muted-foreground">Conheça as árvores da cidade e acompanhe os cuidados com cada uma.</p></div></div>
      <div className="flex flex-wrap items-center gap-2"><CitySelector /><Button variant="outline" disabled={loading || busy || !filtered.length} onClick={download}><Download className="mr-2 h-4 w-4" />Exportar CSV</Button>{canManage && <Button onClick={() => setForm({})} className="bg-emerald-700 text-white hover:bg-emerald-800"><Plus className="mr-2 h-4 w-4" />Cadastrar árvore</Button>}</div>
    </div>
    {notice && <div role="status" className="flex items-center justify-between gap-3 rounded-xl border bg-surface-raised p-3 text-sm">{notice}<Button variant="ghost" size="icon" aria-label="Fechar aviso" onClick={() => setNotice('')}><X className="h-4 w-4" /></Button></div>}
    {management && !permissionsLoading && !canManage && <p className="rounded-xl border bg-surface-raised p-3 text-sm text-muted-foreground">{cityId ? 'Consulta pública. O gerenciamento exige permissão de Planejamento Urbano nesta cidade.' : 'Selecione uma cidade para acessar o gerenciamento do inventário.'}</p>}
    <section aria-label="Indicadores do inventário filtrado" className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {[[Trees, 'Árvores no inventário', stats.total], [Leaf, 'Nativas vivas', stats.native], [Sprout, 'Manejos pendentes', stats.pending], [ShieldAlert, 'Árvores em risco', stats.risk]].map(([Icon, label, value]) => <div key={label} className="flex min-w-0 items-center gap-3 rounded-2xl border border-edge-subtle bg-surface-raised p-4"><Icon className="h-5 w-5 shrink-0 text-emerald-700 dark:text-emerald-400" /><div><p className="text-2xl font-bold tabular-nums">{loading ? '—' : value.toLocaleString('pt-BR')}</p><p className="text-xs text-muted-foreground">{label}</p></div></div>)}
    </section>
    <Button variant="outline" className="gap-2 lg:hidden" aria-expanded={filtersOpen} aria-controls="arborization-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal className="h-4 w-4" />{filtersOpen ? 'Ocultar filtros' : 'Filtros'}{activeFilters ? ' · ativos' : ''}</Button>
    <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[300px_minmax(0,1fr)] xl:grid-cols-[320px_minmax(0,1fr)]">
      <aside id="arborization-filters" className={`${filtersOpen ? 'block' : 'hidden'} min-w-0 space-y-4 rounded-2xl border border-edge-subtle bg-surface-raised p-4 lg:block`}>
        <div className="flex items-center justify-between"><h2 className="font-semibold">Explore o inventário</h2>{activeFilters && <Button variant="ghost" size="sm" onClick={resetFilters}>Limpar filtros</Button>}</div>
        <label className="grid gap-1.5 text-sm font-medium">Buscar árvore<div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" /><Input className="pl-9" placeholder="Espécie, rua ou bairro" value={filters.search} onChange={event => setFilter('search', event.target.value)} /></div></label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {[
            ['status', 'Situação', Object.entries(TREE_STATUS).map(([key, value]) => [key, value.label])],
            ['origin', 'Origem', Object.entries(TREE_ORIGINS)],
            ['neighborhood', 'Bairro', neighborhoods.map(value => [value, value])],
            ['action', 'Manejo', [['pending', 'Todos os manejos pendentes'], ...Object.entries(TREE_ACTIONS)]],
          ].map(([key, label, options]) => <label key={key} className="grid min-w-0 gap-1.5 text-sm font-medium">{label}<select className={selectClass} value={filters[key]} onChange={event => setFilter(key, event.target.value)}><option value="all">Todos</option>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></label>)}
        </div>
        <div className="grid gap-2 border-t border-edge-subtle pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground" aria-live="polite">{loading ? 'Carregando inventário…' : `${filtered.length} de ${trees.length} registros`}</p>
            <Button type="button" variant="ghost" size="icon" aria-label="Atualizar inventário" disabled={loading} onClick={() => { setSelected(null); setRevision(value => value + 1); }}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          <ToggleGroup type="single" value={view} onValueChange={value => value && setView(value)} className="justify-center rounded-md border" aria-label="Visualização">
            <ToggleGroupItem value="map" className="flex-1 gap-2" aria-label="Ver mapa"><Map className="h-4 w-4" />Mapa</ToggleGroupItem>
            <ToggleGroupItem value="list" className="flex-1 gap-2" aria-label="Ver lista"><List className="h-4 w-4" />Lista</ToggleGroupItem>
          </ToggleGroup>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">O mapa mostra árvores cadastradas no inventário. Uma área sem marcadores pode ainda não ter sido levantada.</p>
      </aside>
      <section className="min-w-0 space-y-3" aria-label="Resultados do inventário">
        {error ? <div role="alert" className="rounded-2xl border p-8 text-center"><p>{error}</p><Button variant="outline" className="mt-3" onClick={() => setRevision(value => value + 1)}>Tentar novamente</Button></div> : loading ? <div className="flex h-[500px] items-center justify-center gap-2 rounded-2xl border"><Loader2 className="h-5 w-5 animate-spin" />Carregando árvores…</div> : <>
          {!filtered.length && trees.length > 0 && <div className="rounded-xl border border-dashed bg-surface-raised p-5 text-center"><Trees className="mx-auto mb-2 h-7 w-7 text-muted-foreground" /><h2 className="font-semibold">Nenhuma árvore encontrada</h2><p className="mt-1 text-sm text-muted-foreground">Ajuste os filtros para encontrar outros registros.</p>{activeFilters && <Button variant="outline" className="mt-3" onClick={resetFilters}>Limpar filtros</Button>}</div>}
          {view === 'map' ? (
            <div className="relative isolate h-[60dvh] min-h-[420px] overflow-hidden rounded-2xl border border-edge-subtle lg:h-[calc(100dvh-21rem)] lg:min-h-[520px]" data-testid="tree-map">
              <FullscreenMapPanel title="Mapa de arborização">
                <TreeMap showLegend trees={filtered} city={city} selected={selected} onSelect={setSelected}
                  onDeselect={id => setSelected(current => current?.id === id ? null : current)}
                  canManage={canManage} onEdit={setForm} onDelete={setDeleting} />
              </FullscreenMapPanel>
            </div>
          ) : (
            <div className="grid gap-3 xl:grid-cols-2 2xl:grid-cols-3">
              {filtered.slice((currentPage - 1) * 30, currentPage * 30).map(tree => (
                <article key={tree.id} className="min-w-0 rounded-xl border border-edge-subtle bg-surface-raised p-4">
                  <div className="flex items-start justify-between gap-2">
                    <button type="button" className="min-w-0 text-left" onClick={() => showTreeOnMap(tree)}>
                      <h3 className="break-words font-semibold">{tree.common_name}</h3>
                      {tree.scientific_name && <p className="mt-0.5 break-words text-xs italic text-muted-foreground">{tree.scientific_name}</p>}
                    </button>
                    <StatusBadge status={tree.status} />
                  </div>
                  <p className="mt-3 break-words text-sm text-muted-foreground">{tree.address || 'Endereço não informado'}{tree.neighborhood ? ` · ${tree.neighborhood}` : ''}</p>
                  {!cityId && <p className="mt-1 text-xs text-muted-foreground">{cities.find(item => String(item.id) === String(tree.city_id))?.name || `Cidade ${tree.city_id}`}</p>}
                  <p className="mt-2 text-xs">{TREE_ORIGINS[tree.origin]} · {TREE_ACTIONS[tree.maintenance_action]}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button variant="outline" size="sm" onClick={() => showTreeOnMap(tree)}>Ver detalhes</Button>
                    <Button variant="ghost" size="sm" onClick={() => showTreeOnMap(tree)}><MapPin className="mr-1 h-4 w-4" />No mapa</Button>
                    {canManage && <Button variant="ghost" size="sm" onClick={() => setForm(tree)}><Pencil className="mr-1 h-4 w-4" />Editar</Button>}
                  </div>
                </article>
              ))}
            </div>
          )}
          {view === 'list' && pageCount > 1 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Anterior</Button><span className="text-sm">{currentPage} / {pageCount}</span><Button variant="outline" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Próxima</Button></div>}
        </>}
      </section>
    </div>
    {form && canManage && <TreeFormDialog tree={form} city={city} cityId={cityId} onClose={() => setForm(null)} onSave={save} />}
    <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !busy) setDeleting(null); }}>
      <DialogContent role="alertdialog">
        <DialogHeader>
          <DialogTitle>Excluir cadastro de {deleting?.common_name}?</DialogTitle>
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
