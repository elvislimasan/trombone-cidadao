import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { ArrowRight, Circle, Download, History, LampDesk, Lightbulb, Loader2, Plus, RotateCcw, Search, SlidersHorizontal, Trash2, Wrench } from 'lucide-react';
import MunicipalLightingMap, { lightingStatus } from '@/components/municipality/MunicipalLightingMap';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import PoleDetailsDialog from '@/components/municipality/PoleDetailsDialog';
import MunicipalPoleFormSteps, { POLE_FORM_STEPS } from '@/components/municipality/MunicipalPoleFormSteps';
import LightingPendingPanel from '@/components/municipality/LightingPendingPanel';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { showAppError, showAppNotice } from '@/lib/appError';
import { confirmApp } from '@/lib/appConfirm';
import { polePosition } from '@/lib/poleAddress';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { emptyPoleTechnicalDetails, poleTechnicalDetailsFromRecord, poleTechnicalDetailsPayload, validatePoleTechnicalDetails } from '@/lib/poleTechnicalDetails';
import { normalizeLampType, isStandardLampType } from '@/lib/lightingCatalog';
import { OPEN_DEMAND_STATUSES } from '@/lib/municipalDemand';
import useMunicipalityWorkspace from '@/hooks/useMunicipalityWorkspace';

const STATUS = [['aceso', 'Aceso / funcionando'], ['apagado', 'Apagado'], ['manutencao', 'Em manutenção'], ['removido', 'Removido']];
const POLE_OPTIONS = { point_type: ['POSTE COMUM'], network_type: ['AEREA MULTIPLEX'] };
const empty = { id: null, identifier: '', address: '', lamp_type: '', lamp_power_w: '', lighting_status: 'aceso', latitude: '', longitude: '', ...emptyPoleTechnicalDetails };
const EMPTY_FILTERS = { status: 'all', removed: false };
const POLE_FIELDS = 'id,identifier,plate,address,latitude,longitude,lamp_type,lamp_power_w,lighting_status,is_broken,updated_at,raw_properties';
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
  return request;
}
function PoleStatus({ pole }) {
  const status = lightingStatus(pole);
  return <span className={'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ' + STATUS_STYLES[status]}><span className={'h-2 w-2 shrink-0 rounded-full ' + STATUS_DOTS[status]} />{status === 'apagado' ? 'Apagado ou com problema' : statusName(status)}</span>;
}

function poleForm(pole) {
  return {
    id: pole.id, identifier: pole.identifier || pole.plate || '', address: pole.address || '',
    lamp_type: normalizeLampType(pole.lamp_type), lamp_power_w: pole.lamp_power_w ?? '',
    lighting_status: pole.lighting_status === 'nao_informado' ? 'aceso' : pole.lighting_status || 'aceso',
    latitude: pole.latitude, longitude: pole.longitude,
    ...poleTechnicalDetailsFromRecord(pole),
  };
}

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
  const [searchCount, setSearchCount] = useState(0);
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [form, setForm] = useState(empty);
  const [formStep, setFormStep] = useState(0);
  const [technicalOptions, setTechnicalOptions] = useState({});
  const [creating, setCreating] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pendingOpen, setPendingOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [panel, setPanel] = useState('filters');
  const [summary, setSummary] = useState(null);
  const [summaryError, setSummaryError] = useState('');
  const [pendingCount, setPendingCount] = useState(null);
  const visibleGeneration = useRef(0);
  const sidebarRef = useRef(null);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [locatingAddress, setLocatingAddress] = useState(false);
  const [addressLookupFailed, setAddressLookupFailed] = useState(false);
  const [editingLoading, setEditingLoading] = useState(false);
  const saveLock = useRef(false);
  const saveGeneration = useRef(0);
  const addressLookupGeneration = useRef(0);
  const addressEdited = useRef(false);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [related, setRelated] = useState({ orders: [], reports: [], history: [], loading: false, error: '' });
  const cityId = context.municipality?.city_id;

  useEffect(() => {
    if (!cityId) return;
    let active = true;
    supabase.rpc('opcoes_tecnicas_postes_municipais', { p_city_id: cityId }).then(({ data }) => {
      if (!active || !data) return;
      const grouped = {};
      for (const { field, value } of data) {
        if (['point_type', 'network_type', 'transformer_code', 'switch_code'].includes(field)) (grouped[field] ||= []).push(value);
      }
      setTechnicalOptions(grouped);
    });
    return () => { active = false; };
  }, [cityId, revision]);

  useEffect(() => {
    if (!context.municipality?.id) return undefined;
    let active = true;
    supabase.from('demandas_municipais').select('id', { count: 'exact', head: true })
      .eq('prefeitura_id', context.municipality.id).eq('category_id', 'iluminacao')
      .not('pole_id', 'is', null).in('status', OPEN_DEMAND_STATUSES)
      .then(({ count, error: failure }) => { if (active) setPendingCount(failure ? null : count ?? 0); });
    return () => { active = false; };
  }, [context.municipality?.id, revision]);

  const poleOptionsFor = (field) => [...new Set([...(POLE_OPTIONS[field] || []), ...(technicalOptions[field] || [])].filter(Boolean))];

  useEffect(() => {
    const generation = saveGeneration;
    return () => { generation.current++; };
  }, [cityId]);

  useEffect(() => {
    if (!selected?.id || !context.municipality?.id) { setRelated({ orders: [], reports: [], history: [], loading: false, error: '' }); return undefined; }
    let active = true;
    setRelated({ orders: [], reports: [], history: [], loading: true, error: '' });
    Promise.all([
      supabase.from('demandas_municipais').select('id,protocolo,titulo,status,prazo_em').eq('prefeitura_id', context.municipality.id).eq('pole_id', selected.id).order('created_at', { ascending: false }).limit(8),
      supabase.from('reports').select('id,title,status').eq('city_id', cityId).eq('pole_id', selected.id).or('moderation_status.eq.approved,moderation_status.is.null').or('is_petition.eq.false,is_petition.is.null').order('created_at', { ascending: false }).limit(8),
      supabase.from('pole_lighting_changes').select('id,changed_at,old_status,new_status,new_power_w,new_lamp_type,action').eq('city_id', cityId).eq('pole_id', selected.id).order('changed_at', { ascending: false }).limit(5),
    ]).then(([orders, reports, history]) => {
      if (active) setRelated({ orders: orders.data || [], reports: reports.data || [], history: history.data || [], loading: false, error: orders.error?.message || reports.error?.message || history.error?.message || '' });
    });
    return () => { active = false; };
  }, [selected?.id, context.municipality?.id, cityId, revision]);

  useEffect(() => {
    if (!selected?.id || selected.raw_properties !== undefined || !cityId) return undefined;
    let active = true;
    supabase.from('poles').select('raw_properties').eq('id', selected.id).eq('city_id', cityId)
      .maybeSingle().then(({ data }) => {
        if (active) setSelected((current) => current?.id === selected.id
          ? { ...current, raw_properties: data?.raw_properties ?? null } : current);
      });
    return () => { active = false; };
  }, [selected?.id, selected?.raw_properties, cityId]);

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
      p_street: '',
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
    if (!cityId || !search.trim()) { setResults([]); setSearchCount(0); setSearching(false); return; }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      const term = cleanTerm(search);
      if (!term) { if (active) { setResults([]); setSearchCount(0); setSearching(false); } return; }
      let request = supabase.from('poles')
        .select(POLE_FIELDS, { count: 'exact' })
        .eq('city_id', cityId).or(`identifier.ilike.%${term}%,plate.ilike.%${term}%,address.ilike.%${term}%`);
      request = filterPoles(request, filters);
      const { data, count, error: failure } = await request.order('id').limit(20);
      if (active && failure) setError(failure.message);
      if (active) { setResults(data || []); setSearchCount(count || 0); setSearching(false); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cityId, search, revision, filters]);

  const editPole = (pole) => {
    if (saveLock.current) return;
    if (Number.isFinite(pole.latitude) && Number.isFinite(pole.longitude)) setFocus([pole.latitude, pole.longitude]);
    setSelected(pole);
    setCreating(false);
    setDetailsOpen(true);
    setDrawerOpen(false);
    setForm(poleForm(pole));
    if (!pole.raw_properties) {
      supabase.from('poles').select(POLE_FIELDS).eq('id', pole.id).eq('city_id', cityId).single()
        .then(({ data }) => { if (data) setSelected((current) => current?.id === pole.id ? data : current); });
    }
  };
  const beginEditPole = async () => {
    if (!selected?.id || editingLoading || saveLock.current) return;
    setEditingLoading(true);
    try {
      const { data, error: fetchError } = await supabase.from('poles').select(POLE_FIELDS)
        .eq('id', selected.id).eq('city_id', cityId).single();
      if (fetchError) throw fetchError;
      setSelected(data);
      setForm(poleForm(data));
      addressLookupGeneration.current++;
      addressEdited.current = false;
      setLocatingAddress(false);
      setAddressLookupFailed(false);
      setFormStep(0);
      setDetailsOpen(false);
      setDrawerOpen(true);
    } catch (cause) {
      showAppError({ title: 'Não foi possível abrir a edição do poste', description: cause.message, variant: 'destructive' });
    } finally {
      setEditingLoading(false);
    }
  };
  const newPole = (point = null) => {
    if (saveLock.current) return;
    setCreating(true);
    setDetailsOpen(false);
    setDrawerOpen(true);
    setSelected(null);
    setForm({ ...empty, luminaires: [], latitude: point?.lat ?? '', longitude: point?.lng ?? '' });
    addressLookupGeneration.current++;
    addressEdited.current = false;
    setLocatingAddress(false);
    setAddressLookupFailed(false);
    setFormStep(0);
  };
  const updatePoleAddress = (value) => {
    addressEdited.current = true;
    setForm((current) => ({ ...current, address: value }));
  };
  const setPoleLocation = async (point) => {
    if (!context.canEditLighting || saveLock.current) return;
    const lat = Number(point?.lat);
    const lng = Number(point?.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    const generation = ++addressLookupGeneration.current;
    addressEdited.current = false;
    setAddressLookupFailed(false);
    setForm((current) => ({ ...current, latitude: lat, longitude: lng, address: '' }));
    setLocatingAddress(true);
    try {
      const mapped = await supabase.rpc('mapped_street_address', { p_city_id: cityId, p_lat: lat, p_lng: lng }).maybeSingle();
      let address = !mapped.error ? mapped.data?.address : null;
      if (!address) {
        const geocoded = await reverseGeocodePin({ lat, lng }, { invoke: supabase.functions.invoke.bind(supabase.functions) });
        address = geocoded?.address;
      }
      if (generation !== addressLookupGeneration.current) return;
      setAddressLookupFailed(!address);
      if (address && !addressEdited.current) setForm((current) => Number(current.latitude) === lat && Number(current.longitude) === lng ? { ...current, address } : current);
    } catch {
      if (generation === addressLookupGeneration.current) setAddressLookupFailed(true);
    } finally {
      if (generation === addressLookupGeneration.current) setLocatingAddress(false);
    }
  };

  const continuePoleForm = () => {
    if (formStep === 0 && creating && (!form.identifier.trim() || !polePosition(form))) {
      showAppError({ title: 'Informe número e localização', description: 'Marque o pin no mapa e informe o número do poste.', variant: 'destructive' });
      return;
    }
    if (formStep === 1 && !isStandardLampType(form.lamp_type)) {
      showAppError({ title: 'Escolha um tipo de lâmpada padronizado', description: 'Selecione uma opção do catálogo ou “Não informado” antes de continuar.', variant: 'destructive' });
      return;
    }
    if (formStep === 1) {
      const detailsError = validatePoleTechnicalDetails({ ...poleTechnicalDetailsPayload(form), luminaires: [] });
      if (detailsError) {
        showAppError({ title: 'Confira os pontos de luz', description: detailsError, variant: 'destructive' });
        return;
      }
    }
    setFormStep((step) => Math.min(step + 1, POLE_FORM_STEPS.length - 1));
  };

  const closePoleForm = () => {
    addressLookupGeneration.current++;
    setLocatingAddress(false);
    setDrawerOpen(false);
    setCreating(false);
  };

  const save = async (action = 'updated') => {
    if (!context.canEditLighting || saveLock.current) return;
    if (action !== 'removed' && !isStandardLampType(form.lamp_type)) {
      setFormStep(1);
      showAppError({ title: 'Escolha um tipo de lâmpada padronizado', description: 'O valor antigo foi preservado para consulta. Selecione uma opção do catálogo ou “Não informado” antes de salvar.', variant: 'destructive' });
      return;
    }
    if (action === 'created' && (!form.identifier.trim() || !polePosition(form))) {
      setFormStep(0);
      showAppError({ title: 'Informe número e localização', description: 'Marque o pin no mapa e informe o número do poste.', variant: 'destructive' });
      return;
    }
    const details = poleTechnicalDetailsPayload(form);
    const detailsError = action === 'removed' ? null : validatePoleTechnicalDetails({ ...details, luminaires: [] });
    if (detailsError) {
      setFormStep(1);
      showAppError({ title: 'Confira os pontos de luz', description: detailsError, variant: 'destructive' });
      return;
    }
    saveLock.current = true;
    const generation = ++saveGeneration.current;
    setSaving(true);
    try {
      const address = form.address.trim();
      const { error: saveError, data } = await supabase.rpc('gerir_iluminacao_municipal_detalhado', {
        p_city_id: cityId, p_action: action, p_pole_id: form.id,
        p_number: form.identifier.trim() || null, p_address: address || null,
        p_lat: action === 'created' ? Number(form.latitude) : null,
        p_lng: action === 'created' ? Number(form.longitude) : null,
        p_lamp_type: normalizeLampType(form.lamp_type) || null,
        p_power_w: form.lamp_power_w === '' ? null : Number(form.lamp_power_w),
        p_status: action === 'removed' ? 'removido' : form.lighting_status,
        p_details: action === 'removed' ? null : details,
      });
      if (generation !== saveGeneration.current) return;
      if (saveError) throw saveError;
      showAppNotice({ title: action === 'created' ? 'Poste cadastrado' : action === 'removed' ? 'Poste removido do mapa ativo' : 'Poste atualizado', description: `Registro ${data} salvo no histórico de iluminação.` });
      setSelected(null);
      setCreating(false);
      setDrawerOpen(false);
      setRevision((value) => value + 1);
    } catch (cause) {
      if (generation === saveGeneration.current) showAppError({ title: 'Não foi possível atualizar o poste', description: cause.message, variant: 'destructive' });
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
  const activeFilterCount = Number(filters.status !== 'all') + Number(filters.removed);
  const lightingMetrics = [
    ['all', 'Postes cadastrados', LampDesk, 'bg-surface-subtle text-content-primary', 'border-edge-default'],
    ['aceso', 'Sem problema registrado', Lightbulb, 'bg-success-bg text-success-fg', 'border-success-border'],
    ['apagado', 'Apagados / com problema', Circle, 'bg-danger-subtleBg text-danger-subtleFg', 'border-brand/20'],
    ['manutencao', 'Em manutenção', Wrench, 'bg-status-pendingBg text-status-pendingFg', 'border-status-pendingBorder'],
  ];
  return <div className="page-shell-fluid min-w-0 pb-8 pt-6 text-content-primary" style={{ paddingInline: 'clamp(1rem, 2vw, 2rem)' }}>
    <Helmet><title>Mapa de iluminação | Prefeitura</title><meta name="robots" content="noindex" /></Helmet>
    <header className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Infraestrutura da cidade</p><h1 className="mt-1 font-display text-2xl font-bold tracking-tight sm:text-3xl">Iluminação pública</h1><p className="mt-2 text-sm text-content-secondary">Localize postes, acompanhe as lâmpadas e organize a manutenção.</p></div><div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => setPendingOpen(true)}><Wrench className="mr-2 h-4 w-4" />Pendências{pendingCount > 0 && <span className="ml-2 rounded-full bg-danger-subtleBg px-2 py-0.5 text-xs font-semibold text-danger-subtleFg">{pendingCount}</span>}</Button>{context.canEditLighting && <Button onClick={() => newPole()}><Plus className="mr-2 h-4 w-4" />Adicionar poste</Button>}</div></header>
    <section aria-label="Indicadores de iluminação da cidade" className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">{lightingMetrics.map(([status, label, Icon, tone, border]) => <button key={status} type="button" onClick={() => updateFilters({ ...filters, status })} aria-pressed={filters.status === status} className={'flex min-w-0 items-start gap-3 rounded-xl border bg-surface-raised p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (filters.status === status && status !== 'all' ? border + ' ring-1 ring-inset ring-edge-default' : 'border-edge-subtle')}><span className={'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ' + tone}><Icon className={'h-5 w-5 ' + (Icon === Circle ? 'fill-current' : '')} /></span><span className="min-w-0"><strong className="block text-2xl font-bold tabular-nums tracking-tight">{summary?.[status]?.toLocaleString('pt-BR') ?? '—'}</strong><span className="mt-0.5 block text-xs font-medium text-content-secondary">{label}</span><span className="mt-1 block text-[11px] tabular-nums text-content-secondary">{status === 'all' ? 'No cadastro ativo da cidade' : summary ? (summary.all ? (summary[status] / summary.all * 100) : 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '% do total' : 'Carregando…'}</span></span></button>)}</section>
    <p className="mt-2 text-xs text-content-secondary">Indicadores de toda a cidade. “Sem problema registrado” não significa funcionamento verificado em campo.</p>
    {summaryError && <p role="status" className="mt-2 text-xs text-danger">Não foi possível carregar os indicadores. <button type="button" onClick={() => setRevision((value) => value + 1)} className="underline">Tentar novamente</button></p>}
    <section className="mt-5 grid min-w-0 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] 4xl:grid-cols-[minmax(0,1fr)_25rem]">
      <div className="min-w-0"><MunicipalLightingMap center={center} focus={focus} items={mapItems} selected={selected} loading={loading} count={poleCount} onBounds={setBounds} onSelect={editPole} onFilters={() => { setPanel('filters'); if (window.innerWidth < 1200) sidebarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); window.setTimeout(() => document.getElementById('lighting-search')?.focus({ preventScroll: true }), 0); }} />{error && <p role="alert" className="mt-2 text-sm text-danger">{error}<button type="button" onClick={loadVisible} className="ml-2 underline">Tentar novamente</button></p>}</div>
      <aside ref={sidebarRef} className="grid min-w-0 content-start gap-4 md:grid-cols-2 xl:grid-cols-1">
        <section className="min-w-0 overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm">
          <div role="tablist" aria-label="Ferramentas de iluminação" className="flex border-b border-edge-subtle px-3">{[['filters', 'Busca e filtros', SlidersHorizontal], ['report', 'Relatório', Download]].map(([key, label, Icon]) => <button key={key} id={'lighting-tab-' + key} role="tab" aria-selected={panel === key} aria-controls={'lighting-panel-' + key} type="button" onClick={() => setPanel(key)} className={'flex min-h-12 items-center gap-1.5 border-b-2 px-3 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ' + (panel === key ? 'border-brand text-brand' : 'border-transparent text-content-secondary hover:text-content-primary')}><Icon className="h-3.5 w-3.5 shrink-0" />{label}{key === 'filters' && activeFilterCount > 0 && <span className="rounded bg-brand-subtleBg px-1.5 py-0.5 text-[10px]">{activeFilterCount}</span>}</button>)}</div>
          {panel === 'filters' ? <div id="lighting-panel-filters" role="tabpanel" aria-labelledby="lighting-tab-filters" className="space-y-4 p-4">
            <label className="block text-xs font-semibold" htmlFor="lighting-search">Buscar poste<div className="relative mt-1.5"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-content-secondary" /><Input id="lighting-search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Número do poste ou endereço" className="bg-surface-subtle pl-9 text-xs" /></div></label>
            <label className="block text-xs font-semibold">Status<select id="lighting-status-filter" className={inputClass + ' text-xs'} value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))}><option value="all">Todos os status</option>{STATUS.map(([key, label]) => <option key={key} value={key}>{key === 'apagado' ? 'Apagado ou com problema' : label}</option>)}</select></label>
            <label className="flex items-center gap-2 text-xs text-content-secondary"><input type="checkbox" checked={draftFilters.removed} onChange={(event) => setDraftFilters((current) => ({ ...current, removed: event.target.checked }))} className="h-3.5 w-3.5 accent-brand" />Incluir postes removidos</label>
            <div className="grid grid-cols-2 gap-2"><Button size="sm" onClick={() => updateFilters(draftFilters)} className="text-xs"><Search className="mr-1.5 h-3.5 w-3.5" />Aplicar filtros</Button><Button size="sm" variant="outline" onClick={clearFilters} className="text-xs"><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Limpar</Button></div>
            {search.trim() && <div aria-label="Resultados de postes" aria-live="polite" className="max-h-72 divide-y divide-edge-subtle overflow-y-auto border-t border-edge-subtle">{searching ? <p className="py-3 text-xs text-content-secondary">Buscando postes…</p> : results.length ? <><p className="py-2 text-[11px] text-content-secondary">{searchCount.toLocaleString('pt-BR')} encontrado(s){searchCount > results.length ? ` · exibindo os primeiros ${results.length}. Refine a busca para localizar o poste.` : ''}. A busca não altera o total do mapa.</p>{results.map((pole) => <button key={pole.id} type="button" onClick={() => editPole(pole)} className="block w-full rounded-lg px-1 py-3 text-left hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand"><span className="flex items-center justify-between gap-2"><strong className="text-xs">Poste {pole.identifier || pole.plate || pole.id}</strong><ArrowRight className="h-3.5 w-3.5 shrink-0 text-content-secondary" /></span><span className="mt-1 block text-xs text-content-secondary">{pole.address || 'Sem endereço'}</span><span className="mt-1.5 block"><PoleStatus pole={pole} /></span></button>)}</> : <p className="py-3 text-xs text-content-secondary">Nenhum poste encontrado. Tente outro número ou endereço.</p>}</div>}
          </div> : <div id="lighting-panel-report" role="tabpanel" aria-labelledby="lighting-tab-report" className="space-y-4 p-4"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><History className="h-5 w-5" /></div><div><h2 className="text-sm font-semibold">Histórico de iluminação</h2><p className="mt-1 text-xs leading-5 text-content-secondary">Exporte as alterações de status, lâmpada e potência registradas no período.</p></div><div className="grid grid-cols-2 gap-2"><label className="min-w-0 text-xs font-semibold">De<Input type="date" className="mt-1 w-full min-w-0 px-2 text-xs" value={fromDate} onChange={(event) => setFromDate(event.target.value)} /></label><label className="min-w-0 text-xs font-semibold">Até<Input type="date" className="mt-1 w-full min-w-0 px-2 text-xs" value={toDate} onChange={(event) => setToDate(event.target.value)} /></label></div><div className="grid grid-cols-2 gap-2"><Button size="sm" variant="outline" disabled={exporting} onClick={() => exportChanges('pdf')}><Download className="mr-1.5 h-3.5 w-3.5" />PDF</Button><Button size="sm" variant="outline" disabled={exporting} onClick={() => exportChanges('csv')} className="text-xs"><Download className="mr-1.5 h-3.5 w-3.5" />Planilha CSV</Button></div><p className="text-[11px] text-content-secondary">Relatório da cidade, independente dos filtros do mapa.</p></div>}
        </section>
      </aside>
    </section>
    <MunicipalDrawer open={pendingOpen} onClose={() => setPendingOpen(false)} title="Pendências de iluminação" description="Postes com problema e ordens de serviço em aberto na cidade.">
      <LightingPendingPanel municipalityId={context.municipality.id} cityId={cityId} revision={revision} showHeading={false} />
    </MunicipalDrawer>
    <PoleDetailsDialog open={detailsOpen && Boolean(selected)} onOpenChange={setDetailsOpen} pole={selected} city={context.municipality.cidade} related={related} canEdit={context.canEdit} canEditLighting={context.canEditLighting} editingLoading={editingLoading} onEdit={beginEditPole} />
    <MunicipalDrawer open={drawerOpen} onClose={closePoleForm} busy={saving} variant="lighting" placement="center" bodyScroll={formStep !== 0}
      title={creating ? 'Novo poste' : selected ? `Poste ${selected.identifier || selected.plate || selected.id}` : 'Poste'}
      description={creating ? 'Cadastre o poste em etapas.' : 'Atualize o poste em etapas.'}
      activeSection={formStep}
      navigation={<div aria-label="Etapas do cadastro do poste"><div className="flex items-center justify-between gap-3 text-xs"><span className="font-semibold text-brand">Etapa {formStep + 1} de {POLE_FORM_STEPS.length}</span><span className="font-medium text-content-secondary">{POLE_FORM_STEPS[formStep]}</span></div><ol className="mt-2 grid grid-cols-4 gap-1.5">{POLE_FORM_STEPS.map((label, index) => <li key={label} aria-current={index === formStep ? 'step' : undefined} aria-label={`${index + 1}. ${label}`} className={'h-1.5 rounded-full ' + (index <= formStep ? 'bg-brand' : 'bg-surface-subtle')} />)}</ol></div>}
      footer={<div className="flex items-center justify-between gap-2"><Button type="button" variant="outline" disabled={saving} onClick={() => formStep === 0 ? closePoleForm() : setFormStep((step) => step - 1)}>{formStep === 0 ? 'Cancelar' : 'Voltar'}</Button><div className="flex items-center gap-2">{formStep === POLE_FORM_STEPS.length - 1 && selected && context.canEditLighting && selected.lighting_status !== 'removido' && <Button type="button" variant="outline" disabled={saving} onClick={async () => { if (await confirmApp({ title: 'Remover este poste?', description: 'O poste sairá do mapa ativo. O histórico será mantido.', confirmLabel: 'Remover poste', destructive: true })) save('removed'); }}><Trash2 className="mr-1.5 h-4 w-4" />Remover</Button>}{context.canEditLighting && <Button type="button" disabled={saving} onClick={() => formStep === POLE_FORM_STEPS.length - 1 ? save(creating ? 'created' : 'updated') : continuePoleForm()}>{saving ? 'Salvando…' : formStep === POLE_FORM_STEPS.length - 1 ? 'Salvar poste' : 'Continuar'}</Button>}</div></div>}>
      <MunicipalPoleFormSteps key={form.id ?? 'new'} step={formStep} form={form} setForm={setForm} creating={creating} selected={selected} saving={saving} locatingAddress={locatingAddress} addressLookupFailed={addressLookupFailed} center={center} city={context.municipality.cidade} onLocationChange={setPoleLocation} onAddressChange={updatePoleAddress} poleOptionsFor={poleOptionsFor} />
    </MunicipalDrawer>
  </div>;
}
