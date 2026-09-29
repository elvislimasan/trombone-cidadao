import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { demandReportLocations } from '@/lib/municipalDemand';
import MunicipalDemandReportMarkers from '@/components/municipality/MunicipalDemandReportMarkers';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

export default function MunicipalDemandLocation({ form, reports = [], municipality, editable, busy, onChange, onLocatingChange }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [editingAddress, setEditingAddress] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const locations = useMemo(() => demandReportLocations(reports), [reports]);
  const addressCount = locations.filter((location) => location.address).length;
  const mappedCount = locations.filter((location) => location.position).length;
  const request = useRef(0);
  const edited = useRef({ endereco: false, bairro: false });
  const position = form.latitude !== '' && form.longitude !== '' && Number.isFinite(Number(form.latitude)) && Number.isFinite(Number(form.longitude))
    ? { lat: Number(form.latitude), lng: Number(form.longitude) } : null;
  const city = municipality?.cidade;

  useEffect(() => { onLocatingChange?.(locating); }, [locating, onLocatingChange]);
  useEffect(() => () => { request.current += 1; onLocatingChange?.(false); }, [onLocatingChange]);

  const locate = async (point) => {
    if (!editable || busy || !Number.isFinite(point?.lat) || !Number.isFinite(point?.lng)) return;
    const token = ++request.current;
    edited.current = { endereco: false, bairro: false };
    onChange({ latitude: point.lat, longitude: point.lng, endereco: '', bairro: '' });
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
  const clear = () => {
    request.current += 1; setLocating(false); setError(''); setRevision((value) => value + 1);
    onChange({ latitude: '', longitude: '' });
  };

  return <section className="min-w-0 space-y-4 rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm sm:p-5" aria-label="Localização do serviço">
    <div><h2 className="flex items-center gap-2 text-sm font-bold"><span className="rounded-lg bg-brand-subtleBg p-2 text-brand"><MapPin className="h-4 w-4" /></span>Local do serviço</h2>
    <p className="mt-1 text-xs leading-5 text-content-secondary">{locations.length ? 'Os locais das broncas vinculadas são carregados automaticamente.' : editable ? 'Clique no mapa ou arraste o pino para localizar a demanda.' : 'Localização registrada para o serviço.'}</p></div>
    {editable && !locations.length && <label className="block"><span className="sr-only">Endereço ou ponto de referência</span><Input value={form.endereco} onChange={(event) => correct('endereco', event.target.value)} disabled={busy} placeholder="Informe endereço ou ponto de referência…" className="bg-surface-subtle text-xs" /></label>}
    <div className="isolate h-60 min-w-0 overflow-hidden rounded-lg border border-edge-subtle sm:h-80" style={busy ? { pointerEvents: 'none' } : undefined}>
      <Suspense fallback={<div className="flex h-full items-center justify-center bg-surface-subtle"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>}>
        <LocationPickerMap key={revision} initialPosition={position || locations.find((location) => location.position)?.position} onLocationChange={locate} showMarker={Boolean(position)} readOnly={!editable || busy} showLocateButton={editable} initialZoom={16} fallbackCityCenter={city ? { name: city.name, uf: city.states?.uf } : null}>
          {locations.length > 0 && <MunicipalDemandReportMarkers locations={locations} servicePosition={position} selectedLocation={selectedLocation} />}
        </LocationPickerMap>
      </Suspense>
    </div>
    {locations.length > 0 && <div className="space-y-3 text-xs" aria-label="Endereços das broncas vinculadas" aria-live="polite">
      <div><h3 className="font-semibold">Endereços das broncas ({addressCount})</h3><p className="mt-1 text-content-secondary">{locations.length} {locations.length === 1 ? 'bronca vinculada' : 'broncas vinculadas'} · {mappedCount} {mappedCount === 1 ? 'ponto no mapa' : 'pontos no mapa'}</p></div>
      <ol className="space-y-2">{locations.map((location, index) => <li key={location.id} className="flex min-w-0 items-start gap-3 rounded-lg border border-edge-subtle bg-surface-subtle p-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-subtleBg font-semibold text-brand">{index + 1}</span>
        <div className="min-w-0 flex-1"><p className="break-words font-semibold">{location.address || 'Endereço não informado'}</p>{location.neighborhood && <p className="mt-1 break-words text-content-secondary">{location.neighborhood}</p>}<p className="mt-1 break-words text-content-secondary">{location.title}</p>{location.position ? <button type="button" className="mt-2 rounded font-semibold text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" disabled={busy} onClick={() => setSelectedLocation({ ...location })}>Ver no mapa</button> : <p className="mt-2 text-content-tertiary">Sem coordenadas para exibir no mapa.</p>}</div>
      </li>)}</ol>
    </div>}
    {(!locations.length || form.endereco || position || editable) && <div className="rounded-lg border border-edge-subtle bg-surface-subtle p-3 text-xs" aria-live="polite">
      <p className="mb-2 font-semibold">{locations.length ? 'Referência complementar do serviço (opcional)' : 'Endereço selecionado'}</p>
      {locating ? <p className="flex items-center gap-2 text-content-secondary"><Loader2 className="h-4 w-4 animate-spin" />Buscando endereço do ponto marcado…</p> : <><p className="break-words font-semibold">{form.endereco || (position ? 'Ponto marcado, endereço não identificado' : locations.length ? 'Os endereços vinculados já definem os locais do serviço.' : 'Marque o local no mapa')}</p>{form.bairro && <p className="mt-1 break-words text-xs text-content-secondary">{form.bairro}</p>}</>}
      {editable && <Button type="button" size="sm" variant="outline" className="mt-3 h-8 text-xs" disabled={busy} aria-expanded={editingAddress || Boolean(error)} aria-controls="municipal-demand-address" onClick={() => setEditingAddress((value) => !value)}>{editingAddress ? 'Fechar edição' : 'Editar endereço'}</Button>}
    </div>}
    {error && <p role="alert" className="text-xs leading-5 text-danger">{error}</p>}
    {editable && (editingAddress || error) && <div id="municipal-demand-address" className="space-y-3 rounded-lg border border-edge-subtle p-3"><label className="block text-xs font-semibold">Endereço ou referência<Input className="mt-1 text-xs" value={form.endereco} onChange={(event) => correct('endereco', event.target.value)} disabled={busy} placeholder="Rua, número ou ponto de referência" /></label><label className="block text-xs font-semibold">Bairro ou localidade<Input className="mt-1 text-xs" value={form.bairro} onChange={(event) => correct('bairro', event.target.value)} disabled={busy} /></label>{position && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={clear}>Retirar ponto do mapa</Button>}</div>}
  </section>;
}
