import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Loader2, MapPin, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCity } from '@/contexts/CityContext';
import { cityStateUf } from '@/lib/cityLocation';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { supabase } from '@/lib/customSupabaseClient';
import { emptyPickupPeriod, loadPickupMapCenter, PICKUP_DAYS, PICKUP_DAY_NAMES } from '@/lib/treePickup';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));
const norm = text => String(text || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase();

export default function TreePickupFields({ value, onChange, cityId, city: providedCity, busy, onLocatingChange }) {
  const { cities } = useCity();
  const city = cities.find(item => String(item.id) === String(cityId)) || providedCity;
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const [center, setCenter] = useState(null);
  const [centerReady, setCenterReady] = useState(false);
  const request = useRef(0), addressRevision = useRef(0);
  const periods = value.schedule.length ? value.schedule : [emptyPickupPeriod()];
  const position = value.latitude != null && value.longitude != null ? { lat: value.latitude, lng: value.longitude } : null;
  const uf = cityStateUf(city);
  useEffect(() => {
    let active = true;
    setCenter(null); setCenterReady(false);
    loadPickupMapCenter(supabase, cityId).then(point => {
      if (active) { setCenter(point); setCenterReady(true); }
    });
    return () => { active = false; };
  }, [cityId]);
  useEffect(() => { onLocatingChange?.(locating); }, [locating, onLocatingChange]);
  useEffect(() => () => { request.current++; onLocatingChange?.(false); }, [onLocatingChange]);
  const pick = async point => {
    if (busy) return;
    const token = ++request.current, edited = addressRevision.current;
    onChange({ latitude: point.lat, longitude: point.lng });
    setLocating(true); setNotice('');
    let timeout;
    try {
      const data = await Promise.race([reverseGeocodePin(point, { invoke: supabase.functions.invoke.bind(supabase.functions) }), new Promise(resolve => { timeout = setTimeout(() => resolve(null), 12000); })]);
      if (token !== request.current) return;
      if ((data?.city && city?.name && norm(data.city) !== norm(city.name)) || (data?.state_uf && cityStateUf(city) && data.state_uf !== cityStateUf(city))) {
        onChange({ latitude: null, longitude: null }); setNotice('O ponto fica fora da cidade do atendimento. Marque o local correto.'); return;
      }
      if (data?.address && edited === addressRevision.current) onChange({ address: [data.address, data.suburb].filter(Boolean).join(', ').slice(0, 300) });
      setNotice(data?.address ? 'Endereço encontrado. Confira o número e o acesso.' : 'Ponto marcado. Informe ou confira o endereço ao lado.');
    } catch { if (token === request.current) setNotice('Ponto marcado. Preencha o endereço manualmente.'); }
    finally { clearTimeout(timeout); if (token === request.current) setLocating(false); }
  };
  const updatePeriod = (index, patch) => onChange({ schedule: periods.map((period, current) => current === index ? { ...period, ...patch } : period) });
  return <div className="tree-pickup-layout">
    <section className="tree-pickup-location" aria-label="Local de retirada">
      <div className="min-w-0 space-y-2"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4" />Local de retirada · {city?.name}</h4>{position && <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={() => { request.current++; setLocating(false); setNotice(''); onChange({ latitude: null, longitude: null }); }}>Remover ponto</Button>}</div>
        <label className="block"><span className="sr-only">Endereço de retirada</span><Input maxLength={300} placeholder="Rua, número, bairro e referência de acesso" value={value.address} onChange={event => { addressRevision.current++; onChange({ address: event.target.value }); }} /></label>
        {locating ? <p role="status" className="flex items-center gap-2 text-xs"><Loader2 className="h-4 w-4 animate-spin" />Buscando endereço…</p> : notice && <p role="status" className="text-xs text-content-secondary">{notice}</p>}
      </div>
      <div className="tree-pickup-map" data-testid="pickup-map">{position || centerReady ? <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}><LocationPickerMap initialPosition={position || center} focusPosition={position} initialZoom={position ? 16 : 14} cityZoom={14} fallbackCityCenter={{ name: city?.name || '', uf }} showMarker={Boolean(position)} showLocateButton showSatelliteToggle onLocationChange={pick} readOnly={busy} /></Suspense> : <div className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-xs text-content-secondary"><Loader2 className="h-5 w-5 animate-spin" /><p>Abrindo mapa de {city?.name || 'sua cidade'}…</p></div>}</div>
    </section>
    <section className="tree-pickup-schedule" aria-label="Dias e horários de atendimento"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-sm font-semibold">Dias e horários</h4><Button type="button" variant="outline" size="sm" className="h-8 text-xs" disabled={periods.length >= 14} onClick={() => onChange({ schedule: [...periods, emptyPickupPeriod()] })}><Plus className="mr-1 h-3.5 w-3.5" />Adicionar período</Button></div><p className="tree-pickup-schedule-help text-xs text-content-secondary">Selecione os dias e os horários. Use outro período para o atendimento após o almoço.</p>
      {value.legacy_hours && <div className="rounded-lg bg-surface-subtle p-3 text-xs"><p>Horário anterior: {value.legacy_hours}</p><p className="mt-1 text-content-secondary">Os períodos preenchidos abaixo substituirão esse texto ao salvar.</p><Button type="button" size="sm" variant="ghost" onClick={() => onChange({ legacy_hours: '' })}>Remover texto anterior</Button></div>}
      {periods.map((period, index) => <fieldset key={index} className="tree-pickup-period grid min-w-0 gap-2 rounded-lg border border-edge-subtle p-2" aria-label={`Período ${index + 1}`}><div className="flex min-w-0 flex-wrap items-center gap-1">{PICKUP_DAYS.map((label, day) => <label key={day} className={`inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md border px-2 py-1.5 text-xs ${period.days.includes(day) ? 'border-brand bg-brand-subtleBg text-brand' : 'border-edge-subtle'}`}><input type="checkbox" className="h-3 w-3 accent-brand" aria-label={PICKUP_DAY_NAMES[day]} checked={period.days.includes(day)} onChange={event => updatePeriod(index, { days: event.target.checked ? [...period.days, day] : period.days.filter(item => item !== day) })} />{label}</label>)}</div><div className="flex min-w-0 flex-wrap items-end gap-2"><label className="flex min-w-0 items-center gap-1 text-xs">Das<Input aria-label={`Início do período ${index + 1}`} type="time" className="h-8 w-28" value={period.from} onChange={event => updatePeriod(index, { from: event.target.value })} /></label><label className="flex min-w-0 items-center gap-1 text-xs">Até<Input aria-label={`Fim do período ${index + 1}`} type="time" className="h-8 w-28" value={period.to} onChange={event => updatePeriod(index, { to: event.target.value })} /></label><Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remover período ${index + 1}`} onClick={() => onChange({ schedule: periods.filter((_, current) => current !== index) })}><Trash2 className="h-4 w-4" /></Button></div></fieldset>)}
    </section>
    <label className="tree-pickup-notes grid min-w-0 gap-1.5 text-sm font-medium">Orientações adicionais<textarea rows={2} maxLength={1000} className="w-full min-w-0 rounded-md border bg-background p-3 font-normal" placeholder="Ex.: Leve um documento com foto e uma caixa para transportar a muda." value={value.notes} onChange={event => onChange({ notes: event.target.value })} /><span className="text-xs font-normal text-content-secondary">Opcional · Documentos, transporte da muda e outros cuidados para a retirada.</span></label>
  </div>;
}
