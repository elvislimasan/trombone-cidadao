import React from 'react';
import { Input } from '@/components/ui/input';
import { LAMP_TYPES, isStandardLampType } from '@/lib/lightingCatalog';
import { cleanPoleIdentifier } from '@/lib/electricianPole';

export default function ElectricianPoleFields({ value, onChange, disabled }) {
  const field = (key, next) => onChange({ ...value, [key]: next });
  return <fieldset disabled={disabled} className="space-y-4 disabled:opacity-70">
    <legend className="sr-only">Dados do poste após o serviço</legend>
    <div className="grid grid-cols-2 gap-4">
      <label className="col-span-2 text-sm font-semibold">Identificador do poste<Input className="mt-1.5 h-11" maxLength={200} value={value.identifier} onChange={(event) => field('identifier', event.target.value)} onBlur={() => { const code = cleanPoleIdentifier(value.identifier); if (code !== value.identifier) field('identifier', code); }} placeholder="Ex.: X097074" required /><span className="mt-1 block text-xs font-normal text-content-secondary">Código usado no mapa e no título das ordens. Corrija se o cadastro estiver errado.</span></label>
      <label className="col-span-2 text-sm font-semibold">Lâmpada instalada <span className="font-normal text-content-tertiary">(opcional; padrão LED)</span><select value={value.lamp_type} onChange={(event) => field('lamp_type', event.target.value)} className="mt-1.5 h-11 w-full rounded-xl border border-edge-default bg-surface-raised px-3 text-sm focus:ring-2 focus:ring-brand"><option value="">Não informado</option>{!isStandardLampType(value.lamp_type) && <option value={value.lamp_type}>{value.lamp_type} (cadastro anterior)</option>}{LAMP_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
      <label className="text-sm font-semibold">Potência (W)<Input className="mt-1.5 h-11" type="number" min="0.01" step="0.01" value={value.lamp_power_w} onChange={(event) => field('lamp_power_w', event.target.value)} placeholder="Ex.: 100" /></label>
      <label className="text-sm font-semibold">Pontos de luz<Input className="mt-1.5 h-11" type="number" min="1" max="100" step="1" value={value.lamp_count} onChange={(event) => field('lamp_count', event.target.value)} placeholder="Ex.: 1" /></label>
    </div>
    <details className="rounded-xl border border-edge-subtle p-3"><summary className="cursor-pointer text-sm font-semibold">Outros dados da rede</summary><div className="mt-4 grid gap-3 sm:grid-cols-2">{[['point_type', 'Tipo de ponto'], ['network_type', 'Tipo de rede'], ['feeder', 'Alimentador'], ['transformer_code', 'Transformador'], ['switch_code', 'Chave da rede'], ['company_number', 'Número da companhia']].map(([key, label]) => <label key={key} className="text-sm font-medium">{label}<Input className="mt-1.5" maxLength={200} value={value[key]} onChange={(event) => field(key, event.target.value)} /></label>)}</div></details>
  </fieldset>;
}
