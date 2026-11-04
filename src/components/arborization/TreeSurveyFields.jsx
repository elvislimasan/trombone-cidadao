import React from 'react';
import { Input } from '@/components/ui/input';
import { TREE_SURVEY_OPTIONS, isPlannedTree, treeSurveyEntries } from '@/lib/treePlanning';

const inputClass = 'min-h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
const Field = ({ label, children }) => <label className="grid min-w-0 gap-1.5 text-sm font-medium">{label}{children}</label>;

export function TreeSurveySummary({ tree }) {
  const entries = treeSurveyEntries(tree);
  if (!entries.length) return null;
  return <details className="mt-4 rounded-xl border border-edge-subtle p-4"><summary className="cursor-pointer text-sm font-semibold">Vistoria e planejamento</summary><dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">{entries.map(([label, value]) => <div key={label} className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm">{value}</dd></div>)}</dl></details>;
}

export default function TreeSurveyFields({ form, onChange }) {
  const planned = isPlannedTree(form);
  const select = key => {
    const config = TREE_SURVEY_OPTIONS[key];
    if (config.multiple) return <fieldset key={key} className="min-w-0 space-y-2"><legend className="mb-2 text-sm font-medium">{config.label}</legend>{Object.entries(config.options).map(([value, label]) => <label key={value} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={(form[key] || []).includes(value)} onChange={event => {
      const current = form[key] || [];
      onChange(key, event.target.checked ? value === 'nenhuma' ? ['nenhuma'] : [...current.filter(item => item !== 'nenhuma'), value] : current.filter(item => item !== value));
    }} />{label}</label>)}</fieldset>;
    return <Field key={key} label={config.label}><select className={inputClass} value={form[key] || ''} onChange={event => {
      onChange(key, event.target.value);
      if (key === 'power_lines' && event.target.value === 'nenhuma') onChange('wire_conflict', 'nenhum');
    }}><option value="">Não avaliado</option>{Object.entries(config.options).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>;
  };
  return <div className="space-y-4" data-testid="tree-survey-fields">
    <details className="rounded-xl border border-edge-subtle p-4" open={planned || undefined}><summary className="cursor-pointer text-sm font-semibold">Local de plantio e infraestrutura</summary><div className="mt-4 space-y-4">
      {select('planting_site')}{form.planting_site === 'calcada' && select('sidewalk_width')}{select('power_lines')}
      {!planned && <>{select('wire_conflict')}{select('sidewalk_damage')}</>}{select('equipment_conflicts')}
    </div></details>
    {!planned && <details className="rounded-xl border border-edge-subtle p-4"><summary className="cursor-pointer text-sm font-semibold">Estado fitossanitário e condição geral</summary><div className="mt-4 space-y-4">{['health', 'pests', 'trunk_lesions', 'trunk_lean', 'immediate_intervention'].map(select)}</div></details>}
    <details className="rounded-xl border border-edge-subtle p-4"><summary className="cursor-pointer text-sm font-semibold">Planejamento e ação recomendada</summary><div className="mt-4 space-y-4">
      <Field label="Ação programada"><textarea className={`${inputClass} min-h-24 py-2`} maxLength={2000} value={form.scheduled_action || ''} onChange={event => onChange('scheduled_action', event.target.value)} /></Field>
      {select('execution_term')}
      {!planned && <Field label="Nova muda em caso de corte — espécie sugerida"><Input maxLength={200} value={form.replacement_species || ''} onChange={event => onChange('replacement_species', event.target.value)} /></Field>}
    </div></details>
  </div>;
}
