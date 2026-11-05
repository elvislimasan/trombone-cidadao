import React from 'react';
import { Check } from 'lucide-react';

export const REPORT_STEPS = [
  { label: 'Problema' },
  { label: 'Local' },
  { label: 'Evidências' },
];

export default function ReportWizardProgress({ step }) {
  return <ol className="report-wizard-progress" aria-label={`Etapa ${step + 1} de ${REPORT_STEPS.length}`}>
    {REPORT_STEPS.map((item, index) => <li key={item.label} aria-current={step === index ? 'step' : undefined} data-complete={index < step}>
      <span className="report-step-number" aria-hidden="true">{index < step ? <Check size={16} /> : index + 1}</span>
      <span id={`report-step-label-${index}`}>{item.label}</span>
    </li>)}
  </ol>;
}
