import React, { useState } from 'react';
import { Input } from '@/components/ui/input';

export default function PoleOptionField({ label, value, onChange, options, disabled, placeholder }) {
  const [creating, setCreating] = useState(false);
  const uniqueOptions = [...new Set(options.filter(Boolean))];
  const isNew = creating || (Boolean(value) && !uniqueOptions.includes(value));
  return <label className="min-w-0 text-sm font-semibold">{label}
    <select className="mt-1 h-10 w-full rounded-lg border border-input bg-background px-3 text-sm" value={isNew ? '__new__' : value || ''} disabled={disabled} onChange={(event) => {
      if (event.target.value === '__new__') { setCreating(true); onChange(''); }
      else { setCreating(false); onChange(event.target.value); }
    }}>
      <option value="">Não informado</option>
      {uniqueOptions.map((option) => <option key={option} value={option}>{option}</option>)}
      <option value="__new__">Cadastrar nova opção…</option>
    </select>
    {isNew && <><Input className="mt-2" aria-label={`Nova opção de ${label.toLowerCase()}`} value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} placeholder={placeholder || `Nova opção de ${label.toLowerCase()}`} /><span className="mt-1 block text-xs font-normal text-content-secondary">Ao salvar o poste, esta opção ficará disponível para a cidade.</span></>}
  </label>;
}
