import React from 'react';
import { LampDesk, Loader2, MapPin } from 'lucide-react';
import LocationPickerMap from '@/components/LocationPickerMap';
import PoleOptionField from '@/components/municipality/PoleOptionField';
import { Input } from '@/components/ui/input';
import { polePosition } from '@/lib/poleAddress';
import { LAMP_TYPES, isStandardLampType } from '@/lib/lightingCatalog';

const inputClass = 'mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm';
const statuses = [['aceso', 'Sem problema registrado'], ['apagado', 'Apagado ou com problema']];

export const POLE_FORM_STEPS = ['Lâmpada', 'Localização', 'Cadastro', 'Rede'];

function NetworkCodeField({ field, label, value, onChange, options, hint, placeholder, disabled }) {
  const listId = `pole-${field}-suggestions`;
  const hintId = `pole-${field}-hint`;
  return <label className="min-w-0 text-sm font-semibold">{label}
    <Input className="mt-1" list={listId} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder} aria-describedby={hintId} autoComplete="off" />
    <datalist id={listId}>{options.map((option) => <option key={option} value={option} />)}</datalist>
    <span id={hintId} className="mt-1 block text-xs font-normal leading-4 text-content-secondary">{hint}</span>
  </label>;
}

export default function MunicipalPoleFormSteps({ step, form, setForm, creating, selected, saving, locatingAddress, addressLookupFailed, center, city, onLocationChange, onAddressChange, poleOptionsFor }) {
  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const position = polePosition(form);
  const mapCenter = position || (center ? { lat: center[0], lng: center[1] } : null);

  if (step === 1) return <div className="flex h-full min-h-0 flex-col gap-3">
    <div className="grid shrink-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <label className="text-sm font-semibold">Número do poste <span className="text-brand">*</span><Input className="mt-1" value={form.identifier} onChange={(event) => update('identifier', event.target.value)} disabled={saving} placeholder="Ex.: 1024" /></label>
      <span className="flex items-center gap-1.5 pb-2 text-xs text-content-secondary"><MapPin className="h-4 w-4 text-brand" />{creating ? 'Toque no mapa para marcar; depois arraste o pin.' : 'Localização cadastrada do poste.'}</span>
    </div>
    <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl border border-edge-subtle bg-surface-subtle">
      <LocationPickerMap initialPosition={mapCenter} initialZoom={position ? 17 : 14} fallbackCityCenter={city?.name ? { name: city.name, uf: city.states?.uf } : null} onLocationChange={onLocationChange} showMarker={Boolean(position)} readOnly={!creating} showLocateButton={creating} showSatelliteToggle />
    </div>
    <div className="shrink-0">
      <label className="text-sm font-semibold" htmlFor="lighting-pole-address">Endereço</label>
      <div className="relative mt-1"><Input id="lighting-pole-address" value={form.address} onChange={(event) => onAddressChange(event.target.value)} disabled={saving} placeholder={locatingAddress ? 'Buscando endereço do pin…' : 'Rua e número, se disponíveis'} className="pr-10" />{locatingAddress && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-content-secondary" />}</div>
      {addressLookupFailed && !form.address && <p role="status" className="mt-1 text-xs text-content-secondary">Endereço não encontrado para o pin. Informe uma referência acima.</p>}
      {creating && <p className="mt-1 text-xs text-content-secondary">{position ? `${position.lat.toFixed(6)}, ${position.lng.toFixed(6)} · Confira o endereço antes de continuar.` : 'Marque a posição do poste para continuar.'}</p>}
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

  if (step === 2) return <div className="flex min-h-full flex-col justify-center gap-5 py-2"><div><h3 className="font-bold">Dados do cadastro</h3><p className="mt-1 text-sm text-content-secondary">Referências opcionais do inventário do poste.</p></div>
    <div className="grid grid-cols-2 gap-3 sm:gap-4">
      <label className="min-w-0 text-sm font-semibold">Código do inventário<Input className="mt-1" value={form.source_code} onChange={(event) => update('source_code', event.target.value)} disabled={saving} placeholder="Ex.: 132137173" /></label>
      <label className="min-w-0 text-sm font-semibold">Plaqueta<Input className="mt-1" value={form.source_plate} onChange={(event) => update('source_plate', event.target.value)} disabled={saving} placeholder="Ex.: C81464" /></label>
      <label className="col-span-2 text-sm font-semibold">Referência do cadastro<Input className="mt-1" value={form.source_address} onChange={(event) => update('source_address', event.target.value)} disabled={saving} placeholder="Ex.: NOVA - TRÊS MARIAS" /></label>
      <label className="col-span-2 text-sm font-semibold">Observações<Input className="mt-1" value={form.observations} onChange={(event) => update('observations', event.target.value)} disabled={saving} /></label>
    </div>
  </div>;

  return <div className="flex min-h-full flex-col justify-center gap-5 py-2"><div><h3 className="font-bold">Rede elétrica</h3><p className="mt-1 text-sm text-content-secondary">Dados opcionais do cadastro técnico. Se não souber um código, deixe o campo vazio.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
      <label className="min-w-0 text-sm font-semibold">Alimentador<Input className="mt-1" value={form.feeder} onChange={(event) => update('feeder', event.target.value)} disabled={saving} placeholder="Ex.: AL_FLORE" /><span className="mt-1 block text-xs font-normal leading-4 text-content-secondary">Código do circuito no cadastro da rede.</span></label>
      <NetworkCodeField field="transformer_code" label="Transformador" value={form.transformer_code} onChange={(value) => update('transformer_code', value)} options={poleOptionsFor('transformer_code')} disabled={saving} placeholder="Ex.: 20948666" hint="Código do transformador no cadastro técnico. Digite ou escolha uma sugestão da cidade, se tiver certeza." />
      <PoleOptionField label="Tipo de ponto" value={form.point_type} onChange={(value) => update('point_type', value)} options={poleOptionsFor('point_type')} disabled={saving} />
      <PoleOptionField label="Tipo de rede" value={form.network_type} onChange={(value) => update('network_type', value)} options={poleOptionsFor('network_type')} disabled={saving} />
      <NetworkCodeField field="switch_code" label="Chave da rede" value={form.switch_code} onChange={(value) => update('switch_code', value)} options={poleOptionsFor('switch_code')} disabled={saving} placeholder="Ex.: A17917" hint="Código da chave indicado no cadastro da rede. Digite ou escolha uma sugestão da cidade, se tiver certeza." />
      <label className="min-w-0 text-sm font-semibold">Número da companhia<Input className="mt-1" value={form.company_number} onChange={(event) => update('company_number', event.target.value)} disabled={saving} placeholder="Ex.: A17917" /><span className="mt-1 block text-xs font-normal leading-4 text-content-secondary">Identificação deste poste na concessionária. Consulte a plaqueta ou o cadastro técnico.</span></label>
    </div>
  </div>;
}
