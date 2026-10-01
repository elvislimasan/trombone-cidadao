import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

function ConfirmContent({ options, finish }) {
  const { title = 'Confirmar ação?', description, confirmLabel = 'Confirmar', destructive = false } = options;
  return <Dialog open onOpenChange={(open) => { if (!open) finish(false); }}>
    <DialogContent hideClose overlayClassName="!z-[11999]" className="!z-[12000] w-[calc(100vw-2rem)] max-w-md gap-0 overflow-hidden rounded-2xl border-edge-subtle bg-surface-raised p-0 shadow-2xl">
      <div className="h-1 bg-brand" />
      <div className="p-6">
        <div className="mb-5 flex items-center gap-3"><img src="/logo.png" alt="" className="h-11 w-11 rounded-lg object-contain" /><span className="text-xs font-bold uppercase tracking-widest text-brand">Trombone Cidadão</span></div>
        <DialogTitle className="text-xl font-bold text-content-primary">{title}</DialogTitle>
        <DialogDescription className="mt-3 whitespace-pre-line text-sm leading-6 text-content-secondary">{description}</DialogDescription>
        <div className="mt-7 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => finish(false)}>Cancelar</Button><Button type="button" variant={destructive ? 'destructive' : 'default'} onClick={() => finish(true)}>{confirmLabel}</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}

function PromptContent({ options, finish }) {
  const { title = 'Informe o motivo', description, placeholder = '', required = false, confirmLabel = 'Continuar', initialValue = '', label = 'Resposta', readOnly = false } = options;
  const [value, setValue] = useState(initialValue);
  return <Dialog open onOpenChange={(open) => { if (!open) finish(null); }}>
    <DialogContent hideClose overlayClassName="!z-[11999]" className="!z-[12000] w-[calc(100vw-2rem)] max-w-md gap-0 overflow-hidden rounded-2xl border-edge-subtle bg-surface-raised p-0 shadow-2xl">
      <div className="h-1 bg-brand" />
      <form className="p-6" onSubmit={(event) => { event.preventDefault(); if (!required || value.trim()) finish(value.trim()); }}>
        <div className="mb-5 flex items-center gap-3"><img src="/logo.png" alt="" className="h-11 w-11 rounded-lg object-contain" /><span className="text-xs font-bold uppercase tracking-widest text-brand">Trombone Cidadão</span></div>
        <DialogTitle className="text-xl font-bold text-content-primary">{title}</DialogTitle>
        {description && <DialogDescription className="mt-3 text-sm leading-6 text-content-secondary">{description}</DialogDescription>}
        <label className="mt-5 block text-sm font-semibold text-content-primary">{label}<input autoFocus value={value} readOnly={readOnly} onFocus={(event) => { if (readOnly) event.target.select(); }} onChange={(event) => setValue(event.target.value)} placeholder={placeholder} className="mt-2 h-10 w-full rounded-lg border border-edge-default bg-surface-raised px-3 font-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" /></label>
        <div className="mt-7 flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" onClick={() => finish(null)}>Cancelar</Button><Button type="submit" disabled={required && !value.trim()}>{confirmLabel}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}

function NoticeContent({ options, finish }) {
  const { title = 'Aviso', description, confirmLabel = 'Entendi' } = options;
  return <Dialog open onOpenChange={(open) => { if (!open) finish(); }}>
    <DialogContent hideClose overlayClassName="!z-[11999]" className="!z-[12000] w-[calc(100vw-2rem)] max-w-md gap-0 overflow-hidden rounded-2xl border-edge-subtle bg-surface-raised p-0 shadow-2xl">
      <div className="h-1 bg-brand" />
      <div className="p-6">
        <div className="mb-5 flex items-center gap-3"><img src="/logo.png" alt="" className="h-11 w-11 rounded-lg object-contain" /><span className="text-xs font-bold uppercase tracking-widest text-brand">Trombone Cidadão</span></div>
        <DialogTitle className="text-xl font-bold text-content-primary">{title}</DialogTitle>
        <DialogDescription className="mt-3 whitespace-pre-line text-sm leading-6 text-content-secondary">{description}</DialogDescription>
        <div className="mt-7 flex justify-end"><Button type="button" onClick={() => finish()}>{confirmLabel}</Button></div>
      </div>
    </DialogContent>
  </Dialog>;
}

function openAppDialog(Component, options) {
  if (typeof document === 'undefined') return Promise.resolve(null);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
      queueMicrotask(() => { root.unmount(); host.remove(); });
    };
    root.render(<Component options={options} finish={finish} />);
  });
}

export const confirmApp = (options) => openAppDialog(ConfirmContent, typeof options === 'string' ? { description: options } : options);
export const promptApp = (options) => openAppDialog(PromptContent, typeof options === 'string' ? { title: options } : options);
export const alertApp = (options) => openAppDialog(NoticeContent, typeof options === 'string' ? { description: options } : options);
