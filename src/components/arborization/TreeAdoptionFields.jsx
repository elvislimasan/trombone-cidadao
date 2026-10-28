import React, { useId } from 'react';
import { Check } from 'lucide-react';

export function AdoptionChoiceGroup({ legend, value, onChange, options, className = '', compact = false }) {
  const id = useId();
  return <fieldset className={`adoption-choice-group min-w-0 ${className}`}>
    <legend className="mb-3 text-sm font-semibold text-content-primary">{legend}</legend>
    <div className={`grid min-w-0 gap-3 ${compact ? options.length === 2 ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3' : ''}`}>
      {options.map(({ value: key, label, description, icon: Icon }) => <label key={key} className={`adoption-choice ${value === key ? 'is-selected' : ''} ${compact ? 'is-compact' : ''}`}>
        <input className="sr-only" type="radio" name={id} value={key} checked={value === key} onChange={() => onChange(key)} />
        {Icon && <span className="adoption-choice-icon"><Icon className="h-5 w-5" /></span>}
        <span className="min-w-0 flex-1"><span className="block font-semibold">{label}</span>{description && <span className="mt-1 block text-sm font-normal leading-relaxed text-content-secondary">{description}</span>}</span>
        <span className="adoption-choice-check" aria-hidden="true">{value === key && <Check className="h-3 w-3" />}</span>
      </label>)}
    </div>
  </fieldset>;
}
