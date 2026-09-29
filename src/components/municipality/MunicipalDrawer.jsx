import React, { useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ClipboardList, MessageSquare, X } from 'lucide-react';

export default function MunicipalDrawer({ open, onClose, title, description, children, navigation, activeSection, externalPreviewOpen = false, headerAction, footer, busy = false, variant = 'default' }) {
  const isDemand = variant === 'demand';
  const isReport = variant === 'report';
  const isMunicipalDetail = isDemand || isReport;
  const bodyRef = useRef(null);
  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [activeSection, open]);
  return <DialogPrimitive.Root modal={!externalPreviewOpen} open={open} onOpenChange={(value) => { if (!value && !busy && !externalPreviewOpen) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/45 backdrop-blur-[2px]" />
      <DialogPrimitive.Content onEscapeKeyDown={(event) => { if (externalPreviewOpen) event.preventDefault(); }} onInteractOutside={(event) => { if (externalPreviewOpen) event.preventDefault(); }} className={'fixed inset-y-0 right-0 z-[10000] flex h-[100dvh] w-full max-w-none flex-col border-l border-edge-subtle bg-surface-raised text-content-primary shadow-2xl focus:outline-none ' + (isReport ? 'overflow-visible ' : 'overflow-hidden ') + (isMunicipalDetail ? 'sm:w-[min(88vw,46rem)] 2xl:w-[min(62vw,52rem)]' : 'sm:w-[min(90vw,48rem)] 2xl:w-[min(72vw,64rem)]')}>
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-1 bg-brand" />
        <header className={'relative shrink-0 border-b border-edge-subtle bg-surface-raised px-5 pb-5 pr-14 pt-7 sm:px-8 sm:pb-6 sm:pt-8 ' + (isReport ? 'sm:pr-8' : 'sm:pr-16')}>
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="mb-3 flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand">{isDemand ? <ClipboardList className="h-4 w-4" /> : isReport ? <MessageSquare className="h-4 w-4" /> : null}{isDemand ? 'Ordem de serviço' : isReport ? 'Bronca da cidade' : 'Gestão municipal'}</p>
              <DialogPrimitive.Title className="break-words font-display text-xl font-black tracking-tight sm:text-2xl">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-content-secondary">{description}</DialogPrimitive.Description>
            </div>
            {headerAction && <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">{headerAction}</div>}
          </div>
        </header>
        <DialogPrimitive.Close disabled={busy} className={isReport ? 'absolute right-4 top-6 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-secondary shadow-lg transition-colors hover:border-edge-default hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 sm:-left-6 sm:right-auto sm:top-1/2 sm:h-12 sm:w-12 sm:-translate-y-1/2' : 'absolute right-4 top-6 z-20 rounded-xl border border-edge-subtle bg-surface-subtle p-2 text-content-secondary transition-colors hover:border-edge-default hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 sm:right-6 sm:top-7'} aria-label="Fechar painel"><X className={isReport ? 'h-5 w-5' : 'h-4 w-4'} /></DialogPrimitive.Close>
        {navigation && <div className="shrink-0 border-b border-edge-subtle bg-surface-raised px-5 py-3 sm:px-6">{navigation}</div>}
        <div ref={bodyRef} className={'min-h-0 min-w-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-8 sm:py-6 ' + (isMunicipalDetail ? 'bg-surface-base' : 'bg-surface-raised')}>{children}</div>
        {!isReport && footer && <footer className="shrink-0 border-t border-edge-subtle bg-surface-raised px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-8px_24px_rgb(0_0_0_/_0.04)] sm:px-8">{footer}</footer>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
