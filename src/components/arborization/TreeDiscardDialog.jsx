import React from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export default function TreeDiscardDialog({ open, onOpenChange, onDiscard, pointsCount = 0 }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent hideClose role="alertdialog" className="tree-entry-discard-dialog" overlayClassName="tree-entry-discard-overlay"
      onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.stopPropagation()}>
      <DialogHeader><DialogTitle>Descartar alterações?</DialogTitle><DialogDescription>{pointsCount ? `Os ${pointsCount} pontos selecionados e os dados deste lote ainda não foram salvos.` : 'Os dados preenchidos ainda não foram salvos.'} Ao sair, essas informações serão perdidas.</DialogDescription></DialogHeader>
      <div className="tree-entry-discard-actions"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Continuar cadastro</Button><Button type="button" variant="destructive" onClick={onDiscard}>{pointsCount ? 'Descartar pontos' : 'Descartar alterações'}</Button></div>
    </DialogContent>
  </Dialog>;
}
