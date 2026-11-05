import React from 'react';
import { ChevronDown } from 'lucide-react';

export default function DisclosureSection({ title, description, children, className = '' }) {
  return <details className={`group min-w-0 rounded-2xl border border-edge-subtle bg-surface-raised ${className}`} data-journey-disclosure>
    <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-4 text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand sm:p-5 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0"><span className="block text-base font-bold">{title}</span>{description && <span className="mt-1 block text-sm font-normal leading-5 text-content-secondary">{description}</span>}</span>
      <ChevronDown className="h-5 w-5 shrink-0 text-content-tertiary transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" />
    </summary>
    <div className="min-w-0 border-t border-edge-subtle p-3 sm:p-5">{children}</div>
  </details>;
}
