
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { RotateCcw, Search } from 'lucide-react';
import MunicipalLightingMap, { lightingStatus } from '@/components/municipality/MunicipalLightingMap';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { poleDisplayLabel, poleReferenceText } from '@/lib/poleDisplay';
import { LAMP_TYPES } from '@/lib/lightingCatalog';
import { showAppNotice } from '@/lib/appError';

const POLE_FIELDS = 'id,identifier,plate,address,latitude,longitude,lighting_status,is_broken,updated_at,lamp_type,lamp_power_w';
const FILTERS = [['apagado', 'Apagados'], ['aceso', 'Acesos'], ['all', 'Todos']];
const STATUS_LABEL = { aceso: 'Aceso / funcionando', apagado: 'Apagado ou com problema' };
const SERVICE_OPTIONS = [['lamp_replacement', 'Troca de lâmpada'], ['arm_installation', 'Instalação de braço de luz'], ['relay_replacement', 'Troca de relé'], ['other', 'Outro serviço']];
const cleanTerm = (value) => value.trim().replace(/[%,()"'\\]/g, '');
const formatDate = (value) => value ? new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informado';

export default function ElectricianLightingMap({ municipality }) {
  const cityId = municipality?.city_id;
  const [center, setCenter] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('apagado');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeReports, setActiveReports] = useState([]);
  const [reportId, setReportId] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [focus, setFocus] = useState(null);
  const [status, setStatus] = useState('apagado');
  const [description, setDescription] = useState('');
  const [lampType, setLampType] = useState('');
  const [power, setPower] = useState('');
  const [serviceDone, setServiceDone] = useState(false);
  const [services, setServices] = useState([]);
  const [visitId, setVisitId] = useState(() => crypto.randomUUID());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const selectionId = useRef(0);

  useEffect(() => {
    if (!cityId) return undefined;
    let active = true;
    setCenter(null);
    setSelected(null); setItems([]); setBounds(null); setQuery(''); setFilter('apagado');
    (async () => {
      const base = () => supabase.from('poles').select('latitude,longitude').eq('city_id', cityId)
        .neq('lighting_status', 'removido')
        .not('latitude', 'is', null).not('longitude', 'is', null);
      const damaged = await base().or('lighting_status.eq.apagado,is_broken.eq.true').limit(1).maybeSingle();
      const fallback = damaged.data ? damaged : await base().limit(1).maybeSingle();
      if (!active) return;
      if (fallback.error) setError(fallback.error.message);
      setCenter(fallback.data ? [fallback.data.latitude, fallback.data.longitude] : [-14.2, -51.9]);
    })();
    return () => { active = false; };
  }, [cityId]);

  const onBounds = useCallback((next) => setBounds((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next), []);
  useEffect(() => {
    if (!cityId || !bounds) return undefined;
    const generation = requestId;
    const token = ++requestId.current;
    setLoading(true); setError('');
    supabase.rpc('municipal_lighting_map_clusters', {
      p_city_id: cityId,
      p_south: bounds.south, p_north: bounds.north,
      p_west: bounds.west, p_east: bounds.east,
      p_cell_lat: (bounds.north - bounds.south) * 184 / Math.max(bounds.height, 1),
      p_cell_lng: (bounds.east - bounds.west) * 184 / Math.max(bounds.width, 1),
      p_status: filter, p_street: '', p_include_removed: false,
      p_zoom: bounds.zoom,
      p_marker_limit: Math.min(800, Math.max(350, Math.floor(bounds.width * bounds.height / 1200))),
    }).then(({ data, error: failure }) => {
      if (token !== requestId.current) return;
      setItems(data || []);
      setError(failure?.message || '');
      setLoading(false);
    });
    return () => { generation.current++; };
  }, [cityId, bounds, filter, revision]);

  useEffect(() => {
    if (!cityId || !cleanTerm(query)) { setResults([]); return undefined; }
    let active = true;
    const timer = window.setTimeout(() => {
      const term = cleanTerm(query);
      supabase.from('poles').select(POLE_FIELDS).eq('city_id', cityId)
        .neq('lighting_status', 'removido')
        .or(`identifier.ilike.%${term}%,plate.ilike.%${term}%,address.ilike.%${term}%`)
        .order('id').limit(12)
        .then(({ data, error: failure }) => {
          if (!active) return;
          setResults(data || []);
          if (failure) setError(failure.message);
        });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [cityId, query, revision]);

  const openPole = async (pole) => {
    const token = ++selectionId.current;
    setSelected(pole); setStatus(lightingStatus(pole));
    setDescription(''); setLampType(pole.lamp_type || ''); setPower(pole.lamp_power_w ?? '');
    setServiceDone(false); setServices([]); setVisitId(crypto.randomUUID());
    setDetailError(''); setHistory([]); setActiveReports([]); setReportId(null); setHistoryLoading(true);
    if (Number.isFinite(pole.latitude) && Number.isFinite(pole.longitude)) setFocus([pole.latitude, pole.longitude]);
    setQuery(''); setResults([]);
    const [current, changes, reports] = await Promise.all([
      supabase.from('poles').select(POLE_FIELDS).eq('id', pole.id).eq('city_id', cityId).single(),
      supabase.from('pole_lighting_changes')
        .select('id,changed_at,old_status,new_status,descricao_servico')
        .eq('city_id', cityId).eq('pole_id', pole.id)
        .order('changed_at', { ascending: false }).limit(20),
      supabase.rpc('solicitacoes_ativas_poste_eletricista', { p_prefeitura: municipality.id, p_poste_id: pole.id }),
    ]);
    if (token !== selectionId.current) return;
    if (current.error) setDetailError(current.error.message);
    else { setSelected((value) => value?.id === pole.id ? current.data : value); setLampType(current.data.lamp_type || ''); setPower(current.data.lamp_power_w ?? ''); }
    if (changes.error) setDetailError(changes.error.message);
    else setHistory(changes.data || []);
    if (reports.error) setDetailError(reports.error.message);
    else {
      setActiveReports(reports.data || []);
      const eligible = (reports.data || []).filter((report) => !report.ordem_id || report.atribuida_a_mim);
      setReportId(eligible[0]?.report_id || null);
    }
    setStatus(reports.data?.length ? 'apagado' : lightingStatus(current.data || pole));
    setHistoryLoading(false);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!selected || saving || ((serviceDone || (reportId && status === 'aceso')) && !services.length)
      || (status === 'aceso' && activeReports.length > 0 && !reportId)) return;
    setSaving(true); setDetailError('');
    const { data, error: failure } = await supabase.rpc('registrar_visita_poste_eletricista_v2', {
      p_prefeitura: municipality.id, p_poste_id: selected.id,
      p_poste_atualizado_em: selected.updated_at,
      p_status: status, p_lamp_type: lampType || null,
      p_power_w: power === '' ? null : Number(power),
      p_servicos: serviceDone || (reportId && status === 'aceso') ? services : [], p_descricao: description.trim(), p_visita_id: visitId,
      p_report: status === 'aceso' ? reportId : null,
    });
    setSaving(false);
    if (failure) { setDetailError(failure.message); return; }
    if (data?.report_id) showAppNotice({ title: 'Solicitação resolvida',
      description: activeReports.length > 1
        ? `${activeReports.length - 1} solicitação(ões) ainda aberta(s) neste poste.`
        : data.restantes > 0 ? `${data.restantes} solicitação(ões) ainda pendente(s) nesta ordem.` : 'O mapa foi atualizado.' });
    selectionId.current++;
    setSelected(null);
    setRevision((value) => value + 1);
  };

  const count = items.reduce((sum, item) => sum + Number(item.item_count), 0);
  const currentStatus = selected && (activeReports.length > 0 ? 'apagado' : lightingStatus(selected));
  return <div className="electrician-lighting-map relative h-full min-h-0 min-w-0 overflow-hidden">
    <h1 className="sr-only">Mapa de iluminação para eletricistas</h1>
    <MunicipalLightingMap fullBleed startAtCurrentLocation center={center} focus={focus} items={items} selected={selected}
      loading={loading} count={count} onBounds={onBounds} onSelect={openPole} />
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1200] space-y-2 p-3 sm:p-4">
      <div className="pointer-events-auto flex max-w-lg gap-2">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar poste por número ou endereço</span><Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-content-secondary" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número ou endereço do poste" className="h-11 rounded-full border-edge-default bg-surface-raised/95 pl-10 text-sm shadow-md" /></label>
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading} aria-label="Atualizar postes" className="h-11 w-11 shrink-0 rounded-full border border-edge-default bg-surface-raised/95 text-content-primary shadow-md"><RotateCcw className={'mx-auto h-4 w-4 ' + (loading ? 'animate-spin' : '')} /></button>
      </div>
      <div role="group" aria-label="Filtrar postes por situação" className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={'min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold shadow-md ' + (filter === value ? 'border-brand bg-brand text-content-onBrand' : 'border-edge-default bg-surface-raised/95 text-content-primary')}>{label}</button>)}
      </div>
      {query.trim() && <div className="pointer-events-auto max-h-56 max-w-lg overflow-y-auto rounded-xl border border-edge-subtle bg-surface-raised shadow-lg">
        {results.length ? results.map((pole) => <button key={pole.id} type="button" onClick={() => openPole(pole)} className="block w-full border-b border-edge-subtle px-4 py-3 text-left last:border-0"><strong className="block text-sm">{poleDisplayLabel(pole)}</strong><span className="text-xs text-content-secondary">{pole.address || STATUS_LABEL[lightingStatus(pole)]}</span></button>) : <p className="p-3 text-xs text-content-secondary">Nenhum poste encontrado.</p>}
      </div>}
    </div>
    {error && <p role="alert" className="absolute bottom-20 left-3 right-3 z-[1200] rounded-xl bg-surface-raised p-3 text-xs text-danger shadow-lg">{error}</p>}
    <MunicipalDrawer open={Boolean(selected)} onClose={() => setSelected(null)} title={poleDisplayLabel(selected)}
      description={selected?.address || 'Endereço não informado'} variant="poleDetails" busy={saving}
      footer={<Button type="submit" form="electrician-pole-update" disabled={saving || ((serviceDone || (reportId && status === 'aceso')) && !services.length) || (status === 'aceso' && activeReports.length > 0 && !reportId) || Boolean(detailError) || historyLoading} className="w-full">{saving ? 'Salvando…' : reportId && status === 'aceso' ? 'Salvar e resolver solicitação' : activeReports.length > 0 ? 'Salvar sem resolver solicitação' : serviceDone ? 'Registrar serviço atendido' : 'Salvar dados do poste'}</Button>}>
      {selected && <div className="space-y-5">
        <p className="text-sm text-content-secondary">Situação atual no mapa: <strong className="text-content-primary">{STATUS_LABEL[currentStatus] || 'Sem problema registrado'}</strong></p>
        <form id="electrician-pole-update" onSubmit={save} className="space-y-4">
          <label className="block text-sm font-semibold">Situação após a visita<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving || historyLoading} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          {activeReports.length > 0 && <fieldset className="space-y-2 rounded-xl border border-edge-subtle p-3"><legend className="px-1 text-sm font-bold">Solicitações em aberto</legend><p className="text-xs text-content-secondary">{status === 'aceso' ? 'Ao salvar, a solicitação selecionada será resolvida. Outras solicitações abertas manterão o poste entre os apagados.' : 'A solicitação selecionada só será resolvida se você confirmar que o poste está aceso / funcionando.'}</p>{activeReports.map((report) => <label key={report.report_id} className="flex items-start gap-2 rounded-lg border border-edge-subtle p-2 text-xs"><input type="radio" name="active-report" checked={reportId === report.report_id} onChange={() => setReportId(report.report_id)} disabled={saving || (report.ordem_id && !report.atribuida_a_mim)} className="mt-0.5 accent-brand" /><span className="min-w-0"><strong className="block break-words">{poleReferenceText(report.title || 'Solicitação de iluminação')}</strong>{report.ordem_id && <span className="mt-0.5 block text-content-secondary">{report.atribuida_a_mim ? `Ordem ${report.ordem_protocolo || ''} em execução` : 'Ordem atribuída a outro eletricista ou ainda não aceita'}</span>}{report.ordem_id && report.atribuida_a_mim && <Link to={`/prefeitura/eletricista/ordem/${report.ordem_id}`} className="mt-1 inline-block font-semibold text-brand underline">Abrir ordem</Link>}</span></label>)}</fieldset>}
          <label className="block text-sm font-semibold">Tipo de lâmpada instalado <span className="font-normal text-content-secondary">(opcional)</span><select value={lampType} onChange={(event) => setLampType(event.target.value)} disabled={saving} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm"><option value="">Não informado</option>{lampType && !LAMP_TYPES.includes(lampType) && <option value={lampType}>{lampType} (cadastro anterior)</option>}{LAMP_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select></label>
          <label className="block text-sm font-semibold">Potência (W) <span className="font-normal text-content-secondary">(opcional)</span><Input type="number" min="0.01" step="0.01" value={power} onChange={(event) => setPower(event.target.value)} disabled={saving} className="mt-2" /></label>
          <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={serviceDone} onChange={(event) => setServiceDone(event.target.checked)} disabled={saving} className="h-4 w-4 accent-brand" />Realizei um serviço neste poste</label>
          {(serviceDone || (reportId && status === 'aceso')) && <fieldset className="space-y-2"><legend className="text-sm font-semibold">Serviços realizados *</legend><p className="text-xs text-content-secondary">Para resolver uma solicitação, selecione o serviço executado. Use Outro serviço para uma vistoria que confirmou o funcionamento.</p>{SERVICE_OPTIONS.map(([key, label]) => <label key={key} className="flex min-h-9 items-center gap-2 rounded-lg border border-edge-subtle px-3 text-sm"><input type="checkbox" checked={services.includes(key)} onChange={(event) => setServices((current) => event.target.checked ? [...current, key] : current.filter((value) => value !== key))} disabled={saving} className="h-4 w-4 accent-brand" />{label}</label>)}</fieldset>}
          <label className="block text-sm font-semibold">{serviceDone ? 'O que foi feito (opcional)' : 'Observação (opcional)'}<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} disabled={saving} placeholder="Descreva a vistoria, o reparo ou o problema encontrado" className="mt-2 min-h-24 w-full rounded-lg border border-input bg-background p-3 text-sm" /></label>
        </form>
        {detailError && <p role="alert" className="text-sm text-danger">{detailError}</p>}
        <section className="border-t border-edge-subtle pt-4"><h2 className="text-sm font-bold">Histórico do poste</h2>{historyLoading ? <p className="mt-2 text-xs text-content-secondary">Carregando histórico…</p> : history.length ? <ol className="mt-3 space-y-3">{history.map((entry) => <li key={entry.id} className="border-l-2 border-brand/40 pl-3"><span className="text-[11px] text-content-secondary">{formatDate(entry.changed_at)}</span><p className="text-xs font-semibold">{STATUS_LABEL[entry.new_status] || entry.new_status}</p>{entry.descricao_servico && <p className="mt-1 whitespace-pre-line text-xs text-content-secondary">{entry.descricao_servico}</p>}</li>)}</ol> : <p className="mt-2 text-xs text-content-secondary">Nenhuma atualização registrada.</p>}</section>
      </div>}
    </MunicipalDrawer>
  </div>;
}
