import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, ChevronRight } from 'lucide-react';

// Uma ação por cartão, compartilhada pelas jornadas públicas e de trabalho.
export default function ActionCard({ to, state, onClick, icon: Icon, title, description, primary = false, variant = 'card' }) {
  const Component = to ? Link : 'button';
  const destination = to ? { to, state } : { type: 'button', onClick };
  if (variant === 'discovery') {
    const Arrow = primary ? ArrowRight : ChevronRight;
    return (
      <Component {...destination} className={`journey-action discovery-action ${primary ? 'discovery-action-featured' : ''}`}>
        {Icon && <span className="discovery-action-icon"><Icon className="h-5 w-5" aria-hidden="true" /></span>}
        <span className="min-w-0 flex-1">
          {primary && <span className="discovery-action-eyebrow">Comece por aqui</span>}
          <span className="discovery-action-title">{title}</span>
          {description && <span className="discovery-action-description">{description}</span>}
        </span>
        <Arrow className="discovery-action-arrow h-5 w-5 shrink-0" aria-hidden="true" />
      </Component>
    );
  }
  return (
    <Component {...destination} className={`journey-action group flex min-h-20 w-full min-w-0 items-center gap-3 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:bg-surface-subtle ${primary ? 'border-brand/25 bg-brand-subtleBg hover:border-brand/50' : 'border-edge-subtle bg-surface-raised hover:border-brand/30 hover:bg-surface-subtle'}`}>
      {Icon && <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${primary ? 'bg-brand text-content-onBrand' : 'bg-surface-subtle text-brand'}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>}
      <span className="min-w-0 flex-1"><span className="block text-sm font-bold leading-5 text-content-primary sm:text-base">{title}</span>{description && <span className="mt-1 block text-sm leading-5 text-content-secondary">{description}</span>}</span>
      <ArrowUpRight className="h-4 w-4 shrink-0 text-content-tertiary transition-colors group-hover:text-brand" aria-hidden="true" />
    </Component>
  );
}
