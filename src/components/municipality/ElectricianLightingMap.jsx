
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { RotateCcw, Search } from 'lucide-react';
import MunicipalLightingMap, { lightingStatus } from '@/components/municipality/MunicipalLightingMap';
import ElectricianPoleVisitDrawer from '@/components/municipality/ElectricianPoleVisitDrawer';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { poleDisplayLabel } from '@/lib/poleDisplay';

const FILTERS = [['apagado', 'Apagados'], ['aceso', 'Acesos'], ['all', 'Todos']];
const STATUS_LABEL = { aceso: 'Aceso / funcionando', apagado: 'Apagado ou com problema' };

export default function ElectricianLightingMap({ municipality }) {
  const navigate = useNavigate();
  const cityId = municipality?.city_id;
  const [center, setCenter] = useState(null);
  const [bounds, setBounds] = useState(null);
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('apagado');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
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
    setResults([]); setSearchError('');
    if (!municipality?.id || !query.trim()) { setSearching(false); return undefined; }
    let active = true;
    setSearching(true);
    const timer = window.setTimeout(() => {
      supabase.rpc('buscar_mapa_eletricista', { p_prefeitura: municipality.id, p_busca: query.trim() })
        .then(({ data, error: failure }) => {
          if (!active) return;
          setResults(data || []);
          setSearchError(failure?.message || '');
        }).catch(() => { if (active) setSearchError('Não foi possível pesquisar. Confira sua conexão e tente novamente.'); })
        .finally(() => { if (active) setSearching(false); });
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [municipality?.id, query, revision]);

  const openPole = (pole) => {
    setSelected(pole);
    if (Number.isFinite(pole.latitude) && Number.isFinite(pole.longitude)) setFocus([pole.latitude, pole.longitude]);
    setQuery(''); setResults([]);
  };

  const count = items.reduce((sum, item) => sum + Number(item.item_count), 0);
  return <div className="electrician-lighting-map relative h-full min-h-0 min-w-0 overflow-hidden">
    <h1 className="sr-only">Mapa de iluminação para eletricistas</h1>
    <MunicipalLightingMap key={cityId} fullBleed showCurrentLocation center={center} focus={focus} items={items} selected={selected}
      loading={loading} count={count} onBounds={onBounds} onSelect={openPole}
      />
    <div className="pointer-events-none absolute inset-x-0 top-0 z-[1200] space-y-2 p-3 sm:p-4">
      <div className="pointer-events-auto flex max-w-lg gap-2">
        <label className="relative min-w-0 flex-1"><span className="sr-only">Buscar por número do poste, protocolo ou endereço</span><Search className="pointer-events-none absolute left-3.5 top-3.5 h-4 w-4 text-content-secondary" /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número do poste, protocolo ou endereço" className="h-11 rounded-full border-edge-default bg-surface-raised/95 pl-10 text-sm shadow-md" /></label>
        <button type="button" onClick={() => setRevision((value) => value + 1)} disabled={loading} aria-label="Atualizar postes" className="h-11 w-11 shrink-0 rounded-full border border-edge-default bg-surface-raised/95 text-content-primary shadow-md"><RotateCcw className={'mx-auto h-4 w-4 ' + (loading ? 'animate-spin' : '')} /></button>
      </div>
      <div role="group" aria-label="Filtrar postes por situação" className="pointer-events-auto flex max-w-full gap-1.5 overflow-x-auto pb-1">
        {FILTERS.map(([value, label]) => <button key={value} type="button" onClick={() => setFilter(value)} aria-pressed={filter === value} className={'min-h-9 shrink-0 rounded-full border px-3 text-xs font-bold shadow-md ' + (filter === value ? 'border-brand bg-brand text-content-onBrand' : 'border-edge-default bg-surface-raised/95 text-content-primary')}>{label}</button>)}
      </div>
      {query.trim() && <div className="pointer-events-auto max-h-56 max-w-lg overflow-y-auto rounded-xl border border-edge-subtle bg-surface-raised shadow-lg">
        {searching ? <p role="status" className="p-3 text-xs text-content-secondary">Pesquisando…</p> : searchError ? <p role="alert" className="p-3 text-xs text-danger">{searchError}</p> : results.length ? results.map((item, index) => <div key={`${item.tipo}-${item.ordem_id || item.poste?.id}-${index}`} className="border-b border-edge-subtle last:border-0">
          <button type="button" onClick={() => {
            if (item.poste) openPole(item.poste);
            else if (item.ordem_id) navigate(item.tipo === 'minha_ordem' ? `/prefeitura/eletricista/ordem/${item.ordem_id}` : `/prefeitura/eletricista?aba=disponiveis&oferta=ordem:${item.ordem_id}`);
          }} className="block w-full px-4 py-3 text-left"><strong className="block break-words text-sm">{item.protocolo ? `${item.protocolo} · ${item.poste ? poleDisplayLabel(item.poste) : item.titulo}` : poleDisplayLabel(item.poste)}</strong><span className="text-xs text-content-secondary">{item.poste?.address || (item.poste ? STATUS_LABEL[lightingStatus(item.poste)] : 'Abrir serviço para conferir a localização')}</span></button>
          {item.ordem_id && <Link className="mb-3 ml-4 inline-block text-xs font-semibold text-brand underline" to={item.tipo === 'minha_ordem' ? `/prefeitura/eletricista/ordem/${item.ordem_id}` : `/prefeitura/eletricista?aba=disponiveis&oferta=ordem:${item.ordem_id}`}>Abrir ordem de serviço</Link>}
        </div>) : <p className="p-3 text-xs text-content-secondary">Nenhum poste ou protocolo encontrado.</p>}
      </div>}
    </div>
    {error && <p role="alert" className="absolute bottom-20 left-3 right-3 z-[1200] rounded-xl bg-surface-raised p-3 text-xs text-danger shadow-lg">{error}</p>}
    <ElectricianPoleVisitDrawer pole={selected} municipality={municipality} onClose={() => setSelected(null)} onSaved={() => setRevision((value) => value + 1)} />
  </div>;
}
