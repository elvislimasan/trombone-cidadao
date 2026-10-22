import React from 'react';
import { MUNICIPAL_STAFF_ROLES } from '@/lib/municipalAccess';

export default function MunicipalStaffResponsibilities({ value, onChange, disabled, roles = MUNICIPAL_STAFF_ROLES }) {
  return <fieldset disabled={disabled} className="space-y-4">
    <legend className="text-sm font-semibold">Cargo na secretaria</legend>
    {roles.map(role => <label key={role.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-edge-subtle p-3 text-sm">
      <input type="checkbox" className="mt-1" checked={value.cargos?.includes(role.id) || false} onChange={event => onChange({ ...value, cargos: event.target.checked ? [...(value.cargos || []), role.id] : value.cargos.filter(id => id !== role.id) })} />
      <span><strong className="block">{role.label}</strong><span className="mt-1 block text-xs text-content-secondary">{role.id === 'executor' ? 'Executa e resolve solicitações das categorias vinculadas à secretaria.' : role.description}</span></span>
    </label>)}
    <p className="text-xs leading-5 text-content-secondary">{roles.length === 1 && roles[0]?.id === 'inventario' ? 'Esta secretaria não tem categorias de atendimento. O funcionário poderá cuidar apenas dos mapas e cadastros habilitados para o inventário.' : 'As áreas vêm do cadastro da secretaria. Se a pessoa acumular funções, selecione os cargos correspondentes.'}</p>
  </fieldset>;
}
