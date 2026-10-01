import React, { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { demandReportLocations } from '@/lib/municipalDemand';
import MunicipalDemandReportMarkers from '@/components/municipality/MunicipalDemandReportMarkers';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));
const hasPolePosition = (pole) => pole?.latitude != null && pole?.longitude != null
  && Number.isFinite(Number(pole.latitude)) && Number.isFinite(Number(pole.longitude));
const parseCoordinate = (value, limit) => {
  const normalized = String(value ?? '').trim().replace(',', '.');
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) && Math.abs(number) <= limit ? number : null;
};

export default function MunicipalDemandLocation({ form, fieldErrors = {}, reports = [], municipality, editable, busy, onChange, onLocatingChange }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [poleSearch, setPoleSearch] = useState('');
  const [poleSearching, setPoleSearching] = useState(false);
  const [poles, setPoles] = useState([]);
  const [nearbyPoles, setNearbyPoles] = useState([]);
  const [selectedPole, setSelectedPole] = useState(null);
  const [poleError, setPoleError] = useState('');
  const [viewport, setViewport] = useState(null);
  const [mapFocus, setMapFocus] = useState(null);
  const [coordinatePending, setCoordinatePending] = useState(false);
  const [coordinateError, setCoordinateError] = useState('');
  const locations = useMemo(() => demandReportLocations(reports), [reports]);
  const addressCount = locations.filter((location) => location.address).length;
  const mappedCount = locations.filter((location) => location.position).length;
  const request = useRef(0);
  const coordinateTimer = useRef(null);
  const coordinateDirty = useRef(false);
  const edited = useRef({ endereco: false, bairro: false });
  const latitude = parseCoordinate(form.latitude, 90);
  const longitude = parseCoordinate(form.longitude, 180);
  const position = latitude != null && longitude != null ? { lat: latitude, lng: longitude } : null;
  const city = municipality?.cidade;
  const isLighting = form.category_id === 'iluminacao';
  const cityId = municipality?.city_id;
  const allPoles = useMemo(() => {
    const unique = new Map();
    [...poles, ...nearbyPoles, selectedPole].filter(Boolean).forEach((pole) => unique.set(String(pole.id), pole));
    return [...unique.values()];
  }, [poles, nearbyPoles, selectedPole]);
  const searchMatches = useMemo(() => poles.filter(hasPolePosition).slice(0, 8), [poles]);
  const selectedPolePosition = selectedPole && String(selectedPole.id) === String(form.pole_id)
    && hasPolePosition(selectedPole)
    ? { lat: Number(selectedPole.latitude), lng: Number(selectedPole.longitude) } : null;
  const updateViewport = useCallback((bounds) => {
    const next = { south: bounds.getSouth(), north: bounds.getNorth(), west: bounds.getWest(), east: bounds.getEast() };
    setViewport((current) => current && Object.keys(next).every((key) => current[key] === next[key]) ? current : next);
  }, []);

  useEffect(() => {
    if (!isLighting || !cityId) { setPoles([]); setPoleSearching(false); return undefined; }
    let active = true;
    setPoleSearching(Boolean(poleSearch.trim()));
    const timer = window.setTimeout(async () => {
      const term = poleSearch.trim().replace(/[%,()"'\\]/g, '');
      let query = supabase.from('poles').select('id,identifier,plate,address,latitude,longitude')
        .eq('city_id', cityId).neq('lighting_status', 'removido').order('identifier').limit(80);
      if (term) query = query.or(`identifier.ilike.%${term}%,plate.ilike.%${term}%,address.ilike.%${term}%`);
      const { data, error: failure } = await query;
      if (active) { setPoles(data || []); setPoleError(failure?.message || ''); setPoleSearching(false); }
    }, poleSearch ? 250 : 0);
    return () => { active = false; window.clearTimeout(timer); };
  }, [isLighting, cityId, poleSearch]);

  useEffect(() => {
    if (!isLighting || !cityId || !form.pole_id) { setSelectedPole(null); return undefined; }
    let active = true;
    supabase.from('poles').select('id,identifier,plate,address,latitude,longitude')
      .eq('city_id', cityId).eq('id', form.pole_id).maybeSingle()
      .then(({ data }) => { if (active) setSelectedPole(data || null); });
    return () => { active = false; };
  }, [isLighting, cityId, form.pole_id]);

  useEffect(() => {
    if (!isLighting || !cityId || !viewport) { setNearbyPoles([]); return undefined; }
    let active = true;
    const timer = window.setTimeout(async () => {
      const { data, error: failure } = await supabase.from('poles')
        .select('id,identifier,plate,address,latitude,longitude')
        .eq('city_id', cityId).neq('lighting_status', 'removido')
        .gte('latitude', viewport.south).lte('latitude', viewport.north)
        .gte('longitude', viewport.west).lte('longitude', viewport.east)
        .limit(80);
      if (active) { setNearbyPoles(data || []); setPoleError(failure?.message || ''); }
    }, 300);
    return () => { active = false; window.clearTimeout(timer); };
  }, [isLighting, cityId, viewport]);

  useEffect(() => { onLocatingChange?.(locating || coordinatePending); }, [locating, coordinatePending, onLocatingChange]);
  useEffect(() => () => { request.current += 1; window.clearTimeout(coordinateTimer.current); onLocatingChange?.(false); }, [onLocatingChange]);

  const locate = async (point) => {
    if (!editable || busy || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return;
    window.clearTimeout(coordinateTimer.current);
    coordinateDirty.current = false;
    setCoordinatePending(false); setCoordinateError(''); setMapFocus(null);
    const token = ++request.current;
    edited.current = { endereco: false, bairro: false };
    onChange({ latitude: point.lat, longitude: point.lng, endereco: '', bairro: '', pole_id: '' });
    setLocating(true); setError('');
    let timeout;
    try {
      const data = await Promise.race([
        reverseGeocodePin(point, { invoke: supabase.functions.invoke.bind(supabase.functions) }),
        new Promise((resolve) => { timeout = window.setTimeout(() => resolve(null), 12000); }),
      ]);
      if (token !== request.current) return;
      if (!data?.address) { setError('Não foi possível identificar o endereço. O ponto foi marcado; você pode informar o endereço abaixo.'); return; }
      const values = {};
      if (!edited.current.endereco) values.endereco = data.address;
      if (!edited.current.bairro) values.bairro = data.suburb || '';
      onChange(values);
    } catch {
      if (token === request.current) setError('Não foi possível buscar o endereço. Corrija o texto abaixo e mantenha o ponto marcado.');
    } finally {
      window.clearTimeout(timeout);
      if (token === request.current) setLocating(false);
    }
  };
  const correct = (key, value) => {
    edited.current[key] = true;
    onChange({ [key]: value });
  };
  const applyCoordinates = (latitude, longitude) => {
    window.clearTimeout(coordinateTimer.current);
    setCoordinatePending(false);
    if (!coordinateDirty.current) return;
    const lat = parseCoordinate(latitude, 90);
    const lng = parseCoordinate(longitude, 180);
    if (lat == null || lng == null) { setCoordinateError('Informe latitude e longitude válidas.'); return; }
    locate({ lat, lng });
    setMapFocus({ lat, lng, nonce: Date.now() });
  };
  const changeCoordinate = (key, value) => {
    if (!editable || busy) return;
    window.clearTimeout(coordinateTimer.current);
    request.current += 1;
    coordinateDirty.current = true;
    setLocating(false); setError(''); setCoordinateError(''); setMapFocus(null);
    const latitude = key === 'latitude' ? value : form.latitude;
    const longitude = key === 'longitude' ? value : form.longitude;
    onChange({ [key]: value, pole_id: '', endereco: '', bairro: '' });
    const valid = parseCoordinate(latitude, 90) != null && parseCoordinate(longitude, 180) != null;
    setCoordinatePending(valid);
    if (valid) coordinateTimer.current = window.setTimeout(() => applyCoordinates(latitude, longitude), 700);
  };
  const clear = () => {
    window.clearTimeout(coordinateTimer.current);
    coordinateDirty.current = false;
    setCoordinatePending(false); setCoordinateError(''); setMapFocus(null);
    request.current += 1; setLocating(false); setError(''); setRevision((value) => value + 1);
    onChange({ latitude: '', longitude: '', pole_id: '' });
  };
  const selectPole = (id) => {
    if (!editable || busy) return;
    const pole = allPoles.find((entry) => String(entry.id) === String(id));
    if (!pole) { if (!id) onChange({ pole_id: '' }); return; }
    const lat = Number(pole.latitude);
    const lng = Number(pole.longitude);
    if (!hasPolePosition(pole)) return;
    window.clearTimeout(coordinateTimer.current);
    coordinateDirty.current = false;
    setCoordinatePending(false); setCoordinateError('');
    request.current += 1;
    setLocating(false); setError('');
    setPoleSearch('');
    setMapFocus({ lat, lng, nonce: Date.now() });
    onChange({
      pole_id: pole.id,
      endereco: pole.address || '',
      ...(String(pole.id) === String(form.pole_id) ? {} : { bairro: '' }),
      latitude: lat,
      longitude: lng,
    });
  };

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm" aria-label="Localização do serviço">
    <div className="mb-3"><h2 className="flex items-center gap-2 text-sm font-bold"><span className="rounded-lg bg-brand-subtleBg p-2 text-brand"><MapPin className="h-4 w-4" /></span>Local do serviço</h2>
      <p className="mt-1 text-xs text-content-secondary">{isLighting ? 'Selecione um poste cadastrado no mapa ou na busca para definir o local da ordem.' : locations.length ? 'Os pontos das solicitações vinculadas aparecem no mapa.' : editable ? 'Clique no mapa ou arraste o pino para localizar a demanda.' : 'Localização registrada para o serviço.'}</p>
    </div>
    <div className="grid min-h-0 min-w-0 flex-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
      <div className="relative isolate h-60 min-w-0 overflow-hidden rounded-lg border border-edge-subtle sm:h-72 xl:h-full xl:min-h-0" style={busy ? { pointerEvents: 'none' } : undefined}>
        <Suspense fallback={<div className="flex h-full items-center justify-center bg-surface-subtle"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>}>
          <LocationPickerMap key={revision} initialPosition={position || locations.find((location) => location.position)?.position} focusPosition={mapFocus || selectedPolePosition} onViewportChange={isLighting ? updateViewport : undefined} onLocationChange={locate} showMarker={Boolean(position)} readOnly={!editable || busy} showLocateButton={editable} showSatelliteToggle={isLighting} initialZoom={16} fallbackCityCenter={city ? { name: city.name, uf: city.states?.uf } : null}
            overlayMarkers={isLighting ? allPoles.filter(hasPolePosition).map((pole) => ({ id: pole.id, title: pole.identifier || pole.plate || `Poste ${pole.id}`, location: { lat: Number(pole.latitude), lng: Number(pole.longitude) } })) : []}
            selectedOverlayMarkerId={form.pole_id} onOverlayMarkerSelect={(marker) => { if (!editable || busy) return false; selectPole(marker.id); }} snapToOverlayOnSelect>
            {locations.length > 0 && <MunicipalDemandReportMarkers locations={locations} servicePosition={position} selectedLocation={selectedLocation} />}
          </LocationPickerMap>
        </Suspense>
        {isLighting && <div className="absolute right-3 top-3 z-[1000] w-[min(20rem,calc(100%-1.5rem))] min-w-0">
          <label className="relative block rounded-lg border border-edge-subtle bg-surface-raised/95 p-2 text-xs font-semibold shadow-md backdrop-blur-sm">Buscar poste cadastrado
            <Search className="pointer-events-none absolute bottom-[1.05rem] left-4 h-3.5 w-3.5 text-content-secondary" />
            <Input className="mt-1 h-9 bg-surface-raised pl-8 text-xs" value={poleSearch} onChange={(event) => { setPoleSearch(event.target.value); setPoleSearching(Boolean(event.target.value.trim())); }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); if (!poleSearching && searchMatches.length) selectPole(searchMatches[0].id); } else if (event.key === 'Escape') setPoleSearch(''); }} placeholder="Número, plaqueta ou endereço" disabled={!editable || busy} />
          </label>
          {poleSearch.trim() && editable && <div className="mt-1 max-h-24 overflow-y-auto rounded-lg border border-edge-subtle bg-surface-raised shadow-lg sm:max-h-44">
            {poleSearching ? <p role="status" className="p-2 text-xs text-content-secondary">Buscando postes…</p> : searchMatches.length ? searchMatches.map((pole) => <button key={pole.id} type="button" className="block w-full border-b border-edge-subtle px-3 py-2 text-left last:border-b-0 hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" onClick={() => selectPole(pole.id)}><span className="block text-xs font-semibold">{pole.identifier || pole.plate || `Poste #${pole.id}`}</span>{pole.address && <span className="block truncate text-[11px] text-content-secondary">{pole.address}</span>}</button>) : <p className="p-2 text-xs text-content-secondary">Nenhum poste com localização encontrado.</p>}
          </div>}
          {poleError && <p role="alert" className="mt-1 rounded bg-surface-raised p-2 text-xs text-danger">{poleError}</p>}
        </div>}
      </div>
      <div className="min-w-0 space-y-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs font-semibold sm:col-span-2">Endereço ou referência<Input className="mt-1 bg-surface-subtle text-xs" value={form.endereco || ''} onChange={(event) => correct('endereco', event.target.value)} readOnly={!editable} disabled={busy} placeholder="Rua, número ou ponto de referência" /></label>
          <label className="min-w-0 text-xs font-semibold sm:col-span-2">Bairro ou localidade<Input className="mt-1 bg-surface-subtle text-xs" value={form.bairro || ''} onChange={(event) => correct('bairro', event.target.value)} readOnly={!editable} disabled={busy} placeholder="Bairro ou localidade" /></label>
          <label className="min-w-0 text-xs font-semibold">Latitude<Input inputMode="decimal" aria-invalid={Boolean(fieldErrors.latitude || coordinateError)} aria-describedby={fieldErrors.latitude ? 'demand-latitude-error' : undefined} className="mt-1 bg-surface-subtle text-xs tabular-nums" value={form.latitude ?? ''} onChange={(event) => changeCoordinate('latitude', event.target.value)} onBlur={() => applyCoordinates(form.latitude, form.longitude)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCoordinates(form.latitude, form.longitude); } }} placeholder="Ex.: -8.599342" readOnly={!editable} disabled={busy} />{fieldErrors.latitude && <span id="demand-latitude-error" role="alert" className="mt-1.5 block text-xs font-normal text-danger">{fieldErrors.latitude}</span>}</label>
          <label className="min-w-0 text-xs font-semibold">Longitude<Input inputMode="decimal" aria-invalid={Boolean(fieldErrors.longitude || coordinateError)} aria-describedby={fieldErrors.longitude ? 'demand-longitude-error' : undefined} className="mt-1 bg-surface-subtle text-xs tabular-nums" value={form.longitude ?? ''} onChange={(event) => changeCoordinate('longitude', event.target.value)} onBlur={() => applyCoordinates(form.latitude, form.longitude)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); applyCoordinates(form.latitude, form.longitude); } }} placeholder="Ex.: -38.581272" readOnly={!editable} disabled={busy} />{fieldErrors.longitude && <span id="demand-longitude-error" role="alert" className="mt-1.5 block text-xs font-normal text-danger">{fieldErrors.longitude}</span>}</label>
          {coordinateError && <p role="alert" className="text-xs text-danger sm:col-span-2">{coordinateError}</p>}
          {isLighting && <>
            <label className="min-w-0 text-xs font-semibold sm:col-span-2">Poste da ordem<select className="mt-1 h-10 w-full min-w-0 rounded-lg border border-edge-default bg-surface-subtle px-3 text-xs font-normal text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-60" value={form.pole_id || ''} onChange={(event) => selectPole(event.target.value)} disabled={!editable || busy}><option value="">Selecione um poste</option>{form.pole_id && !allPoles.some((pole) => String(pole.id) === String(form.pole_id)) && <option value={form.pole_id}>Poste #{form.pole_id}</option>}{allPoles.map((pole) => <option key={pole.id} value={pole.id} disabled={!hasPolePosition(pole)}>{pole.identifier || pole.plate || `#${pole.id}`}{!hasPolePosition(pole) ? ' (sem coordenadas)' : ''}</option>)}</select></label>
            <p className="text-[11px] leading-4 text-content-secondary sm:col-span-2">Busque um poste no mapa ou selecione nesta lista.</p>
          </>}
        </div>
        {locating && <p role="status" className="flex items-center gap-2 text-xs text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" />Buscando endereço do ponto marcado…</p>}
        {error && <p role="alert" className="text-xs leading-5 text-danger">{error}</p>}
        {position && editable && <Button type="button" size="sm" variant="outline" className="h-8 text-xs" disabled={busy} onClick={clear}>Retirar ponto do mapa</Button>}
        {locations.length > 0 && <div className="min-w-0 border-t border-edge-subtle pt-3 text-xs" aria-label="Endereços das solicitações vinculadas" aria-live="polite">
          <h3 className="font-semibold">Solicitações vinculadas ({addressCount} endereços)</h3><p className="mt-1 text-content-secondary">{mappedCount} {mappedCount === 1 ? 'ponto no mapa' : 'pontos no mapa'}</p>
          <ol className="mt-2 max-h-32 space-y-1.5 overflow-y-auto pr-1">{locations.map((location, index) => <li key={location.id} className="flex min-w-0 items-start gap-2 rounded-lg border border-edge-subtle bg-surface-subtle p-2">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-subtleBg font-semibold text-brand">{index + 1}</span>
            <div className="min-w-0 flex-1"><p className="break-words font-semibold">{location.address || 'Endereço não informado'}</p><p className="mt-0.5 break-words text-content-secondary">{[location.neighborhood, location.title].filter(Boolean).join(' · ')}</p>{location.position && <button type="button" className="mt-1 rounded font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" disabled={busy} onClick={() => setSelectedLocation({ ...location })}>Ver no mapa</button>}</div>
          </li>)}</ol>
        </div>}
      </div>
    </div>
  </section>;
}
