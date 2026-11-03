import React from 'react';
import { Check, CheckCircle2, Leaf, ShieldCheck } from 'lucide-react';
import TreeProgramPhoto from './TreeProgramPhoto';
import './treeForms.css';

export function TreeFormProgress({ steps, current, onSelect, busy = false, label = 'Etapas do formulário' }) {
  const currentTitle = typeof steps[current] === 'string' ? steps[current] : steps[current].label;
  return <nav className="tree-form-progress" aria-label={label}><div className="tree-form-progress-mobile"><div><strong>{currentTitle}</strong><span>Etapa {current + 1} de {steps.length}</span></div><div className="tree-form-progress-track" aria-hidden="true">{steps.map((_, index) => <span key={index} className={index <= current ? 'is-filled' : ''} />)}</div></div><ol>{steps.map((step, index) => {
    const title = typeof step === 'string' ? step : step.label;
    return <li key={title} className={index < current ? 'is-complete' : ''} aria-current={index === current ? 'step' : undefined}><button type="button" disabled={busy || index > current} onClick={() => onSelect(index)} aria-label={`Etapa ${index + 1} de ${steps.length}: ${title}`}><span className="tree-form-step-number">{index < current ? <Check size={16} aria-hidden="true" /> : index + 1}</span><span>{title}</span></button></li>;
  })}</ol></nav>;
}

export function TreeFormHeading({ title, description, step, total, headingRef, className = '', showStep = true }) {
  return <header className={`tree-form-heading ${className}`}>{showStep && <p className="tree-form-kicker"><Leaf size={14} aria-hidden="true" />Etapa {step + 1} de {total}</p>}<h2 ref={headingRef} tabIndex={-1}>{title}</h2><p>{description}</p></header>;
}

export function TreeFormHelp({ title, items, photo = 'tree' }) {
  return <aside className="tree-form-help" aria-label={title}><TreeProgramPhoto name={photo} alt={photo === 'tree' ? 'Mudas de árvores em uma área arborizada.' : 'Cuidado com uma muda recém-plantada.'} sizes="300px" /><div><p className="tree-form-help-eyebrow"><Leaf size={15} aria-hidden="true" />Um cuidado que continua</p><h2>{title}</h2><ul>{items.map(([label, text]) => <li key={label}><CheckCircle2 size={17} aria-hidden="true" /><span><strong>{label}</strong><small>{text}</small></span></li>)}</ul><p className="tree-form-help-privacy"><ShieldCheck size={17} aria-hidden="true" />Você escolhe quais informações ficam públicas.</p></div></aside>;
}
