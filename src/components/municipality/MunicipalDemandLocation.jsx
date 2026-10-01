import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2, MapPin } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/customSupabaseClient';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { demandReportLocations } from '@/lib/municipalDemand';
import MunicipalDemandReportMarkers from '@/components/municipality/MunicipalDemandReportMarkers';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));

export default function MunicipalDemandLocation({ form, fieldErrors = {}, reports = [], municipality, editable, busy, onChange, onLocatingChange }) {
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
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

  return <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border border-edge-subtle bg-surface-raised p-4 shadow-sm" aria-label="Localização do serviço">
    <div className="mb-3"><h2 className="flex items-center gap-2 text-sm font-bold"><span className="rounded-lg bg-brand-subtleBg p-2 text-brand"><MapPin className="h-4 w-4" /></span>Local do serviço</h2>
      <p className="mt-1 text-xs text-content-secondary">{locations.length ? 'Os pontos das solicitações vinculadas aparecem no mapa.' : editable ? 'Clique no mapa ou arraste o pino para localizar a demanda.' : 'Localização registrada para o serviço.'}</p>
    </div>
    <div className="grid min-h-0 min-w-0 flex-1 gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(18rem,2fr)]">
      <div className="isolate h-60 min-w-0 overflow-hidden rounded-lg border border-edge-subtle sm:h-72 xl:h-full xl:min-h-0" style={busy ? { pointerEvents: 'none' } : undefined}>
        <Suspense fallback={<div className="flex h-full items-center justify-center bg-surface-subtle"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>}>
          <LocationPickerMap key={revision} initialPosition={position || locations.find((location) => location.position)?.position} onLocationChange={locate} showMarker={Boolean(position)} readOnly={!editable || busy} showLocateButton={editable} initialZoom={16} fallbackCityCenter={city ? { name: city.name, uf: city.states?.uf } : null}>
            {locations.length > 0 && <MunicipalDemandReportMarkers locations={locations} servicePosition={position} selectedLocation={selectedLocation} />}
          </LocationPickerMap>
        </Suspense>
      </div>
      <div className="min-w-0 space-y-3">
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <label className="min-w-0 text-xs font-semibold sm:col-span-2">Endereço ou referência<Input className="mt-1 bg-surface-subtle text-xs" value={form.endereco || ''} onChange={(event) => correct('endereco', event.target.value)} readOnly={!editable} disabled={busy} placeholder="Rua, número ou ponto de referência" /></label>
          <label className="min-w-0 text-xs font-semibold sm:col-span-2">Bairro ou localidade<Input className="mt-1 bg-surface-subtle text-xs" value={form.bairro || ''} onChange={(event) => correct('bairro', event.target.value)} readOnly={!editable} disabled={busy} placeholder="Bairro ou localidade" /></label>
          <label className="min-w-0 text-xs font-semibold">Latitude<Input aria-invalid={Boolean(fieldErrors.latitude)} aria-describedby={fieldErrors.latitude ? 'demand-latitude-error' : undefined} className="mt-1 bg-surface-subtle text-xs tabular-nums" value={position ? position.lat.toFixed(6) : ''} placeholder="Marque no mapa" readOnly />{fieldErrors.latitude && <span id="demand-latitude-error" role="alert" className="mt-1.5 block text-xs font-normal text-danger">{fieldErrors.latitude}</span>}</label>
          <label className="min-w-0 text-xs font-semibold">Longitude<Input aria-invalid={Boolean(fieldErrors.longitude)} aria-describedby={fieldErrors.longitude ? 'demand-longitude-error' : undefined} className="mt-1 bg-surface-subtle text-xs tabular-nums" value={position ? position.lng.toFixed(6) : ''} placeholder="Marque no mapa" readOnly />{fieldErrors.longitude && <span id="demand-longitude-error" role="alert" className="mt-1.5 block text-xs font-normal text-danger">{fieldErrors.longitude}</span>}</label>
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
