import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import PipaMap from './PipaMap';
import { pipaCoordinates } from '@/lib/pipa';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { supabase } from '@/lib/customSupabaseClient';

export default function PipaLocationFields({ form, setForm, city, disabled = false, onPendingChange }) {
  const [locating, setLocating] = useState(false), [lookupError, setLookupError] = useState('');
  const request = useRef(0), addressEdited = useRef(false), coordinateDirty = useRef(false);
  const coordinateTimer = useRef(null), lookupTimer = useRef(null);
  const destination = useMemo(() => pipaCoordinates(form.latitude, form.longitude)
    ? { id: 'picked', latitude: Number(form.latitude), longitude: Number(form.longitude) } : null, [form.latitude, form.longitude]);
  useEffect(() => { onPendingChange?.(locating); }, [locating, onPendingChange]);
  useEffect(() => () => {
    request.current++;
    window.clearTimeout(coordinateTimer.current); window.clearTimeout(lookupTimer.current);
    onPendingChange?.(false);
  }, [onPendingChange]);

  const locate = async (point, keepCoordinates = false) => {
    if (disabled) return;
    const token = ++request.current;
    window.clearTimeout(coordinateTimer.current); window.clearTimeout(lookupTimer.current);
    coordinateDirty.current = false; addressEdited.current = false;
    setForm(current => ({ ...current, ...(keepCoordinates ? {} : { latitude: point.lat.toFixed(7), longitude: point.lng.toFixed(7) }), address: '' }));
    setLocating(true); setLookupError('');
    let timeout;
    try {
      const result = await Promise.race([
        reverseGeocodePin(point, { invoke: supabase.functions.invoke.bind(supabase.functions) }),
        new Promise(resolve => { timeout = window.setTimeout(() => resolve(null), 12000); lookupTimer.current = timeout; }),
      ]);
      if (token !== request.current || addressEdited.current) return;
      if (result?.address) setForm(current => ({ ...current, address: result.address.slice(0, 160) }));
      else setLookupError('Endereço não encontrado. Informe o endereço ou uma referência abaixo.');
    } catch {
      if (token === request.current && !addressEdited.current) setLookupError('Não foi possível buscar o endereço. Informe-o manualmente.');
    } finally {
      window.clearTimeout(timeout);
      if (token === request.current) setLocating(false);
    }
  };
  const applyCoordinates = (latitude, longitude) => {
    window.clearTimeout(coordinateTimer.current);
    if (!coordinateDirty.current || !pipaCoordinates(latitude, longitude)) return;
    locate({ lat: Number(latitude), lng: Number(longitude) }, true);
  };
  const changeCoordinate = (key, value) => {
    request.current++;
    window.clearTimeout(coordinateTimer.current); window.clearTimeout(lookupTimer.current);
    coordinateDirty.current = true; addressEdited.current = false; setLookupError('');
    const latitude = key === 'latitude' ? value : form.latitude, longitude = key === 'longitude' ? value : form.longitude;
    setForm(current => ({ ...current, [key]: value, address: '' }));
    const valid = pipaCoordinates(latitude, longitude);
    setLocating(valid);
    if (valid) coordinateTimer.current = window.setTimeout(() => applyCoordinates(latitude, longitude), 700);
  };
  const changeAddress = value => {
    request.current++; addressEdited.current = true; coordinateDirty.current = false;
    window.clearTimeout(coordinateTimer.current); window.clearTimeout(lookupTimer.current);
    setLocating(false); setLookupError('');
    setForm(current => ({ ...current, address: value }));
  };
  return <>
    <div className="pipa-wide pipa-location-map"><p className="pipa-note mb-2">Toque no mapa para marcar o local.</p><PipaMap city={city} selected={destination} onPick={disabled ? undefined : locate} pointRadius={5} showLegend={false} /></div>
    <label className="pipa-field pipa-wide"><span>Endereço / referência</span><div className="relative"><input name="address" className="pipa-input pr-10" required maxLength={160} placeholder="Ex.: Estrada do Sítio Serra Negra, km 2" value={form.address} disabled={disabled} aria-describedby={lookupError ? 'pipa-address-lookup-error' : undefined} onChange={event => changeAddress(event.target.value)} />{locating && <Loader2 aria-hidden="true" className="absolute right-3 top-3 h-4 w-4 animate-spin text-content-secondary" />}</div>{locating && <span role="status" className="pipa-note">Buscando endereço…</span>}{lookupError && <span id="pipa-address-lookup-error" role="status" className="pipa-note">{lookupError}</span>}</label>
    {[['latitude', 'Latitude', 90], ['longitude', 'Longitude', 180]].map(([key, label, limit]) => <label key={key} className="pipa-field"><span>{label}</span><input name={key} className="pipa-input" type="number" min={-limit} max={limit} step="any" required placeholder={key === 'latitude' ? 'Ex.: -8.597031' : 'Ex.: -38.574217'} value={form[key]} disabled={disabled} onChange={event => changeCoordinate(key, event.target.value)} onBlur={() => applyCoordinates(form.latitude, form.longitude)} /></label>)}
  </>;
}
