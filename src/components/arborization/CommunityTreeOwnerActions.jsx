import React from 'react';
import { Link } from 'react-router-dom';
import { Camera, Loader2, MoreHorizontal, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { supabase } from '@/lib/customSupabaseClient';
import { communityTreePath, deleteCommunityRecord } from '@/lib/communityTrees';
import { useCommunityAction } from './CommunityTreeForms';

export function TreeOwnerActions({ tree, onPhoto, onPrivacy, onDelete }) {
  const profile = communityTreePath(tree.id);
  return <div className="community-owner-actions">
    <Button asChild variant="outline" size="sm"><Link to={`${profile}/editar`}><Pencil size={16} aria-hidden="true" />Editar</Link></Button>
    {onPhoto ? <Button variant="outline" size="sm" onClick={onPhoto}><Camera size={16} aria-hidden="true" />Fotos</Button> : <Button asChild variant="outline" size="sm"><Link to={`${profile}?acao=foto`}><Camera size={16} aria-hidden="true" />Fotos</Link></Button>}
    <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Mais ações de ${tree.name}`}><MoreHorizontal size={20} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
      {onPrivacy ? <DropdownMenuItem onSelect={onPrivacy}><ShieldCheck size={16} className="mr-2" />Privacidade</DropdownMenuItem> : <DropdownMenuItem asChild><Link to={`${profile}?acao=privacidade`}><ShieldCheck size={16} className="mr-2" />Privacidade</Link></DropdownMenuItem>}
      <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(tree)}><Trash2 size={16} className="mr-2" />Excluir árvore</DropdownMenuItem>
    </DropdownMenuContent></DropdownMenu>
  </div>;
}

export function CareOwnerActions({ care, onEdit, onDelete }) {
  return <DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={`Ações do cuidado de ${care.performed_on}`}><MoreHorizontal size={19} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => onEdit(care)}><Pencil size={16} className="mr-2" />Editar cuidado</DropdownMenuItem><DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => onDelete(care)}><Trash2 size={16} className="mr-2" />Excluir cuidado</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
}

export function CommunityDeleteDialog({ tree, care, userId, onClose, onDeleted }) {
  const action = useCommunityAction(onDeleted);
  const title = care ? 'Excluir este cuidado?' : `Excluir “${tree.name}”?`;
  return <Dialog open onOpenChange={open => { if (!open && !action.busy) onClose(); }}><DialogContent role="alertdialog" className="community-dialog sm:max-w-md" onEscapeKeyDown={event => { if (action.busy) event.preventDefault(); }} onInteractOutside={event => { if (action.busy) event.preventDefault(); }}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{care ? 'O registro e sua foto serão removidos do diário.' : 'A árvore, suas fotos e todos os cuidados serão removidos.'} Esta ação não pode ser desfeita.</DialogDescription></DialogHeader>
    {action.error && <p ref={action.errorRef} tabIndex={-1} role="alert" className="community-error">{action.error}</p>}
    <div className="community-delete-actions"><Button variant="outline" disabled={action.busy} onClick={onClose}>Cancelar</Button><Button variant="destructive" disabled={action.busy} onClick={() => action.run(() => deleteCommunityRecord(supabase, { type: care ? 'care' : 'tree', record: care || tree, userId, treeId: tree.id }))}>{action.busy ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}{action.busy ? 'Excluindo…' : care ? 'Excluir cuidado' : 'Excluir árvore'}</Button></div>
  </DialogContent></Dialog>;
}
