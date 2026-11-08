import React, { useId } from 'react';
import { Check } from 'lucide-react';

// Shared by citizen journeys. Only earlier steps can be revisited without validation.
export default function WizardProgress({ steps, current, onSelect, busy = false, label, labelPrefix, className = '' }) {
  const id = useId();
  const prefix = labelPrefix || `wizard-${id}`;
  return <ol className={`wizard-progress ${className}`} style={{ '--wizard-steps': steps.length }} data-step-count={steps.length} aria-label={label || `Etapa ${current + 1} de ${steps.length}`}>
    {steps.map((step, index) => {
      const title = typeof step === 'string' ? step : step.label;
      const content = <><span className="wizard-step-number" aria-hidden="true">{index < current ? <Check size={16} /> : index + 1}</span><span id={`${prefix}-${index}`}>{title}</span></>;
      return <li key={title} aria-current={current === index ? 'step' : undefined} data-complete={index < current}>
        {onSelect ? <button type="button" disabled={busy || index >= current} onClick={() => onSelect(index)} aria-label={`Etapa ${index + 1} de ${steps.length}: ${title}`}>{content}</button> : content}
      </li>;
    })}
  </ol>;
}
