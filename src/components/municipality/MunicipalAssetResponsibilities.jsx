import React from 'react';

export const MUNICIPAL_ASSET_MODULES = [
  { id: 'urban_planning', label: 'Gerenciar ruas' },
  { id: 'arborization', label: 'Gerenciar arborização' },
];

export default function MunicipalAssetResponsibilities({ value, onChange, disabled = false }) {
  return <fieldset disabled={disabled} className="space-y-3">
    <legend className="text-sm font-semibold">Responsabilidades no município</legend>
    <p className="text-xs leading-5 text-content-secondary">Escolha uma ou as duas áreas. Quem recebe ambas terá duas abas no painel.</p>
    {MUNICIPAL_ASSET_MODULES.map(module => <label key={module.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-edge-subtle p-3 text-sm">
      <input type="checkbox" className="h-4 w-4 accent-brand" checked={value.includes(module.id)}
        onChange={event => onChange(event.target.checked ? [...value, module.id] : value.filter(id => id !== module.id))} />
      {module.label}
    </label>)}
  </fieldset>;
}
