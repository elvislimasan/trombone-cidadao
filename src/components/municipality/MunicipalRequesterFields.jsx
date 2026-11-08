import React, { useId } from 'react';
import { Input } from '@/components/ui/input';

export default function MunicipalRequesterFields({ value, onChange, errors = {} }) {
  const id = useId();
  return <fieldset className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/20 p-4">
    <legend className="px-1 text-sm font-semibold">Cidadão solicitante <span className="font-normal text-muted-foreground">(opcional)</span></legend>
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">
      {[['requester_name', 'Nome do cidadão', 'text', 'Nome de quem solicitou', 160], ['requester_phone', 'Telefone do cidadão', 'tel', '(87) 99999-9999', 32]].map(([field, label, type, placeholder, maxLength]) => <div key={field} className="min-w-0">
        <label htmlFor={`${id}-${field}`} className="mb-1.5 block text-sm font-medium">{label} <span className="text-xs font-normal text-muted-foreground">(opcional)</span></label>
        <Input id={`${id}-${field}`} type={type} autoComplete="off" inputMode={type === 'tel' ? 'tel' : undefined} maxLength={maxLength} value={value[field] || ''} onChange={event => onChange({ [field]: event.target.value })} placeholder={placeholder} className="min-h-11 w-full min-w-0" data-error-field={field} aria-invalid={Boolean(errors[field])} aria-describedby={errors[field] ? `${id}-${field}-error` : undefined} />
        {errors[field] && <p id={`${id}-${field}-error`} className="mt-1 text-xs text-destructive" role="alert">{errors[field]}</p>}
      </div>)}
    </div>
  </fieldset>;
}
