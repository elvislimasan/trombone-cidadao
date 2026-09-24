import React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

export default function MunicipalDrawer({ open, onClose, title, description, children, footer, busy = false }) {
  return <DialogPrimitive.Root open={open} onOpenChange={(value) => { if (!value && !busy) onClose(); }}>
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-[9999] bg-black/50" />
      <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-[10000] flex h-[100dvh] w-full max-w-xl flex-col border-l border-edge-subtle bg-surface-raised text-content-primary shadow-2xl focus:outline-none">
        <header className="shrink-0 border-b border-edge-subtle px-5 py-5 pr-14 sm:px-6 sm:pr-14">
          <p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-brand">Trombone · Gestão municipal</p>
          <DialogPrimitive.Title className="break-words text-xl font-black">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-sm leading-6 text-content-secondary">{description}</DialogPrimitive.Description>
          <DialogPrimitive.Close disabled={busy} className="absolute right-4 top-5 rounded-lg p-2 text-content-secondary hover:bg-surface-subtle focus-visible:ring-2 focus-visible:ring-brand disabled:opacity-50" aria-label="Fechar painel"><X className="h-5 w-5" /></DialogPrimitive.Close>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6">{children}</div>
        {footer && <footer className="shrink-0 border-t border-edge-subtle bg-surface-raised px-5 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6">{footer}</footer>}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  </DialogPrimitive.Root>;
}
