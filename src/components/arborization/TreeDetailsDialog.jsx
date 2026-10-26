import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronDown, Clock3, Leaf, MapPin, Ruler, Scissors, Sprout, Trash2, Trees, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogDescription, DialogTitle, FormDialogContent } from '@/components/ui/dialog';
import { TREE_ACTIONS, TREE_ORIGINS, TREE_STATUS, treeLabel } from '@/lib/arborization';
import TreePhoto from './TreePhoto';

const STATUS_STYLE = {
  saudavel: 'bg-success-bg text-success-fg',
  atencao: 'bg-status-pendingBg text-status-pendingFg',
  risco: 'bg-danger-subtleBg text-danger-subtleFg',
  removida: 'bg-surface-subtle text-content-secondary',
};
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR') : 'Não informado';

export default function TreeDetailsDialog({ tree, canManage, onClose, onEdit, onDelete, children }) {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => { setExpanded(false); }, [tree?.id]);
  if (!tree) return null;
  const status = TREE_STATUS[tree.status];
  const neighborhoodInAddress = Boolean(tree.neighborhood && String(tree.address || '').split(/\s+[-–—]\s+|[,;]/)
    .some(part => part.trim().toLocaleLowerCase('pt-BR') === tree.neighborhood.trim().toLocaleLowerCase('pt-BR')));
  const updatedAt = tree.updated_at ? new Date(tree.updated_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : 'Não informada';
  const coordinates = tree.latitude != null && tree.longitude != null && Number.isFinite(Number(tree.latitude)) && Number.isFinite(Number(tree.longitude))
    ? `${Number(tree.latitude).toFixed(6)}, ${Number(tree.longitude).toFixed(6)}` : 'Não informadas';

  return <Dialog open onOpenChange={open => { if (!open) onClose?.(); }}>
    <FormDialogContent hideClose aria-label="Árvore selecionada" data-testid="tree-details-dialog"
      className={`tree-details-sheet ${expanded ? 'is-expanded' : ''} max-h-[90dvh] gap-0 overflow-x-hidden overflow-y-auto rounded-2xl border-edge-subtle bg-surface-raised p-0`}>
      <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-muted-foreground/30 md:hidden" />
      <Button type="button" variant="ghost" size="icon" className="absolute right-2 top-2 h-11 w-11" aria-label="Voltar ao mapa" onClick={onClose}><X className="h-5 w-5" /></Button>
      <div className="p-5 sm:p-6">
        <div className="border-b border-edge-subtle pb-4">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold"><MapPin className="h-4 w-4 text-brand" />Árvore selecionada</DialogTitle>
          <DialogDescription className="sr-only">Identificação, localização, condições e manejo da árvore selecionada no mapa.</DialogDescription>
        </div>

        <div className="mt-4 flex min-w-0 items-start gap-3">
          <TreePhoto tree={tree} className="w-24 shrink-0" imageClassName="h-20 w-24 rounded-xl bg-surface-subtle object-contain" captionClassName="mt-1 text-[10px] leading-relaxed text-content-secondary"
            fallback={<div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl border border-success-fg/20 bg-gradient-to-br from-success-bg to-surface-raised"><Trees className="h-7 w-7 text-success-fg" /></div>} />
          <div className="min-w-0 flex-1">
            <h3 className="break-words text-base font-bold leading-6">{treeLabel(tree)}</h3>
            {tree.scientific_name && <p className="mt-0.5 break-words text-xs italic text-content-secondary">{tree.scientific_name}</p>}
            <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ${STATUS_STYLE[tree.status] || STATUS_STYLE.removida}`}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: status?.color }} />{status?.label}</span>
            <p className="mt-2 break-words text-sm leading-5 text-content-secondary">{tree.address || 'Endereço não informado'}</p>
            {tree.neighborhood && !neighborhoodInAddress && <p className="mt-0.5 break-words text-xs text-content-secondary">Bairro: {tree.neighborhood}</p>}
          </div>
        </div>

        <Button type="button" variant="ghost" className="mt-3 min-h-11 w-full justify-between md:hidden" aria-expanded={expanded} aria-controls="tree-details-secondary" onClick={() => setExpanded(current => !current)}>{expanded ? 'Recolher informações' : 'Ver mais informações'}<ChevronDown className={`h-4 w-4 ${expanded ? 'rotate-180' : ''}`} /></Button>
        <div id="tree-details-secondary" className="tree-details-secondary">
        <dl className="mt-5 grid grid-cols-1 gap-x-4 gap-y-3 border-t border-edge-subtle pt-4 min-[420px]:grid-cols-2">
          {[
            ['Origem', Leaf, TREE_ORIGINS[tree.origin] || 'Não informada'],
            ['Altura / copa', Ruler, `${tree.height_m ?? '—'} m / ${tree.crown_diameter_m ?? '—'} m`],
            ['Data do plantio', Sprout, dateLabel(tree.planted_at)],
            ['Manejo necessário', Scissors, TREE_ACTIONS[tree.maintenance_action] || 'Não informado'],
            ['Prazo do manejo', CalendarDays, dateLabel(tree.maintenance_due_at)],
            ['Última atualização', Clock3, updatedAt],
            ['Cadastro na plataforma', CalendarDays, tree.created_at ? new Date(tree.created_at).toLocaleDateString('pt-BR') : 'Não informado'],
          ].map(([label, Icon, value]) => <div key={label} className="flex min-w-0 items-start gap-2"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" /><div className="min-w-0"><dt className="text-[11px] leading-4 text-content-secondary">{label}</dt><dd className="mt-0.5 break-words text-sm font-medium leading-5">{value}</dd></div></div>)}
        </dl>

        <div className="mt-4 flex min-w-0 items-start gap-2 rounded-xl border border-edge-subtle bg-surface-subtle p-3"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-content-secondary" /><div className="min-w-0"><p className="text-[11px] leading-4 text-content-secondary">Coordenadas:</p><p className="mt-0.5 break-words text-sm font-medium leading-5">{coordinates}</p></div></div>
        {tree.notes && <details className="mt-4 rounded-xl border border-edge-subtle bg-surface-subtle p-4"><summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Observações da árvore</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-5 text-content-secondary">{tree.notes}</p></details>}
        </div>
        {children}
        <Button asChild className="mt-4 w-full"><Link to={`/arborizacao/arvore/${tree.id}`}>Página da árvore e linha do tempo<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>

        {canManage && <div className="mt-5 grid grid-cols-2 gap-2 border-t border-edge-subtle pt-4">
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => onEdit?.(tree)}>Editar árvore<ArrowRight className="h-3.5 w-3.5 shrink-0" /></Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 text-xs text-destructive" onClick={() => onDelete?.(tree)}><Trash2 className="h-3.5 w-3.5 shrink-0" />Excluir cadastro</Button>
        </div>}
      </div>
    </FormDialogContent>
  </Dialog>;
}
