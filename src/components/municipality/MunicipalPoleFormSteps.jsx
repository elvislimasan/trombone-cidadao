import { poleCode } from '@/lib/poleDisplay';
import React, { useState } from 'react';
import { LampDesk, Loader2, MapPin } from 'lucide-react';
import LocationPickerMap from '@/components/LocationPickerMap';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import PoleCoordinateFields from './PoleCoordinateFields';
import { polePosition } from '@/lib/poleAddress';
import { LAMP_TYPES, isStandardLampType } from '@/lib/lightingCatalog';

const inputClass = 'mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm';
const statuses = [['aceso', 'Sem problema registrado'], ['apagado', 'Apagado ou com problema']];

export const POLE_FORM_STEPS = ['Lâmpada', 'Localização'];

export default function MunicipalPoleFormSteps({ step, form, setForm, creating, selected, saving, canEditLocation = false, locatingAddress, addressLookupFailed, center, city, onLocationChange, onAddressChange, onCoordinatesPendingChange }) {
  const [mapFocus, setMapFocus] = useState(null);
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const position = polePosition(form);
  const mapCenter = position || (center ? { lat: center[0], lng: center[1] } : null);

  if (step === 1) return <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto">
    <div className="grid shrink-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="text-sm font-semibold">Código do poste <span className="text-brand">*</span><Input className="mt-1" maxLength={200} value={form.identifier} onChange={(event) => update('identifier', event.target.value)} onBlur={() => update('identifier', poleCode(form.identifier))} disabled={saving} placeholder="Ex.: X097074" /><span className="mt-1 block text-xs font-normal text-content-secondary">Código exibido no mapa e nas ordens.</span></label>
      <span className="flex items-center gap-1.5 pb-2 text-xs text-content-secondary"><MapPin className="h-4 w-4 text-brand" />{canEditLocation ? 'Toque no mapa ou arraste o pin para corrigir.' : 'Localização cadastrada do poste.'}</span>
    </div>
    <div className="relative min-h-[180px] flex-1 shrink-0 overflow-hidden rounded-xl border border-edge-subtle bg-surface-subtle">
      <div className="absolute inset-0"><LocationPickerMap initialPosition={mapCenter} focusPosition={mapFocus} initialZoom={position ? 17 : 14} fallbackCityCenter={city?.name ? { name: city.name, uf: city.states?.uf } : null} onLocationChange={(point) => { setMapFocus(null); onLocationChange(point); }} showMarker={Boolean(position)} readOnly={!canEditLocation || saving} showLocateButton={canEditLocation && !saving} showSatelliteToggle /></div>
    </div>
    {canEditLocation && <PoleCoordinateFields position={position} disabled={saving} onPendingChange={onCoordinatesPendingChange} onApply={(point) => { setMapFocus({ ...point, nonce: Date.now() }); onLocationChange(point); }} />}
    <div className="shrink-0">
      <div className="flex items-center justify-between gap-2"><label className="text-sm font-semibold" htmlFor="lighting-pole-address">Endereço</label>{canEditLocation && <Button type="button" size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={saving || locatingAddress || !position} onClick={() => onLocationChange(position)}>Buscar endereço do pin</Button>}</div>
      <div className="relative mt-1"><Input id="lighting-pole-address" value={form.address} onChange={(event) => onAddressChange(event.target.value)} disabled={saving} placeholder={locatingAddress ? 'Buscando endereço do pin…' : 'Rua e número, se disponíveis'} className="pr-10" />{locatingAddress && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-content-secondary" />}</div>
      {addressLookupFailed && !form.address && <p role="status" className="mt-1 text-xs text-content-secondary">Endereço não encontrado para o pin. Informe uma referência acima.</p>}
    </div>
  </div>;

  if (step === 0) return <div className="flex min-h-full flex-col justify-center gap-5 py-2">
    <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-subtleBg text-brand"><LampDesk className="h-5 w-5" /></span><div><h3 className="font-bold">Iluminação do poste</h3><p className="text-xs text-content-secondary">Funcionamento e características da lâmpada.</p></div></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-semibold">Tipo de lâmpada<select className={inputClass} value={form.lamp_type} onChange={(event) => update('lamp_type', event.target.value)} disabled={saving}><option value="">Não informado</option>{!isStandardLampType(form.lamp_type) && <option value={form.lamp_type}>Valor anterior: {form.lamp_type}</option>}{LAMP_TYPES.map((type) => <option key={type} value={type}>{type}</option>)}</select>{!isStandardLampType(form.lamp_type) && <span className="mt-1 block text-xs font-normal text-danger">Selecione uma opção padronizada.</span>}</label>
      <label className="text-sm font-semibold">Potência (W)<Input className="mt-1" type="number" min="0.01" step="0.01" value={form.lamp_power_w} onChange={(event) => update('lamp_power_w', event.target.value)} disabled={saving} /></label>
      <label className="text-sm font-semibold">Situação informada pela prefeitura<select className={inputClass} value={form.lighting_status === 'manutencao' ? 'apagado' : form.lighting_status} onChange={(event) => update('lighting_status', event.target.value)} disabled={saving}>{selected?.lighting_status === 'removido' && <option value="removido">Removido</option>}{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="mt-1 block text-xs font-normal text-content-secondary">“Sem problema registrado” não substitui uma vistoria.</span></label>
      <label className="text-sm font-semibold">Pontos de luz<Input className="mt-1" type="number" min="1" max="100" step="1" value={form.lamp_count} onChange={(event) => update('lamp_count', event.target.value)} disabled={saving} placeholder="Ex.: 1" /></label>
    </div>
    {selected?.is_broken && !creating && <p role="status" className="rounded-xl border border-danger-subtleFg/20 bg-danger-subtleBg p-3 text-xs text-danger-subtleFg">Há relato de problema ativo neste poste. O mapa continuará mostrando “Apagado ou com problema” até que o relato seja resolvido.</p>}
  </div>;

  return null;
}
