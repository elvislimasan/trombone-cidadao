import React from 'react';
import { MUNICIPAL_STAFF_ROLES } from '@/lib/municipalAccess';
import { availableStaffModules, toggleStaffModule } from '@/lib/municipalStaffModules';

export default function MunicipalStaffResponsibilities({ value, onChange, disabled, roles = MUNICIPAL_STAFF_ROLES, channel }) {
  const modules = availableStaffModules(channel);
  return <div className="space-y-6"><fieldset disabled={disabled} className="space-y-4">
    <legend className="text-sm font-semibold">Cargo na secretaria</legend>
    {roles.map(role => <label key={role.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-edge-subtle p-3 text-sm">
      <input type="checkbox" className="mt-1" checked={value.cargos?.includes(role.id) || false} onChange={event => onChange({ ...value, cargos: event.target.checked ? [...(value.cargos || []), role.id] : value.cargos.filter(id => id !== role.id) })} />
      <span><strong className="block">{role.label}</strong><span className="mt-1 block text-xs text-content-secondary">{role.id === 'executor' ? 'Executa e resolve solicitações das categorias vinculadas à secretaria.' : role.description}</span></span>
    </label>)}
    <p className="text-xs leading-5 text-content-secondary">{roles.length === 1 && roles[0]?.id === 'inventario' ? 'Esta secretaria não tem categorias de atendimento. O funcionário poderá cuidar apenas dos mapas e cadastros habilitados para o inventário.' : 'As áreas vêm do cadastro da secretaria. Se a pessoa acumular funções, selecione os cargos correspondentes.'}</p>
  </fieldset>
    {modules.length > 0 && <fieldset disabled={disabled} className="space-y-3">
      <legend className="text-sm font-semibold">Módulos com acesso</legend>
      {modules.map(module => <label key={module.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-edge-subtle p-3 text-sm">
        <input type="checkbox" checked={!value.disabled_modules?.includes(module.id)} onChange={event => onChange(toggleStaffModule(value, module.id, event.target.checked))} />
        <span>{module.label}</span>
      </label>)}
      <p className="text-xs text-content-secondary">Desmarcar bloqueia o módulo para este funcionário nesta secretaria. O cargo define as ações permitidas.</p>
      {value.disabled_modules?.length > 0 && <button type="button" className="text-sm font-semibold text-brand underline" onClick={() => onChange({ ...value, disabled_modules: [] })}>Usar todos da secretaria</button>}
    </fieldset>}
  </div>;
}
