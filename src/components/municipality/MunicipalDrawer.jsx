import React, { useEffect, useRef } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { ClipboardList, MessageSquare, X } from 'lucide-react';

export default function MunicipalDrawer({ open, onClose, title, description, children, navigation, activeSection, externalPreviewOpen = false, headerAction, footer, busy = false, variant = 'default', placement = 'side', bodyScroll = true, inline = false }) {
  const isDemand = variant === 'demand';
  const isReport = variant === 'report';
  const isLighting = variant === 'lighting';
  const isPoleDetails = variant === 'poleDetails';
  const isMunicipalDetail = isDemand || isReport || isLighting;
  const bodyRef = useRef(null);
  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [activeSection, open]);
  const panel = <>
        <div aria-hidden="true" className="absolute inset-x-0 top-0 z-10 h-1 bg-brand" />
        <header className={'relative shrink-0 border-b border-edge-subtle bg-surface-raised ' + (inline ? 'px-4 pb-4 pr-14 pt-5 sm:px-6 sm:pr-16' : placement === 'center' ? 'px-4 pb-3 pr-14 pt-4 sm:px-6 sm:pb-4 sm:pr-16 sm:pt-5' : isPoleDetails ? 'px-4 py-4 pr-14 sm:px-5 sm:pr-14' : 'px-5 pb-5 pr-14 pt-7 sm:px-8 sm:pb-6 sm:pt-8 ' + (isReport ? 'sm:pr-8' : 'sm:pr-16'))}>
          <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              {!isPoleDetails && <p className={(inline || placement === 'center' ? 'mb-1.5 ' : 'mb-3 ') + 'flex items-center gap-2 text-[10px] font-extrabold uppercase tracking-[0.17em] text-brand'}>{isDemand ? <ClipboardList className="h-4 w-4" /> : isReport ? <MessageSquare className="h-4 w-4" /> : null}{isDemand ? 'Ordem de serviço' : isReport ? 'Solicitação da cidade' : isLighting ? 'Iluminação pública' : 'Gestão municipal'}</p>}
              {inline ? <h1 className="break-words font-display text-xl font-black tracking-tight sm:text-2xl">{title}</h1> : <DialogPrimitive.Title className="break-words font-display text-xl font-black tracking-tight sm:text-2xl">{title}</DialogPrimitive.Title>}
              {inline ? <p className="mt-1 break-words text-xs leading-5 text-content-secondary sm:text-sm">{description}</p> : <DialogPrimitive.Description className={placement === 'center' ? 'sr-only' : isPoleDetails ? 'mt-1 break-words text-sm text-content-secondary' : 'mt-2 text-sm leading-6 text-content-secondary'}>{description}</DialogPrimitive.Description>}
            </div>
            {headerAction && <div className="flex min-w-0 shrink-0 flex-wrap items-center gap-2">{headerAction}</div>}
          </div>
        </header>
        {inline ? <button type="button" onClick={onClose} disabled={busy} className="absolute right-4 top-6 z-20 rounded-xl border border-edge-subtle bg-surface-subtle p-2 text-content-secondary transition-colors hover:border-edge-default hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 sm:right-6 sm:top-7" aria-label="Fechar formulário"><X className="h-4 w-4" /></button> : <DialogPrimitive.Close disabled={busy} className={isReport ? 'absolute right-4 top-6 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-edge-subtle bg-surface-raised text-content-secondary shadow-lg transition-colors hover:border-edge-default hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 sm:-left-6 sm:right-auto sm:top-1/2 sm:h-12 sm:w-12 sm:-translate-y-1/2' : 'absolute right-4 top-6 z-20 rounded-xl border border-edge-subtle bg-surface-subtle p-2 text-content-secondary transition-colors hover:border-edge-default hover:text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50 sm:right-6 sm:top-7'} aria-label={placement === 'center' ? 'Fechar modal' : 'Fechar painel'}><X className={isReport ? 'h-5 w-5' : 'h-4 w-4'} /></DialogPrimitive.Close>}
        {navigation && <div className={'shrink-0 border-b border-edge-subtle bg-surface-raised ' + (inline || placement === 'center' ? 'px-4 py-2 sm:px-6' : 'px-5 py-3 sm:px-6')}>{navigation}</div>}
        <div ref={bodyRef} className={'min-h-0 min-w-0 flex-1 ' + (bodyScroll ? 'overflow-y-auto overscroll-contain ' : 'overflow-hidden ') + (inline ? 'bg-surface-raised px-4 py-3 sm:px-6 ' : !bodyScroll ? 'bg-surface-base px-4 py-3 sm:px-6 sm:py-4 ' : (isPoleDetails ? 'px-4 py-3 sm:px-5 sm:py-4 ' : 'px-5 py-5 sm:px-8 sm:py-6 ') + (isMunicipalDetail ? 'bg-surface-base' : 'bg-surface-raised'))}>{children}</div>
        {!isReport && footer && <footer className={'shrink-0 border-t border-edge-subtle bg-surface-raised shadow-[0_-8px_24px_rgb(0_0_0_/_0.04)] ' + (inline || placement === 'center' ? 'px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6' : 'px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 sm:px-8')}>{footer}</footer>}
  </>;
  if (inline) return open ? <section className="relative flex h-full min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised text-content-primary shadow-sm">{panel}</section> : null;
  return <DialogPrimitive.Root modal={!externalPreviewOpen} open={open} onOpenChange={(value) => { if (!value && !busy && !externalPreviewOpen) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/45 backdrop-blur-[2px]" />
      <DialogPrimitive.Content onEscapeKeyDown={(event) => { if (externalPreviewOpen) event.preventDefault(); }} onInteractOutside={(event) => { if (externalPreviewOpen) event.preventDefault(); }} className={placement === 'center'
        ? 'fixed inset-x-0 bottom-0 z-[10000] flex h-[100dvh] w-full flex-col overflow-hidden border border-edge-subtle bg-surface-raised text-content-primary shadow-2xl focus:outline-none sm:left-1/2 sm:top-1/2 sm:bottom-auto sm:h-[min(90dvh,48rem)] sm:w-[calc(100%-2rem)] sm:max-w-3xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl'
        : 'fixed inset-y-0 right-0 z-[10000] flex h-[100dvh] w-full max-w-none flex-col border-l border-edge-subtle bg-surface-raised text-content-primary shadow-2xl focus:outline-none ' + (isReport ? 'overflow-visible ' : 'overflow-hidden ') + (isDemand ? 'sm:w-[min(92vw,64rem)]' : isReport ? 'sm:w-[min(88vw,46rem)] 2xl:w-[min(62vw,52rem)]' : isLighting ? 'sm:w-[min(90vw,52rem)] 2xl:w-[min(72vw,64rem)]' : isPoleDetails ? 'sm:w-[min(92vw,36rem)]' : 'sm:w-[min(90vw,48rem)] 2xl:w-[min(72vw,64rem)]')}>
        {panel}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
