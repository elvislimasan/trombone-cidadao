import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { ArrowRight, CalendarDays, Circle, Download, History, LampDesk, Lightbulb, Loader2, MapPin, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, Wrench, Zap } from 'lucide-react';
import MunicipalLightingMap, { lightingStatus } from '@/components/municipality/MunicipalLightingMap';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { polePosition } from '@/lib/poleAddress';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';

const STATUS = [['aceso', 'Aceso / funcionando'], ['apagado', 'Apagado'], ['manutencao', 'Em manutenção'], ['removido', 'Removido']];
const empty = { id: null, identifier: '', address: '', lamp_type: '', lamp_power_w: '', lighting_status: 'aceso', latitude: '', longitude: '' };
const EMPTY_FILTERS = { status: 'all', street: '', removed: false };
const POLE_FIELDS = 'id,identifier,plate,address,latitude,longitude,lamp_type,lamp_power_w,lighting_status,is_broken,updated_at';
const inputClass = 'mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm';
const cleanTerm = (value) => value.trim().replace(/[%,()"'\\]/g, '');
const STATUS_STYLES = { aceso: 'bg-success-bg text-success-fg', apagado: 'bg-danger-subtleBg text-danger-subtleFg', manutencao: 'bg-status-pendingBg text-status-pendingFg', removido: 'bg-surface-subtle text-content-secondary' };
const STATUS_DOTS = { aceso: 'bg-green-600', apagado: 'bg-red-600', manutencao: 'bg-yellow-500', removido: 'bg-slate-500' };
function filterPoles(request, filters) {
  if (!filters.removed && filters.status !== 'removido') request = request.neq('lighting_status', 'removido');
  if (filters.status === 'apagado') request = request.neq('lighting_status', 'removido').neq('lighting_status', 'manutencao').or('lighting_status.eq.apagado,is_broken.eq.true');
  else if (filters.status === 'aceso') request = request.or('lighting_status.eq.aceso,lighting_status.eq.nao_informado').or('is_broken.eq.false,is_broken.is.null');
  else if (filters.status !== 'all') {
    request = request.eq('lighting_status', filters.status);
  }
  if (cleanTerm(filters.street)) request = request.ilike('address', '%' + cleanTerm(filters.street) + '%');
  return request;
}
function PoleStatus({ pole }) {
  const status = lightingStatus(pole);
  return <span className={'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ' + STATUS_STYLES[status]}><span className={'h-2 w-2 shrink-0 rounded-full ' + STATUS_DOTS[status]} />{status === 'apagado' ? 'Apagado ou com problema' : statusName(status)}</span>;
}

const fmt = (value) => value == null ? '—' : `${Number(value).toLocaleString('pt-BR')} W`;
const statusName = (value) => value === 'nao_informado' ? 'Não informado (registro anterior)' : STATUS.find(([id]) => id === value)?.[1] || value;
const quoteCsv = (value) => {
  const text = String(value ?? '');
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
};

export default function MunicipalLightingPage() {
  const context = useMunicipalityWorkspace();
  const [center, setCenter] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [mapItems, setMapItems] = useState([]);
  const [poleCount, setPoleCount] = useState(0);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [form, setForm] = useState(empty);
  const [creating, setCreating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [panel, setPanel] = useState('filters');
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const visibleGeneration = useRef(0);
  const sidebarRef = useRef(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [locatingAddress, setLocatingAddress] = useState(false);
  const saveLock = useRef(false);
  const saveGeneration = useRef(0);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [related, setRelated] = useState({ orders: [], reports: [], history: [], loading: false, error: '' });
  const cityId = context.municipality?.city_id;

  useEffect(() => {
    const generation = saveGeneration;
    return () => { generation.current++; };
  }, [cityId]);

  useEffect(() => {
    if (!selected?.id || !context.municipality?.id) { setRelated({ orders: [], reports: [], history: [], loading: false, error: '' }); return undefined; }
    let active = true;
    setRelated({ orders: [], reports: [], history: [], loading: true, error: '' });
    Promise.all([
      supabase.from('demandas_municipais').select('id,protocolo,titulo,status').eq('prefeitura_id', context.municipality.id).eq('pole_id', selected.id).order('created_at', { ascending: false }).limit(8),
      supabase.from('reports').select('id,title,status').eq('city_id', cityId).eq('pole_id', selected.id).or('moderation_status.eq.approved,moderation_status.is.null').or('is_petition.eq.false,is_petition.is.null').order('created_at', { ascending: false }).limit(8),
      supabase.from('pole_lighting_changes').select('id,changed_at,old_status,new_status,new_power_w,new_lamp_type,action').eq('city_id', cityId).eq('pole_id', selected.id).order('changed_at', { ascending: false }).limit(5),
    ]).then(([orders, reports, history]) => {
      if (active) setRelated({ orders: orders.data || [], reports: reports.data || [], history: history.data || [], loading: false, error: orders.error?.message || reports.error?.message || history.error?.message || '' });
    });
    return () => { active = false; };
  }, [selected?.id, context.municipality?.id, cityId, revision]);

  useEffect(() => {
    if (!cityId) return;
    let active = true;
    setSummary(null); setSummaryError('');
    (async () => {
      try {
        const counts = await Promise.all(['all', 'aceso', 'apagado', 'manutencao'].map(async (status) => {
          const { count, error: failure } = await filterPoles(supabase.from('poles').select('id', { count: 'exact', head: true }).eq('city_id', cityId), { ...EMPTY_FILTERS, status });
          if (failure) throw failure;
          return [status, count ?? 0];
        }));
        if (active) setSummary(Object.fromEntries(counts));
      } catch (cause) { if (active) setSummaryError(cause.message); }
    })();
    return () => { active = false; };
  }, [cityId, revision]);

  useEffect(() => {
    if (!cityId) return;
    let active = true;
    (async () => {
      const { data } = await supabase.from('poles').select('latitude,longitude').eq('city_id', cityId)
        .not('latitude', 'is', null).not('longitude', 'is', null).limit(1).maybeSingle();
      if (data) { if (active) setCenter([data.latitude, data.longitude]); return; }
      const { data: report } = await supabase.from('reports').select('location').eq('city_id', cityId)
        .not('location', 'is', null).limit(1).maybeSingle();
      const [lng, lat] = report?.location?.coordinates || [];
      if (active) setCenter(Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : [-14.2, -51.9]);
    })();
    return () => { active = false; };
  }, [cityId]);

  const loadVisible = useCallback(async () => {
    if (!cityId || !bounds) return;
    const token = ++visibleGeneration.current;
    setLoading(true);
    setError('');
    const result = await supabase.rpc('municipal_lighting_map_clusters', {
      p_city_id: cityId,
      p_south: bounds.south,
      p_north: bounds.north,
      p_west: bounds.west,
      p_east: bounds.east,
      p_cell_lat: (bounds.north - bounds.south) * 184 / Math.max(bounds.height, 1),
      p_cell_lng: (bounds.east - bounds.west) * 184 / Math.max(bounds.width, 1),
      p_status: filters.status,
      p_street: cleanTerm(filters.street),
      p_include_removed: filters.removed,
      p_zoom: bounds.zoom,
      p_marker_limit: Math.min(800, Math.max(350, Math.floor(bounds.width * bounds.height / 1200))),
    });
    if (token !== visibleGeneration.current) return;
    if (result.error) setError(result.error.message);
    else {
      setMapItems(result.data || []);
      setPoleCount((result.data || []).reduce((sum, item) => sum + Number(item.item_count), 0));
    }
    setLoading(false);
  }, [cityId, bounds, filters]);
  useEffect(() => { const requestGeneration = visibleGeneration; loadVisible(); return () => { requestGeneration.current++; }; }, [loadVisible, revision]);

  useEffect(() => {
    if (!cityId || !search.trim()) { setResults([]); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const term = cleanTerm(search);
      let request = supabase.from('poles')
        .select(POLE_FIELDS)
        .eq('city_id', cityId).or(`identifier.ilike.%${term}%,plate.ilike.%${term}%,address.ilike.%${term}%`);
      request = filterPoles(request, filters);
      const { data, error: failure } = await request.order('id').limit(20);
      if (active && failure) setError(failure.message);
      if (active) { setResults(data || []); setSearching(false); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cityId, search, revision, filters]);

  const editPole = (pole) => {
    if (saveLock.current) return;
    if (Number.isFinite(pole.latitude) && Number.isFinite(pole.longitude)) setFocus([pole.latitude, pole.longitude]);
    setSelected(pole);
    setCreating(false);
    setPlacing(false);
    setDetailsOpen(true);
    setDrawerOpen(false);
    setHistoryOpen(false);
    setForm({ id: pole.id, identifier: pole.identifier || pole.plate || '', address: pole.address || '', lamp_type: pole.lamp_type || '', lamp_power_w: pole.lamp_power_w ?? '', lighting_status: pole.lighting_status === 'nao_informado' ? 'aceso' : pole.lighting_status || 'aceso', latitude: pole.latitude, longitude: pole.longitude });
  };
  const newPole = (point = null) => {
    if (saveLock.current) return;
    setCreating(true);
    setDetailsOpen(false);
    setDrawerOpen(true);
    setSelected(null);
    setPlacing(false);
    setForm({ ...empty, latitude: point?.lat ?? '', longitude: point?.lng ?? '' });
  };
  const save = async (action = 'updated', findAddress = false) => {
    if (!context.canEditLighting || saveLock.current) return;
    if (action === 'created' && (!form.identifier.trim() || form.latitude === '' || form.longitude === '')) {
      showAppError({ title: 'Informe número e localização', description: 'Clique no mapa para marcar o poste e informe seu número.', variant: 'destructive' });
      return;
    }
    const position = polePosition(form);
    if (findAddress && !position) {
      showAppError({ title: 'Localização necessária', description: 'Informe coordenadas válidas ou marque o poste no mapa para buscar o endereço.', variant: 'destructive' });
      return;
    }
    saveLock.current = true;
    const generation = ++saveGeneration.current;
    setSaving(true);
    let stage = findAddress ? 'lookup' : 'save';
    try {
      let address = form.address.trim();
      if (findAddress) {
        setLocatingAddress(true);
        const result = await reverseGeocodePin(position, { invoke: supabase.functions.invoke.bind(supabase.functions) });
        if (generation !== saveGeneration.current) return;
        address = result?.address?.trim() || '';
        if (!address) throw new Error('Não foi possível identificar o endereço deste ponto. Tente novamente ou informe o endereço manualmente.');
        setForm((current) => ({ ...current, address }));
        setLocatingAddress(false);
        stage = 'save';
      }
      const { error: saveError, data } = await supabase.rpc('gerir_iluminacao_municipal', {
        p_city_id: cityId, p_action: action, p_pole_id: form.id,
        p_number: form.identifier.trim() || null, p_address: address || null,
        p_lat: action === 'created' ? Number(form.latitude) : null,
        p_lng: action === 'created' ? Number(form.longitude) : null,
        p_lamp_type: form.lamp_type.trim() || null,
        p_power_w: form.lamp_power_w === '' ? null : Number(form.lamp_power_w),
        p_status: action === 'removed' ? 'removido' : form.lighting_status,
      });
      if (generation !== saveGeneration.current) return;
      if (saveError) throw saveError;
      showAppNotice({ title: action === 'created' ? 'Poste cadastrado' : action === 'removed' ? 'Poste removido do mapa ativo' : 'Poste atualizado', description: `Registro ${data} salvo no histórico de iluminação.` });
      setSelected(null);
      setCreating(false);
      setPlacing(false);
      setDrawerOpen(false);
      setRevision((value) => value + 1);
    } catch (cause) {
      if (generation === saveGeneration.current) showAppError({ title: stage === 'lookup' ? 'Não foi possível buscar o endereço' : 'Não foi possível atualizar o poste', description: cause.message, variant: 'destructive' });
    } finally {
      saveLock.current = false;
      setSaving(false);
      setLocatingAddress(false);
    }
  };

  const exportChanges = async (format) => {
    if (!cityId || exporting) return;
    if (fromDate && toDate && fromDate > toDate) {
      showAppError({ title: 'Período inválido', description: 'A data inicial deve ser anterior à data final.', variant: 'destructive' });
      return;
    }
    setExporting(true);
    try {
      const rows = [];
      for (let from = 0; ; from += 500) {
        let request = supabase.from('pole_lighting_changes')
          .select('changed_at,pole_number,address,old_power_w,new_power_w,old_lamp_type,new_lamp_type,old_status,new_status,action')
          .eq('city_id', cityId).order('changed_at', { ascending: false }).range(from, from + 499);
        if (fromDate) request = request.gte('changed_at', new Date(`${fromDate}T00:00:00`).toISOString());
        if (toDate) request = request.lt('changed_at', new Date(new Date(`${toDate}T00:00:00`).getTime() + 86400000).toISOString());
        const { data, error: queryError } = await request;
        if (queryError) throw queryError;
        rows.push(...(data || []));
        if ((data || []).length < 500) break;
      }
      const headers = ['Data', 'Número do poste', 'Endereço', 'Potência antiga', 'Nova potência', 'Lâmpada antiga', 'Nova lâmpada', 'Status anterior', 'Novo status', 'Ação'];
      const body = rows.map((row) => [new Date(row.changed_at).toLocaleString('pt-BR'), row.pole_number, row.address || '', row.old_power_w == null ? '' : row.old_power_w, row.new_power_w == null ? '' : row.new_power_w, row.old_lamp_type || '', row.new_lamp_type || '', statusName(row.old_status || ''), statusName(row.new_status || ''), row.action]);
      const name = `iluminacao_${context.municipality.cidade?.name || 'municipio'}_${new Date().toISOString().slice(0, 10)}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      if (format === 'pdf') {
        const pdf = new jsPDF({ orientation: 'landscape' });
        pdf.setFontSize(16);
        pdf.text('Relatório de iluminação pública', 14, 18);
        pdf.setFontSize(9);
        pdf.text(`${context.municipality.nome} · ${rows.length} alterações · Gerado em ${new Date().toLocaleDateString('pt-BR')}`, 14, 25);
        pdf.autoTable({ head: [headers], body, startY: 31, styles: { fontSize: 7 }, headStyles: { fillColor: [190, 36, 25] } });
        pdf.save(`${name}.pdf`);
      } else {
        const csv = `\uFEFF${[headers, ...body].map((row) => row.map(quoteCsv).join(';')).join('\r\n')}`;
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `${name}.csv`;
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (cause) { showAppError({ title: 'Falha ao exportar relatório', description: cause.message, variant: 'destructive' }); }
    setExporting(false);
  };

  if (context.loading) return <div className="flex min-h-96 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!context.municipality) return <div className="page-shell-fluid py-10"><h1 className="text-2xl font-bold">Acesso institucional necessário</h1></div>;
  const updateFilters = (next) => { setFilters(next); setDraftFilters(next); setSelected(null); setDetailsOpen(false); };
  const clearFilters = () => { updateFilters(EMPTY_FILTERS); setSearch(''); };
  const activeFilterCount = Number(filters.status !== 'all') + Number(Boolean(filters.street.trim())) + Number(filters.removed);
  const lightingMetrics = [
    ['all', 'Postes cadastrados', LampDesk, 'bg-surface-subtle text-content-primary', 'border-edge-default'],
    ['aceso', 'Em funcionamento', Lightbulb, 'bg-success-bg text-success-fg', 'border-success-border'],
    ['apagado', 'Apagados / com problema', Circle, 'bg-danger-subtleBg text-danger-subtleFg', 'border-brand/20'],
    ['manutencao', 'Em manutenção', Wrench, 'bg-status-pendingBg text-status-pendingFg', 'border-status-pendingBorder'],
  ];
  const lastChange = related.history[0]?.changed_at || selected?.updated_at;
  return <div className="page-shell-fluid min-w-0 pb-8 pt-6 text-content-primary" style={{ paddingInline: 'clamp(1rem, 2vw, 2rem)' }}>
    <Helmet><title>Mapa de iluminação | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Infraestrutura da cidade</p><h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Iluminação pública</h1><p className="mt-2 text-sm text-content-secondary">Localize postes, acompanhe as lâmpadas e organize a manutenção.</p></div>{context.canEditLighting && <Button className="shrink-0 self-start sm:self-auto" onClick={() => newPole()}><Plus className="mr-2 h-4 w-4" />Adicionar poste</Button>}</header>
    <section aria-label="Indicadores de iluminação" className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{lightingMetrics.map(([status, label, Icon, tone, border]) => <button key={status} type="button" onClick={() => updateFilters({ ...filters, status })} aria-pressed={filters.status === status} className={'flex min-w-0 items-start gap-3 rounded-xl border bg-surface-raised p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (filters.status === status && status !== 'all' ? border + ' ring-1 ring-inset ring-edge-default' : 'border-edge-subtle')}><span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + tone}><Icon className={'h-5 w-5 ' + (Icon === Circle ? 'fill-current' : '')} /></span><span className="min-w-0"><strong className="block text-2xl font-bold tabular-nums tracking-tight">{summary?.[status]?.toLocaleString('pt-BR') ?? '—'}</strong><span className="mt-0.5 block text-xs font-medium text-content-secondary">{label}</span><span className="mt-1 block text-[11px] tabular-nums text-content-secondary">{status === 'all' ? 'No cadastro ativo da cidade' : summary ? (summary.all ? (summary[status] / summary.all * 100) : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% do total' : 'Carregando…'}</span></span></button>)}</section>
    {summaryError && <p role="status" className="mt-2 text-xs text-danger">Não foi possível carregar os indicadores. <button type="button" onClick={() => setRevision((value) => value + 1)} className="underline">Tentar novamente</button></p>}
    <section className="mt-5 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] 4xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0"><MunicipalLightingMap center={center} focus={focus} items={search.trim() ? results.map((pole) => ({ item_count: 1, pole, cluster_lat: pole.latitude, cluster_lng: pole.longitude })) : mapItems} selected={selected} loading={search.trim() ? searching : loading} count={search.trim() ? results.length : poleCount} search={search} onSearch={setSearch} onBounds={setBounds} onSelect={editPole} placing={placing} onCancelPlacing={() => setPlacing(false)} onFilters={() => { setPanel('filters'); if (window.innerWidth < 1200) sidebarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.setTimeout(() => document.getElementById('lighting-status-filter')?.focus({ preventScroll: true }), 0); }} onPoint={(point) => { if (placing && context.canEditLighting) { setForm((current) => ({ ...current, latitude: point.lat, longitude: point.lng })); setPlacing(false); setCreating(true); setDrawerOpen(true); } }} />{error && <p role="alert" className="mt-2 text-sm text-danger">{error}<button type="button" onClick={loadVisible} className="ml-2 underline">Tentar novamente</button></p>}</div>
      <aside ref={sidebarRef} className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
          <div role="tablist" aria-label="Ferramentas de iluminação" className="flex border-b border-edge-subtle px-4">{[['filters', 'Busca e filtros', SlidersHorizontal], ['report', 'Relatório', Download]].map(([key, label, Icon]) => <button key={key} id={'lighting-tab-' + key} role="tab" aria-selected={panel === key} aria-controls={'lighting-panel-' + key} type="button" onClick={() => setPanel(key)} className={'flex min-h-12 items-center gap-2 border-b-2 px-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (panel === key ? 'border-brand text-brand' : 'border-transparent text-content-secondary hover:text-content-primary')}><Icon className="h-3.5 w-3.5" />{label}{key === 'filters' && activeFilterCount > 0 && <span className="rounded bg-brand-subtleBg px-1.5 py-0.5 text-[10px]">{activeFilterCount}</span>}</button>)}</div>
          {panel === 'filters' ? <div id="lighting-panel-filters" role="tabpanel" aria-labelledby="lighting-tab-filters" className="space-y-4 p-4">
            <label className="block text-xs font-semibold">Buscar poste<div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-secondary" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número do poste ou endereço" className="bg-surface-subtle pl-9 text-xs" /></div></label>
            <label className="block text-xs font-semibold">Status<select id="lighting-status-filter" className={inputClass + ' text-xs'} value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">Todos os status</option>{STATUS.map(([key, label]) => <option key={key} value={key}>{key === 'apagado' ? 'Apagado ou com problema' : label}</option>)}</select></label>
            <label className="block text-xs font-semibold">Rua ou endereço<Input className="mt-1.5 text-xs" value={draftFilters.street} onChange={(event) => setDraftFilters((current) => ({ ...current, street: event.target.value }))} placeholder="Ex.: Rua Boa Vista" /></label>
            <label className="flex items-center gap-2 text-xs text-content-secondary"><input type="checkbox" checked={draftFilters.removed} onChange={(event) => setDraftFilters((current) => ({ ...current, removed: event.target.checked }))} className="h-3.5 w-3.5 accent-brand" />Incluir postes removidos</label>
            <div className="grid grid-cols-2 gap-2"><Button size="sm" onClick={() => updateFilters(draftFilters)} className="text-xs"><Search className="mr-1.5 h-3.5 w-3.5" />Aplicar filtros</Button><Button size="sm" variant="outline" onClick={clearFilters} className="text-xs"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Limpar</Button></div>
            {search.trim() && <div aria-label="Resultados de postes" aria-live="polite" className="max-h-48 divide-y divide-edge-subtle overflow-y-auto border-t border-edge-subtle">{searching ? <p className="py-3 text-xs text-content-secondary">Buscando postes…</p> : results.length ? results.map((pole) => <button key={pole.id} type="button" onClick={() => editPole(pole)} className="block w-full rounded-lg px-1 py-3 text-left hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand"><span className="flex items-center justify-between gap-2"><strong className="text-xs">Poste {pole.identifier || pole.plate || pole.id}</strong><ArrowRight className="h-3.5 w-3.5 shrink-0 text-content-secondary" /></span><span className="mt-1 block text-xs text-content-secondary">{pole.address || 'Sem endereço'}</span><span className="mt-1.5 block"><PoleStatus pole={pole} /></span></button>) : <p className="py-3 text-xs text-content-secondary">Nenhum poste encontrado. Tente outro número ou endereço.</p>}</div>}
          </div> : <div id="lighting-panel-report" role="tabpanel" aria-labelledby="lighting-tab-report" className="space-y-4 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><History className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold">Histórico de iluminação</h2><p className="mt-1 text-xs leading-5 text-content-secondary">Exporte as alterações de status, lâmpada e potência registradas no período.</p></div><div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-xs font-semibold">De<Input type="date" className="mt-1 w-full min-w-0 px-2 text-xs" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="min-w-0 text-xs font-semibold">Até<Input type="date" className="mt-1 w-full min-w-0 px-2 text-xs" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div><div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" disabled={exporting} onClick={() => exportChanges('pdf')}><Download className="mr-1.5 h-3.5 w-3.5" />PDF</Button><Button size="sm" variant="outline" disabled={exporting} onClick={() => exportChanges('csv')} className="text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />Planilha CSV</Button></div><p className="text-[11px] text-content-secondary">Relatório da cidade, independente dos filtros do mapa.</p></div>}
        </section>
      </aside>
    </section>
    <Dialog open={detailsOpen && Boolean(selected)} onOpenChange={setDetailsOpen}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg gap-0 overflow-y-auto rounded-2xl border-edge-subtle bg-surface-raised p-0">
        {selected && <div className="p-5 sm:p-6">
          <div className="border-b border-edge-subtle pb-4">
            <DialogTitle className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-brand" />Poste selecionado</DialogTitle>
            <DialogDescription className="sr-only">Dados, histórico e serviços do poste selecionado.</DialogDescription>
          </div>
          <div className="mt-4 flex min-w-0 gap-3">
            <div className="flex h-20 w-16 shrink-0 items-center justify-center rounded-xl border border-status-pendingBorder bg-gradient-to-br from-status-pendingBg to-surface-raised"><LampDesk className="h-8 w-8 text-status-pendingFg" /></div>
            <div className="min-w-0"><h3 className="break-words text-sm font-bold">Poste {selected.identifier || selected.plate || selected.id}</h3><div className="mt-1.5"><PoleStatus pole={selected} /></div><p className="mt-2 break-words text-xs leading-5 text-content-secondary">{selected.address || 'Endereço não informado'}</p><p className="text-[11px] text-content-secondary">{context.municipality.cidade?.name} {context.municipality.cidade?.states?.uf && '· ' + context.municipality.cidade.states.uf}</p></div>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 border-t border-edge-subtle pt-4">{[
            ['Última atualização', CalendarDays, lastChange ? new Date(lastChange).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informada'],
            ['Potência da lâmpada', Zap, fmt(selected.lamp_power_w)],
            ['Tipo de lâmpada', Lightbulb, selected.lamp_type || 'Não informado'],
            ['Coordenadas', MapPin, Number.isFinite(selected.latitude) && Number.isFinite(selected.longitude) ? selected.latitude.toFixed(4) + ', ' + selected.longitude.toFixed(4) : 'Não informadas'],
          ].map(([label, Icon, value]) => <div key={label} className="flex min-w-0 items-start gap-2"><Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-content-secondary" /><div className="min-w-0"><dt className="text-[10px] text-content-secondary">{label}</dt><dd className="mt-1 break-words text-xs font-medium">{value}</dd></div></div>)}</dl>
          <div className={'mt-4 grid gap-2 ' + (context.canEditLighting ? 'grid-cols-2' : 'grid-cols-1')}>
            {context.canEditLighting && <Button variant="outline" size="sm" onClick={() => { setDetailsOpen(false); setDrawerOpen(true); }} className="text-xs">Editar poste<ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>}
            <Button variant="outline" size="sm" aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)} className="text-xs"><History className="mr-1 h-3.5 w-3.5" />Histórico</Button>
          </div>
          {context.canEdit && selected.lighting_status !== 'removido' && <Button asChild size="sm" className="mt-2 w-full"><Link to={'/prefeitura/demandas/nova?poste=' + selected.id}><Plus className="mr-2 h-3.5 w-3.5" />Gerar ordem de serviço</Link></Button>}
          {historyOpen && <div className="mt-4 space-y-3 border-t border-edge-subtle pt-3"><h3 className="text-xs font-semibold">Últimas alterações</h3>{related.loading ? <p className="text-xs text-content-secondary">Carregando histórico…</p> : related.error ? <p role="alert" className="text-xs text-danger">{related.error}</p> : related.history.length ? related.history.map((entry) => <div key={entry.id} className="border-l-2 border-status-progressBorder pl-3"><p className="text-[11px] text-content-secondary">{new Date(entry.changed_at).toLocaleString('pt-BR')}</p><p className="mt-1 text-xs font-medium">{statusName(entry.new_status)} · {fmt(entry.new_power_w)}{entry.new_lamp_type && ' · ' + entry.new_lamp_type}</p></div>) : <p className="text-xs text-content-secondary">Nenhuma alteração registrada para este poste.</p>}</div>}
          {(related.loading || related.error || related.orders.length > 0 || related.reports.length > 0) && <section className="mt-4 space-y-2 border-t border-edge-subtle pt-3"><h3 className="text-xs font-semibold">Serviços e relatos deste poste</h3>{related.loading && <p className="text-xs text-content-secondary">Consultando vínculos…</p>}{related.error && <p role="alert" className="text-xs text-danger">{related.error}</p>}{related.orders.map((order) => <Link key={order.id} to={'/prefeitura/demandas/' + order.id} className="block rounded-lg border border-edge-subtle p-3 text-xs text-brand hover:bg-surface-subtle">{order.protocolo} · {order.titulo}</Link>)}{related.reports.map((report) => <Link key={report.id} to={'/prefeitura/broncas/' + report.id} className="block rounded-lg border border-edge-subtle p-3 text-xs text-brand hover:bg-surface-subtle">Bronca: {report.title}</Link>)}</section>}
        </div>}
      </DialogContent>
    </Dialog>
    <MunicipalDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setCreating(false); }} busy={saving}
      title={creating ? 'Novo poste' : selected ? `Poste ${selected.identifier || selected.plate || selected.id}` : 'Poste'}
      description={creating ? 'Cadastre a localização e a lâmpada instalada.' : 'Consulte e atualize os dados de iluminação deste poste.'}
      footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={saving} onClick={() => { setDrawerOpen(false); setCreating(false); }}>Fechar</Button>{selected && context.canEditLighting && selected.lighting_status !== 'removido' && <Button variant="outline" disabled={saving} onClick={() => { if (window.confirm('Remover este poste do mapa ativo? O histórico será mantido.')) save('removed'); }}><Trash2 className="mr-2 h-4 w-4" />Remover</Button>}{context.canEditLighting && <Button disabled={saving} onClick={() => save(creating ? 'created' : 'updated')}>{saving ? 'Salvando…' : 'Salvar poste'}</Button>}</div>}>
      <div className="grid gap-5 py-1 sm:grid-cols-2">
        <label className="text-sm font-semibold">Número do poste<Input className="mt-1" value={form.identifier} onChange={(event) => setForm({ ...form, identifier: event.target.value })} disabled={!context.canEditLighting || saving} /></label>
        <div className="min-w-0 space-y-2"><label className="block text-sm font-semibold" htmlFor="lighting-pole-address">Endereço</label><Input id="lighting-pole-address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} disabled={!context.canEditLighting || saving} />{context.canEditLighting && (!form.address.trim() || locatingAddress) && <><Button type="button" variant="outline" size="sm" className="max-w-full text-xs" disabled={saving || !polePosition(form)} onClick={() => save(creating ? 'created' : 'updated', true)}>{locatingAddress ? <Loader2 className="mr-2 h-3.5 w-3.5 shrink-0 animate-spin" /> : <MapPin className="mr-2 h-3.5 w-3.5 shrink-0" />}{locatingAddress ? 'Buscando endereço…' : 'Buscar endereço e salvar'}</Button><p role="status" className="text-xs font-normal text-content-secondary">{polePosition(form) ? 'Busca pelas coordenadas e salva os dados deste poste.' : 'Marque a localização do poste para buscar o endereço.'}</p></>}</div>
        <label className="text-sm font-semibold">Tipo de lâmpada<Input className="mt-1" placeholder="Ex.: LED" value={form.lamp_type} onChange={(event) => setForm({ ...form, lamp_type: event.target.value })} disabled={!context.canEditLighting || saving} /></label>
        <label className="text-sm font-semibold">Potência (W)<Input className="mt-1" type="number" min="0.01" step="0.01" value={form.lamp_power_w} onChange={(event) => setForm({ ...form, lamp_power_w: event.target.value })} disabled={!context.canEditLighting || saving} /></label>
        <label className="text-sm font-semibold">Status<select className={inputClass} value={form.lighting_status} onChange={(event) => setForm({ ...form, lighting_status: event.target.value })} disabled={!context.canEditLighting || saving}>{STATUS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        {creating && <div className="sm:col-span-2"><p className="flex items-center gap-2 text-sm font-bold"><MapPin className="h-4 w-4 text-brand" />Localização</p><div className="mt-2 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Latitude<Input className="mt-1" type="number" min="-90" max="90" step="any" value={form.latitude} onChange={(event) => setForm({ ...form, latitude: event.target.value })} disabled={saving} /></label><label className="text-sm font-semibold">Longitude<Input className="mt-1" type="number" min="-180" max="180" step="any" value={form.longitude} onChange={(event) => setForm({ ...form, longitude: event.target.value })} disabled={saving} /></label></div><Button variant="outline" className="mt-3" disabled={saving} onClick={() => { setCreating(false); setPlacing(true); setDrawerOpen(false); }}>Escolher no mapa</Button></div>}
      </div>
    </MunicipalDrawer>
  </div>;
}
