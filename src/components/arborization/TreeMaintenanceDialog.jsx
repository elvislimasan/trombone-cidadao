import { isLivingTree } from '@/lib/treePlanning';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Loader2, LocateFixed, MapPin, Scissors, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TREE_ACTIONS, filterTrees } from '@/lib/arborization';
import { treeMaintenancePayload, treeMaintenanceSelection } from '@/lib/treeMaintenance';
import TreeMap from './TreeMap';
import { MAP_LAYER, MapLayerToggle } from '@/components/map/MapDisplayControls';
import './treeEntryRedesign.css';

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
  const mapRef = useRef(null);
  const handleMapReady = useCallback(map => { mapRef.current = map; }, []);
  const [layer, setLayer] = useState(MAP_LAYER.STANDARD);
  const [locating, setLocating] = useState(false);
  useEffect(() => { document.documentElement.classList.add('tree-entry-is-open'); return () => document.documentElement.classList.remove('tree-entry-is-open'); }, []);
  const locate = () => {
    if (!navigator.geolocation) { setError('A localização não está disponível neste dispositivo.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(({ coords }) => { mapRef.current?.setView([coords.latitude, coords.longitude], 17, { animate: false }); setLocating(false); }, () => { setError('Não foi possível obter sua localização.'); setLocating(false); }, { enableHighAccuracy: true, timeout: 10000 });
  };
  const eligible = useMemo(() => trees.filter(tree => String(tree.city_id) === String(cityId) && isLivingTree(tree)), [trees, cityId]);
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
    <DialogContent hideClose data-testid="tree-maintenance-dialog" className="tree-entry-dialog tree-entry-redesign tree-maintenance-dialog flex flex-col gap-0 overflow-hidden p-0" overlayClassName="tree-entry-overlay" onInteractOutside={event => event.preventDefault()}>
      <DialogHeader className="tree-entry-header">
        <div className="tree-entry-heading"><span className="tree-entry-brand-icon"><Scissors size={22} /></span><div><DialogTitle>Programar manejo em lote</DialogTitle><DialogDescription>{city?.name} · Cuidados com as árvores</DialogDescription></div></div>
        <Button type="button" size="icon" variant="ghost" aria-label="Fechar manejo" disabled={saving} onClick={requestClose}><X size={20} /></Button>
      </DialogHeader>
      <nav className="tree-maintenance-progress" aria-label="Etapas do manejo"><span aria-current={!reviewing ? 'step' : undefined}><b>{reviewing ? <Check size={14} /> : '1'}</b>Selecionar e definir</span><i /><span aria-current={reviewing ? 'step' : undefined}><b>2</b>Revisar e programar</span></nav>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="tree-entry-main min-h-0 flex-1"><div className="tree-entry-layout">
          <section className="tree-entry-location min-w-0" aria-label="Selecionar árvores para manejo">
            <div className="tree-entry-map-heading"><div><MapPin size={18} /><h3>{reviewing ? 'Árvores selecionadas' : 'Selecione no mapa'}</h3></div><div className="tree-entry-map-actions"><Button type="button" variant="outline" size="sm" disabled={saving || locating} onClick={locate}>{locating ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} />}Usar GPS</Button><MapLayerToggle layer={layer} onLayerChange={setLayer} showLabel /></div></div>
            {!reviewing && <label className="tree-maintenance-search"><span className="sr-only">Buscar árvores</span><Input placeholder="Buscar por código, espécie, rua ou bairro" disabled={saving || confirmDiscard} value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => event.key === 'Enter' && event.preventDefault()} /></label>}
            <div className="tree-entry-map relative isolate overflow-hidden rounded-xl border"><TreeMap trees={reviewing ? selected : filtered} city={city} initialView={initialMapView} selectedIds={selectedIds} externalControls layer={layer} onLayerChange={setLayer} onMapReady={handleMapReady} onSelect={reviewing || confirmDiscard || saving ? undefined : toggle} /></div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="tree-entry-map-instruction">{reviewing ? 'Confira os pontos antes de programar.' : 'Toque na árvore para selecionar ou desmarcar. Selecionadas ficam azuis.'}</p>
              {!reviewing && selectedIds.length > 0 && <Button type="button" size="sm" variant="ghost" disabled={saving || confirmDiscard} onClick={() => setSelectedIds([])}>Limpar seleção</Button>}
            </div>
          </section>
          <div className="tree-entry-fields tree-maintenance-fields min-w-0 space-y-4">
            {reviewing ? <section className="space-y-4" data-testid="tree-maintenance-review">
              <h2 className="text-lg font-semibold">Revise a programação</h2>
              <div className="space-y-1 rounded-xl border bg-surface-subtle p-4"><p className="font-semibold">{TREE_ACTIONS[action]}</p><p className="text-sm text-muted-foreground">{dateLabel(dueAt)}</p><p className="text-sm">Aplicar em {selected.length} {selected.length === 1 ? 'árvore' : 'árvores'}.</p></div>
              <p className="text-xs text-muted-foreground">Este agendamento indica o manejo necessário. A realização do serviço é registrada na linha do tempo da árvore.</p>
            </section> : <>
              <section className="tree-maintenance-intro"><span className="tree-entry-section-icon"><Scissors size={19} /></span><h2>Defina o cuidado</h2><p>Escolha a ação e o prazo para as árvores selecionadas no mapa.</p></section>
              <div className="tree-maintenance-results" role="status">
                <p>{filtered.length} {filtered.length === 1 ? 'árvore disponível na busca' : 'árvores disponíveis na busca'}</p>
                {!filtered.length && <p role="status" className="text-sm text-muted-foreground">Nenhuma árvore encontrada. Ajuste a busca.</p>}
              </div>
              <fieldset disabled={saving || confirmDiscard} className="tree-maintenance-action-fields">
                <label className="grid gap-1.5 text-sm font-medium">Manejo necessário<select className={selectClass} value={action} onChange={event => setAction(event.target.value)}><option value="">Selecione o manejo</option>{Object.entries(TREE_ACTIONS).filter(([key]) => key !== 'nenhuma').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label className="grid gap-1.5 text-sm font-medium">Prazo do manejo<Input type="date" value={dueAt} onChange={event => setDueAt(event.target.value)} /></label>
                <p className="text-xs text-muted-foreground">O mesmo manejo e prazo serão aplicados às árvores selecionadas. O prazo é opcional.</p>
              </fieldset>
            </>}
            {pendingCount > 0 && <p className="rounded-xl border border-amber-500/30 bg-amber-50 p-3 text-xs leading-relaxed text-amber-950 dark:bg-amber-950/30 dark:text-amber-200">{pendingCount} {pendingCount === 1 ? 'árvore já tem manejo pendente' : 'árvores já têm manejo pendente'}. Ao salvar, o manejo e o prazo dessas árvores serão substituídos.</p>}
          </div>
        </div></div>
        <footer className="tree-entry-footer" data-testid="tree-maintenance-footer">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="tree-entry-footer-actions"><p><Check size={15} />{selected.length} {selected.length === 1 ? 'árvore selecionada' : 'árvores selecionadas'}</p><div>{reviewing ? <Button type="button" variant="outline" disabled={saving} onClick={() => { setReviewing(false); setError(''); }}>Voltar à seleção</Button> : <Button type="button" variant="outline" disabled={saving} onClick={requestClose}>Cancelar</Button>}<Button className="tree-entry-primary" type="submit" disabled={!selected.length || !action || saving}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{saving ? 'Salvando manejo…' : reviewing ? `Salvar manejo (${selected.length})` : 'Revisar manejo'}</Button></div></div>
        </footer>
      </form>
      <Dialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <DialogContent hideClose role="alertdialog" data-testid="tree-maintenance-discard" className="tree-entry-discard-dialog" overlayClassName="tree-entry-discard-overlay" onInteractOutside={event => event.preventDefault()} onEscapeKeyDown={event => event.stopPropagation()} onOpenAutoFocus={event => { event.preventDefault(); continueButtonRef.current?.focus(); }}>
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
