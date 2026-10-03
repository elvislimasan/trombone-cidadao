import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RotateCcw, Search } from 'lucide-react';
import MunicipalLightingMap, { lightingStatus } from '@/components/municipality/MunicipalLightingMap';
import MunicipalDrawer from '@/components/municipality/MunicipalDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { poleDisplayLabel } from '@/lib/poleDisplay';

const POLE_FIELDS = 'id,identifier,plate,address,latitude,longitude,lighting_status,is_broken,updated_at,lamp_type,lamp_power_w';
const FILTERS = [['apagado', 'Apagados'], ['aceso', 'Acesos'], ['manutencao', 'Em manutenção'], ['all', 'Todos']];
const STATUS_LABEL = { aceso: 'Aceso / funcionando', apagado: 'Apagado ou com problema', manutencao: 'Em manutenção' };
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
  const [historyLoading, setHistoryLoading] = useState(false);
  const [focus, setFocus] = useState(null);
  const [status, setStatus] = useState('apagado');
  const [description, setDescription] = useState('');
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
    setSelected(pole); setStatus(pole.lighting_status === 'manutencao' ? 'manutencao' : lightingStatus(pole));
    setDescription(''); setDetailError(''); setHistory([]); setHistoryLoading(true);
    if (Number.isFinite(pole.latitude) && Number.isFinite(pole.longitude)) setFocus([pole.latitude, pole.longitude]);
    setQuery(''); setResults([]);
    const [current, changes] = await Promise.all([
      supabase.from('poles').select(POLE_FIELDS).eq('id', pole.id).eq('city_id', cityId).single(),
      supabase.from('pole_lighting_changes')
        .select('id,changed_at,old_status,new_status,descricao_servico')
        .eq('city_id', cityId).eq('pole_id', pole.id)
        .order('changed_at', { ascending: false }).limit(20),
    ]);
    if (token !== selectionId.current) return;
    if (current.error) setDetailError(current.error.message);
    else { setSelected((value) => value?.id === pole.id ? current.data : value); setStatus(current.data.lighting_status === 'manutencao' ? 'manutencao' : lightingStatus(current.data)); }
    if (changes.error) setDetailError(changes.error.message);
    else setHistory(changes.data || []);
    setHistoryLoading(false);
  };

  const save = async (event) => {
    event.preventDefault();
    if (!selected || saving || description.trim().length < 5) return;
    setSaving(true); setDetailError('');
    const { error: failure } = await supabase.rpc('atualizar_poste_eletricista', {
      p_prefeitura: municipality.id, p_poste_id: selected.id,
      p_poste_atualizado_em: selected.updated_at,
      p_status: status, p_descricao: description.trim(),
    });
    setSaving(false);
    if (failure) { setDetailError(failure.message); return; }
    selectionId.current++;
    setSelected(null);
    setRevision((value) => value + 1);
  };

  const count = items.reduce((sum, item) => sum + Number(item.item_count), 0);
  return <div className="electrician-lighting-map relative h-full min-h-0 min-w-0 overflow-hidden">
    <h1 className="sr-only">Mapa de iluminação para eletricistas</h1>
    <MunicipalLightingMap fullBleed center={center} focus={focus} items={items} selected={selected}
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
      footer={<Button type="submit" form="electrician-pole-update" disabled={saving || description.trim().length < 5 || Boolean(detailError)} className="w-full">{saving ? 'Salvando…' : 'Salvar atualização'}</Button>}>
      {selected && <div className="space-y-5">
        <p className="text-sm text-content-secondary">Situação cadastrada: <strong className="text-content-primary">{STATUS_LABEL[selected.lighting_status] || 'Sem problema registrado'}</strong></p>
        {selected.is_broken && status === 'aceso' && <p className="rounded-lg bg-danger-subtleBg p-3 text-xs text-danger">Há relato de problema ativo neste poste. Ele continuará sinalizado no mapa até a situação do relato ser resolvida.</p>}
        <form id="electrician-pole-update" onSubmit={save} className="space-y-4">
          <label className="block text-sm font-semibold">Situação após a visita<select value={status} onChange={(event) => setStatus(event.target.value)} disabled={saving} className="mt-2 h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">{Object.entries(STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="block text-sm font-semibold">O que foi feito<textarea value={description} onChange={(event) => setDescription(event.target.value)} minLength={5} maxLength={1000} required disabled={saving} placeholder="Descreva a vistoria, o reparo ou o problema encontrado" className="mt-2 min-h-28 w-full rounded-lg border border-input bg-background p-3 text-sm" /></label>
        </form>
        {detailError && <p role="alert" className="text-sm text-danger">{detailError}</p>}
        <section className="border-t border-edge-subtle pt-4"><h2 className="text-sm font-bold">Histórico do poste</h2>{historyLoading ? <p className="mt-2 text-xs text-content-secondary">Carregando histórico…</p> : history.length ? <ol className="mt-3 space-y-3">{history.map((entry) => <li key={entry.id} className="border-l-2 border-brand/40 pl-3"><span className="text-[11px] text-content-secondary">{formatDate(entry.changed_at)}</span><p className="text-xs font-semibold">{STATUS_LABEL[entry.new_status] || entry.new_status}</p>{entry.descricao_servico && <p className="mt-1 whitespace-pre-line text-xs text-content-secondary">{entry.descricao_servico}</p>}</li>)}</ol> : <p className="mt-2 text-xs text-content-secondary">Nenhuma atualização registrada.</p>}</section>
      </div>}
    </MunicipalDrawer>
  </div>;
}
