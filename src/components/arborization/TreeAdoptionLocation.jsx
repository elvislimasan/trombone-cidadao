import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Building2, Loader2, MapPin, Navigation, Trees, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AdoptionChoiceGroup } from './TreeAdoptionFields';
import { ADOPTION_PLACES, ADOPTION_WIRING } from '@/lib/treeAdoption';
import { cityStateUf } from '@/lib/cityLocation';
import { reverseGeocodePin } from '@/lib/reverseGeocodePin';
import { supabase } from '@/lib/customSupabaseClient';

const LocationPickerMap = lazy(() => import('@/components/LocationPickerMap'));
const normalized = value => String(value || '').normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase().replace(/^municipio de\s+/, '');

export default function TreeAdoptionLocation({ intro, form, city, cityLabel, onChange, busy, onLocatingChange }) {
  const [locating, setLocating] = useState(false);
  const [notice, setNotice] = useState('');
  const [wrongCity, setWrongCity] = useState(false);
  const [recenter, setRecenter] = useState(null);
  const request = useRef(0);
  const edits = useRef({ address: 0, neighborhood: 0 });
  const uf = cityStateUf(city);
  const position = form.latitude !== '' && form.longitude !== '' ? { lat: Number(form.latitude), lng: Number(form.longitude) } : null;
  useEffect(() => { onLocatingChange?.(locating); }, [locating, onLocatingChange]);
  useEffect(() => () => { request.current++; onLocatingChange?.(false); }, [onLocatingChange]);
  const pick = async point => {
    const token = ++request.current;
    const originalEdits = { ...edits.current };
    onChange({ latitude: point.lat, longitude: point.lng, address: '', neighborhood: '' });
    setLocating(true); setNotice(''); setWrongCity(false);
    let timeout;
    try {
      const data = await Promise.race([
        reverseGeocodePin(point, { invoke: supabase.functions.invoke.bind(supabase.functions) }),
        new Promise(resolve => { timeout = setTimeout(() => resolve(null), 10000); }),
      ]);
      if (token !== request.current) return;
      if ((data?.state_uf && uf && data.state_uf.toUpperCase() !== uf)
        || (data?.city && normalized(data.city) !== normalized(city?.name))) {
        onChange({ latitude: '', longitude: '', address: '', neighborhood: '' });
        setWrongCity(true); setNotice(`O ponto informado fica em ${[data.city, data.state_uf].filter(Boolean).join(' · ')}, fora de ${cityLabel}. Marque o local na cidade selecionada.`);
        setRecenter({ name: city.name, uf, nonce: Date.now() });
        return;
      }
      const values = {};
      if (edits.current.address === originalEdits.address) values.address = data?.address || '';
      if (edits.current.neighborhood === originalEdits.neighborhood) values.neighborhood = data?.suburb || '';
      onChange(values);
      setNotice(data?.address ? 'Endereço encontrado. Confira o número e a referência de acesso.' : 'Ponto marcado. Preencha o endereço ou a referência ao lado.');
    } catch {
      if (token === request.current) setNotice('Ponto marcado. Não foi possível consultar o endereço; preencha os campos manualmente.');
    } finally {
      clearTimeout(timeout);
      if (token === request.current) setLocating(false);
    }
  };
  const correct = (field, value) => { edits.current[field]++; onChange({ [field]: value }); };
  return <div className="adoption-location-layout">
    {intro}
    <div className="adoption-location-fields">
      <AdoptionChoiceGroup legend="Em qual zona?" value={form.zone} onChange={zone => onChange({ zone })} compact options={[
        { value: 'urbana', label: 'Urbana', icon: Building2 }, { value: 'rural', label: 'Rural', icon: Trees },
      ]} />
      <label className="adoption-field">Onde a árvore será plantada?<select value={form.planting_place} onChange={event => onChange({ planting_place: event.target.value })}><option value="">Escolha o tipo de espaço</option>{Object.entries(ADOPTION_PLACES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <div className="adoption-address-fields">
        <label className="adoption-field">{form.zone === 'rural' ? 'Propriedade ou referência' : 'Endereço e número'}<Input maxLength={300} placeholder={form.zone === 'rural' ? 'Ex.: Sítio, comunidade e estrada de acesso' : 'Rua, número ou ponto de referência'} value={form.address} onChange={event => correct('address', event.target.value)} /></label>
        <label className="adoption-field">Bairro ou localidade<Input maxLength={160} placeholder="Informe o bairro ou a comunidade" value={form.neighborhood} onChange={event => correct('neighborhood', event.target.value)} /></label>
      </div>
      <label className="adoption-field"><span className="flex items-center gap-2"><Zap className="h-4 w-4 text-content-secondary" />Há fiação aérea acima do local?</span><select value={form.overhead_wiring} onChange={event => onChange({ overhead_wiring: event.target.value })}><option value="">Informe a situação</option>{Object.entries(ADOPTION_WIRING).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><span className="text-xs font-normal leading-relaxed text-content-secondary">Ajuda a definir o porte adequado da árvore.</span></label>
    </div>
    <section className="adoption-location-map" aria-label="Mapa do local de plantio">
      <div className="adoption-map-heading"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-primary" />Marque o ponto do plantio</h3><p className="mt-1 text-xs text-content-secondary">{cityLabel} · Toque ou clique no local exato.</p></div><Button type="button" size="sm" variant="ghost" className="h-8 gap-1.5 px-2 text-xs" onClick={() => setRecenter({ name: city.name, uf, nonce: Date.now() })}><Navigation className="h-3.5 w-3.5" />Recentrar cidade</Button></div>
      <div className="adoption-map-canvas" style={busy ? { pointerEvents: 'none' } : undefined}>
        <Suspense fallback={<div className="flex h-full items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>}><LocationPickerMap initialPosition={position} initialZoom={16} cityZoom={15} fallbackCityCenter={{ name: city.name, uf }} flyToCity={recenter} onLocationChange={pick} showMarker={Boolean(position)} showLocateButton showSatelliteToggle readOnly={busy} /></Suspense>
      </div>
      <div className="adoption-map-status text-xs text-content-secondary">
        {locating ? <p role="status" className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" />Identificando o endereço…</p> : <p role={wrongCity ? 'alert' : 'status'} className={wrongCity ? 'text-destructive' : ''}>{notice || 'Você também pode usar o botão de localização do mapa para encontrar o local onde está.'}</p>}
        {position && <details><summary className="cursor-pointer font-medium">Ponto selecionado · Ver coordenadas</summary><p className="mt-1 tabular-nums">{position.lat.toFixed(6)}, {position.lng.toFixed(6)}</p></details>}
      </div>
    </section>
  </div>;
}
