import React, { useRef } from 'react';
import { ChevronDown, Download, ImagePlus, MapPin, MoreHorizontal, Pencil, QrCode, Scissors, Sprout } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function TreeProfileActions({ canManage, planned, hasPhoto, downloading, onEdit, onPlant, onCare, onPhoto, onLocation, onQr, onDownload }) {
  const movesFocus = useRef(false);
  const afterClose = useRef(null);
  const launch = callback => () => { movesFocus.current = true; callback(); };
  const navigate = callback => () => { movesFocus.current = true; afterClose.current = callback; };
  return <DropdownMenu modal={false} onOpenChange={open => { if (open) { movesFocus.current = false; afterClose.current = null; } }}>
    <DropdownMenuTrigger asChild><Button type="button" variant="outline" className="tree-profile-actions-trigger" aria-label="Ações da árvore" title="Ações da árvore"><MoreHorizontal size={21} className="tree-profile-actions-icon" aria-hidden="true" /><span>Ações</span><ChevronDown size={15} className="tree-profile-actions-chevron" aria-hidden="true" /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} className="tree-profile-actions-menu" onCloseAutoFocus={event => { if (movesFocus.current) event.preventDefault(); const callback = afterClose.current; afterClose.current = null; callback?.(); }}>
      {canManage && <>
        {planned && <DropdownMenuItem onSelect={launch(onPlant)}><Sprout />Confirmar plantio realizado</DropdownMenuItem>}
        <DropdownMenuItem onSelect={launch(onEdit)}><Pencil />Editar árvore</DropdownMenuItem>
        {!planned && <DropdownMenuItem onSelect={launch(onCare)}><Scissors />Registrar serviço</DropdownMenuItem>}
        <DropdownMenuItem onSelect={launch(onPhoto)}><ImagePlus />{hasPhoto ? 'Trocar foto' : 'Adicionar foto'}</DropdownMenuItem>
        <DropdownMenuSeparator />
      </>}
      <DropdownMenuItem onSelect={navigate(onLocation)}><MapPin />Ver localização</DropdownMenuItem>
      <DropdownMenuItem onSelect={navigate(onQr)}><QrCode />Ver QR Code</DropdownMenuItem>
      <DropdownMenuItem disabled={downloading} onSelect={onDownload}><Download />{downloading ? 'Gerando PDF…' : 'Baixar QR Code em PDF'}</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
