import React from 'react';
import { Check, ChevronDown, Leaf, MapPin, Pencil, Sprout, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TREE_ACTIONS, TREE_STATUS } from '@/lib/arborization';
import { isPlannedTree } from '@/lib/treePlanning';
import { TreeSurveySummary } from './TreeSurveyFields';

export const entrySelectClass = 'tree-entry-input';
export function EntryField({ label, children, hint, className = '' }) {
  return <label className={`tree-entry-field ${className}`}>{label}{children}{hint && <span className="tree-entry-hint">{hint}</span>}</label>;
}

export function EntryProgress({ step, furthestStep, blocked, onChange }) {
  return <nav className="tree-entry-progress" aria-label="Etapas do cadastro"><ol>{[
    ['Localização', 'Defina o ponto'], ['Dados da árvore', 'Identifique e avalie'], ['Revisão', 'Confira e salve'],
  ].map(([label, description], index) => <li key={label}><button type="button" aria-current={step === index ? 'step' : undefined} disabled={index > furthestStep || blocked} onClick={() => onChange(index)}>
    <span className={`tree-entry-progress-number ${index < step ? 'is-complete' : ''}`}>{index < step ? <Check size={16} /> : `0${index + 1}`}</span><span><strong>{label}</strong><small>{description}</small></span>
  </button></li>)}</ol></nav>;
}

export function EntrySection({ title, description, Icon = Leaf, children, open, className = '', ...props }) {
  return <details className={`tree-entry-section ${className}`} open={open} {...props}><summary><span className="tree-entry-section-icon"><Icon size={18} /></span><span><strong>{title}</strong>{description && <small>{description}</small>}</span><ChevronDown size={16} className="tree-entry-section-chevron" /></summary><div className="tree-entry-section-body">{children}</div></details>;
}

export function EntryKind({ form, onChange, batchMode = false }) {
  const planned = isPlannedTree(form);
  return <section className="tree-entry-kind-block" aria-label="Tipo de cadastro"><fieldset className="tree-entry-kind"><legend>O que você quer cadastrar?</legend>{[
    ['existing', Trees, 'Árvore existente', 'Registrar e acompanhar'], ['planned', Sprout, 'Planejar plantio', 'Reservar um local e um ano'],
  ].map(([value, Icon, label, hint]) => <label key={value} className={planned === (value === 'planned') ? 'is-selected' : ''}>
    <input type="radio" name="tree-registration-type" value={value} checked={planned === (value === 'planned')} onChange={() => {
      onChange('status', value === 'planned' ? 'planejada' : 'saudavel');
      if (value === 'planned') { onChange('planted_at', ''); onChange('estimated_birth_year', ''); }
      if (value === 'existing' && !form.id) onChange('planting_year', '');
    }} /><Icon size={22} /><span><strong>{label}</strong><small>{hint}</small></span><span className="tree-entry-kind-check"><Check size={12} /></span>
  </label>)}</fieldset>
    {(planned || form.planting_year) && <div className="tree-entry-year"><span className="tree-entry-section-icon"><Sprout size={20} /></span><EntryField label={planned ? 'Ano previsto de plantio *' : 'Ano previsto no planejamento original'} hint={batchMode ? 'O ano será aplicado a todas as árvores deste lote.' : undefined}><Input type="number" inputMode="numeric" min="1900" max="9999" required={planned} placeholder={`Ex.: ${new Date().getFullYear() + 1}`} value={form.planting_year ?? ''} onChange={event => onChange('planting_year', event.target.value)} /></EntryField></div>}
  </section>;
}

export function EntryReview({ form, species, photo, points, batchMode, position, onEdit }) {
  const planned = isPlannedTree(form);
  return <section className="tree-entry-review" aria-label="Revisão do cadastro">
    <div className="tree-entry-review-banner"><span><Check size={22} /></span><div><strong>{planned ? 'Seu planejamento está pronto' : 'Tudo pronto para cadastrar'}</strong><p>Confira os dados antes de salvar.</p></div></div>
    <div className="tree-entry-review-card"><header><h3><MapPin size={17} />Localização</h3><Button type="button" variant="ghost" size="sm" onClick={() => onEdit(0)}><Pencil size={14} />Alterar</Button></header>{batchMode ? <ol className="tree-batch-review-addresses">{points.map((point, index) => <li key={point.draftId}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{point.address || 'Endereço não identificado'}</strong><p>{point.neighborhood || 'Bairro não identificado'}</p></div></li>)}</ol> : <><strong>{form.street_name || form.address || 'Localização no mapa'}</strong>{form.street_name && form.address !== form.street_name && <p>{form.address}</p>}<p>{form.neighborhood || 'Bairro não identificado'}</p><small>{position?.latitude.toFixed(6)}, {position?.longitude.toFixed(6)}</small></>}</div>
    <div className="tree-entry-review-card"><header><h3><Leaf size={17} />Dados da árvore</h3><Button type="button" variant="ghost" size="sm" onClick={() => onEdit(1)}><Pencil size={14} />Alterar</Button></header><strong>{species?.common_name || 'Espécie não identificada'}</strong>{species?.scientific_name && <p className="italic">{species.scientific_name}</p>}<dl className="tree-entry-review-facts">{[
      ['Cadastro', planned ? 'Plantio planejado' : 'Árvore existente'],
      ...(form.planting_year ? [['Ano previsto', form.planting_year]] : []),
      ...(!planned ? [['Situação', TREE_STATUS[form.status]?.label]] : []),
      ['Foto', photo || form.photo_url ? 'Adicionada' : 'Sem foto'],
      ...(!planned && form.height_m ? [['Altura', `${form.height_m} m`]] : []),
      ...(!planned && form.dap_cm ? [['DAP', `${form.dap_cm} cm`]] : []),
      ...(form.planted_at ? [['Plantio realizado', form.planted_at.split('-').reverse().join('/')]] : []),
      ...(form.maintenance_action !== 'nenhuma' ? [['Manejo', TREE_ACTIONS[form.maintenance_action]], ['Prazo', form.maintenance_due_at?.split('-').reverse().join('/') || 'Não definido']] : []),
    ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></div>
    <TreeSurveySummary tree={form} />{form.notes && <div className="tree-entry-review-card"><h3>Observações</h3><p className="whitespace-pre-wrap">{form.notes}</p></div>}
  </section>;
}
