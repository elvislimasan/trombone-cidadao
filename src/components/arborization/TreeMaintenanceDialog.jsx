import React, { useMemo, useRef, useState } from 'react';
import { Check, Loader2, Minimize2, Scissors } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TREE_ACTIONS, filterTrees } from '@/lib/arborization';
import { treeMaintenancePayload, treeMaintenanceSelection } from '@/lib/treeMaintenance';
import TreeMap from './TreeMap';

const selectClass = 'h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm';
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Sem prazo definido';

export default function TreeMaintenanceDialog({ trees, city, cityId, initialMapView, onSave, onClose }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const continueButtonRef = useRef(null);
  const [error, setError] = useState('');
  const eligible = useMemo(() => trees.filter(tree => String(tree.city_id) === String(cityId) && tree.status !== 'removida'), [trees, cityId]);
  const filtered = useMemo(() => filterTrees(eligible, { search }), [eligible, search]);
  const selected = useMemo(() => eligible.filter(tree => selectedIds.includes(tree.id)), [eligible, selectedIds]);
  const pendingCount = selected.filter(tree => tree.maintenance_action && tree.maintenance_action !== 'nenhuma').length;
  const toggle = tree => {
    if (savingRef.current || reviewing || confirmDiscard) return;
    setError('');
    setSelectedIds(current => current.includes(tree.id) ? current.filter(id => id !== tree.id) : [...current, tree.id]);
  };
  const requestClose = () => {
    if (savingRef.current) return;
    setError('');
    if (selectedIds.length || action || dueAt) setConfirmDiscard(true);
    else onClose();
  };
  const submit = async event => {
    event.preventDefault(); event.stopPropagation();
    if (savingRef.current || confirmDiscard) return;
    setError('');
    try {
      const ids = treeMaintenanceSelection(trees, selectedIds, cityId);
      const payload = treeMaintenancePayload(action, dueAt);
      if (!reviewing) { setReviewing(true); return; }
      savingRef.current = true; setSaving(true);
      await onSave(ids, payload);
      onClose();
    } catch (err) { setError(err.message || 'Não foi possível programar o manejo. A seleção foi mantida.'); }
    finally { savingRef.current = false; setSaving(false); }
  };

  return <Dialog open onOpenChange={open => { if (!open) requestClose(); }}>
    <DialogContent hideClose data-testid="tree-maintenance-dialog" className="!inset-0 !h-[100dvh] !w-full !max-w-none !translate-x-0 !translate-y-0 !rounded-none flex flex-col gap-0 overflow-hidden border-0 p-0" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="shrink-0 border-b px-4 py-3 text-left sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><DialogTitle className="flex items-center gap-2 text-base"><Scissors className="h-5 w-5 text-emerald-700" />Programar manejo em lote</DialogTitle><Button type="button" size="sm" variant="outline" disabled={saving} onClick={requestClose}><Minimize2 className="mr-2 h-4 w-4" />Sair da tela cheia</Button></div>
        <DialogDescription>{city?.name} · Selecione árvores cadastradas e programe o cuidado necessário.</DialogDescription>
      </DialogHeader>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="tree-entry-main min-h-0 flex-1"><div className="tree-entry-layout">
          <section className="tree-entry-location min-w-0" aria-label="Selecionar árvores para manejo">
            <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="tree-entry-step">1</span>Selecione as árvores</h2>
            <p className="text-xs text-muted-foreground">Clique em cada árvore no mapa. As selecionadas ficam azuis com uma marca de confirmação.</p>
            <div className="tree-entry-map relative isolate overflow-hidden rounded-xl border"><TreeMap trees={reviewing ? selected : filtered} city={city} initialView={initialMapView} selectedIds={selectedIds} onSelect={reviewing || confirmDiscard || saving ? undefined : toggle} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><Check className="h-4 w-4 text-blue-600" />{selected.length} {selected.length === 1 ? 'árvore selecionada' : 'árvores selecionadas'}{!reviewing && ` · ${filtered.length} no resultado da busca`}</p>
              {!reviewing && selectedIds.length > 0 && <Button type="button" size="sm" variant="ghost" disabled={saving || confirmDiscard} onClick={() => setSelectedIds([])}>Limpar seleção</Button>}
            </div>
          </section>
          <div className="tree-entry-fields min-w-0 space-y-4">
            {reviewing ? <section className="space-y-4" data-testid="tree-maintenance-review">
              <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="tree-entry-step">2</span>Revise a programação</h2>
              <div className="space-y-1 rounded-xl border bg-surface-subtle p-4"><p className="font-semibold">{TREE_ACTIONS[action]}</p><p className="text-sm text-muted-foreground">{dateLabel(dueAt)}</p><p className="text-sm">Aplicar em {selected.length} {selected.length === 1 ? 'árvore' : 'árvores'}.</p></div>
              <p className="text-xs text-muted-foreground">Este agendamento indica o manejo necessário. A realização do serviço é registrada na linha do tempo da árvore.</p>
            </section> : <>
              <fieldset disabled={saving || confirmDiscard} className="space-y-3">
                <label className="grid gap-1.5 text-sm font-medium">Buscar árvores<Input placeholder="Código, espécie, rua ou bairro" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && event.preventDefault()} /></label>
                <p className="text-xs text-muted-foreground">Busque para filtrar os pontos e clique nas árvores no mapa para selecionar ou desmarcar.</p>
                {!filtered.length && <p role="status" className="text-sm text-muted-foreground">Nenhuma árvore encontrada. Ajuste a busca.</p>}
              </fieldset>
              <fieldset disabled={saving || confirmDiscard} className="space-y-3 border-t pt-4">
                <h2 className="flex items-center gap-2 text-sm font-semibold"><span className="tree-entry-step">2</span>Defina o manejo</h2>
                <label className="grid gap-1.5 text-sm font-medium">Manejo necessário<select className={selectClass} value={action} onChange={event => setAction(event.target.value)}><option value="">Selecione o manejo</option>{Object.entries(TREE_ACTIONS).filter(([key]) => key !== 'nenhuma').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label className="grid gap-1.5 text-sm font-medium">Prazo do manejo<Input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
                <p className="text-xs text-muted-foreground">O mesmo manejo e prazo serão aplicados às árvores selecionadas. O prazo é opcional.</p>
              </fieldset>
            </>}
            {pendingCount > 0 && <p className="rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:bg-amber-950/30 dark:text-amber-200">{pendingCount} {pendingCount === 1 ? 'árvore já tem manejo pendente' : 'árvores já têm manejo pendente'}. Ao salvar, o manejo e o prazo dessas árvores serão substituídos.</p>}
          </div>
        </div></div>
        <footer className="shrink-0 space-y-2 border-t bg-surface-raised px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6" data-testid="tree-maintenance-footer">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{selected.length} {selected.length === 1 ? 'árvore selecionada' : 'árvores selecionadas'}</p><div className="ml-auto flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={saving} onClick={requestClose}>Cancelar</Button>{reviewing && <Button type="button" variant="outline" disabled={saving} onClick={() => { setReviewing(false); setError(''); }}>Voltar à seleção</Button>}<Button type="submit" disabled={!selected.length || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? 'Salvando manejo…' : reviewing ? `Salvar manejo (${selected.length})` : 'Revisar manejo'}</Button></div></div>
        </footer>
      </form>
      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent hideClose role="alertdialog" data-testid="tree-maintenance-discard" className="z-[10020] w-[calc(100%_-_2rem)] rounded-xl" overlayClassName="z-[10010]" onInteractOutside={event => event.preventDefault()} onOpenAutoFocus={event => { event.preventDefault(); continueButtonRef.current?.focus(); }}>
          <DialogHeader className="text-left">
            <DialogTitle>Descartar alterações?</DialogTitle>
            <DialogDescription>A seleção de árvores, o manejo e o prazo informados ainda não foram salvos. Se sair agora, essas alterações serão descartadas.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={continueButtonRef} type="button" variant="outline" onClick={() => setConfirmDiscard(false)}>Continuar programação</Button>
            <Button type="button" variant="destructive" onClick={onClose}>Descartar alterações</Button>
          </div>
        </DialogContent>
      </Dialog>
    </DialogContent>
  </Dialog>;
}
