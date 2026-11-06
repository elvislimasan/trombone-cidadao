import React, { useEffect, useState } from 'react';
import { ArrowRight, ChevronDown, Inbox } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function MunicipalPageHeader({ eyebrow, title, description, action, children, className = '' }) {
  return <header className={`municipal-page-header ${className}`}>
    <div className="min-w-0">
      {eyebrow && <p className="municipal-page-eyebrow text-xs font-bold uppercase tracking-[0.16em] text-brand">{eyebrow}</p>}
      <h1 className="mt-1 font-display text-2xl font-black tracking-tight sm:text-3xl">{title}</h1>
      {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-content-secondary">{description}</p>}
    </div>
    {(action || children) && <div className="municipal-page-actions">{children}{action}</div>}
  </header>;
}

// These are filters over one list, rather than tabs with independent panels.
export function MunicipalStageFilter({ stages, value, counts, onChange, loading = false }) {
  return <label className="municipal-stage-select">
    <span>Etapa</span>
    <select aria-label="Etapa das minhas ordens" value={value} onChange={event => onChange(event.target.value)}>
      {stages.map(([id, label]) => <option key={id} value={id}>{label}{!loading && counts?.[id] != null ? ` (${counts[id].toLocaleString('pt-BR')})` : ''}</option>)}
    </select>
  </label>;
}

// One copy of the content: expanded on desktop, optional on small screens.
export function MunicipalMobileDisclosure({ title, hint, children, className = '' }) {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia('(min-width: 640px)').matches);
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const changed = () => setWide(media.matches);
    changed();
    media.addEventListener('change', changed);
    return () => media.removeEventListener('change', changed);
  }, []);
  return <details className={`municipal-mobile-disclosure ${className}`} open={wide || expanded} data-municipal-disclosure onToggle={event => { if (!wide) setExpanded(event.currentTarget.open); }}>
    <summary><span className="min-w-0"><strong>{title}</strong>{hint && <small>{hint}</small>}</span><ChevronDown className="h-4 w-4 shrink-0" aria-hidden="true" /></summary>
    <div className="municipal-disclosure-content">{children}</div>
  </details>;
}

export function MunicipalMetricCard({ label, value, icon: Icon, tone = 'default', to, hint }) {
  const toneClass = tone === 'alert' ? 'bg-danger-subtleBg text-danger-subtleFg' : tone === 'success' ? 'bg-success-bg text-success-fg' : 'bg-brand-subtleBg text-brand';
  const content = <>
    <div className="flex items-start justify-between gap-3">
      <p className="text-sm font-semibold text-content-secondary">{label}</p>
      {Icon && <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${toneClass}`}><Icon className="h-4 w-4" /></span>}
    </div>
    <p className="mt-3 font-display text-3xl font-black tabular-nums text-content-primary">{value ?? '—'}</p>
    {hint && <p className="mt-1 text-xs text-content-tertiary">{hint}</p>}
    {to && <ArrowRight className="absolute bottom-4 right-4 h-4 w-4 text-content-tertiary transition-transform group-hover:translate-x-1 group-hover:text-brand" />}
  </>;
  const className = 'group relative block min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised p-4 shadow-sm transition-colors hover:border-brand/30 sm:p-5';
  return to ? <Link to={to} className={className}>{content}<span className="sr-only">Ver {label.toLowerCase()}</span></Link> : <div className={className}>{content}</div>;
}

export function MunicipalEmptyState({ title, description, action }) {
  return <div className="flex min-h-48 flex-col items-center justify-center px-5 py-10 text-center">
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-subtle text-content-tertiary"><Inbox className="h-6 w-6" /></span>
    <h3 className="mt-3 text-base font-bold">{title}</h3>
    {description && <p className="mt-1 max-w-md text-sm leading-6 text-content-secondary">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>;
}

export function MunicipalPagination({ page, total, pageSize, onPageChange }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return <nav aria-label="Paginação" className="flex flex-wrap items-center justify-between gap-3 border-t border-edge-subtle px-4 py-3 text-sm text-content-secondary sm:px-5">
    <span>Página {page} de {pages} · {total.toLocaleString('pt-BR')} registros</span>
    <div className="flex gap-2">
      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</Button>
      <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPageChange(page + 1)}>Próxima</Button>
    </div>
  </nav>;
}
