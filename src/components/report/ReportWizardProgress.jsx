import React from 'react';
import WizardProgress from '@/components/ui/wizard-progress';

export const REPORT_STEPS = [
  { label: 'Problema' },
  { label: 'Local' },
  { label: 'Evidências' },
];

export default function ReportWizardProgress({ step }) {
  return <WizardProgress steps={REPORT_STEPS} current={step} labelPrefix="report-step-label" className="report-wizard-progress" />;
}
