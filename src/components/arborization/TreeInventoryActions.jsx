import React, { useRef } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CalendarDays, ChevronDown, Download, Leaf, List, Map, MoreVertical, Plus, Scissors, Sprout, Trees } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function TreeInventoryActions({ canManage, loading, error, busy, hasResults, hasLivingTrees, cityId, view, onRegister, onPlan, onBatch, onMaintenance, onPlanning, onExport, onStatistics, onChangeView }) {
  const openingDialog = useRef(false);
  const launch = callback => () => { openingDialog.current = true; callback(); };
  const citySearch = cityId ? `?cidade=${encodeURIComponent(cityId)}` : '';
  return <DropdownMenu modal={false} onOpenChange={open => { if (open) openingDialog.current = false; }}>
    <DropdownMenuTrigger asChild><Button type="button" variant="outline" className="arborization-actions-trigger"><MoreVertical size={17} /><span>Ações</span><ChevronDown size={15} /></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" sideOffset={8} className="arborization-actions-menu" onCloseAutoFocus={event => { if (openingDialog.current) event.preventDefault(); }}>
      {canManage && <>
        <DropdownMenuItem disabled={loading || !!error} onSelect={launch(onRegister)}><Plus />Cadastrar árvore</DropdownMenuItem>
        <DropdownMenuItem disabled={loading || !!error} onSelect={launch(onPlan)}><Sprout />Planejar plantio</DropdownMenuItem>
        <DropdownMenuItem disabled={loading || !!error} onSelect={launch(onBatch)}><Trees />Cadastrar várias árvores</DropdownMenuItem>
        <DropdownMenuItem disabled={loading || !!error || !hasLivingTrees} onSelect={launch(onMaintenance)}><Scissors />Manejo em lote</DropdownMenuItem>
        <DropdownMenuSeparator />
      </>}
      <DropdownMenuItem disabled={loading} onSelect={launch(onPlanning)}><CalendarDays />Planejamento anual</DropdownMenuItem>
      <DropdownMenuItem disabled={loading || busy || !hasResults} onSelect={onExport}><Download />{busy ? 'Exportando…' : 'Exportar CSV'}</DropdownMenuItem>
      <DropdownMenuItem disabled={loading || !!error} onSelect={launch(onStatistics)}><BarChart3 />Estatísticas</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => onChangeView(view === 'map' ? 'list' : 'map')}>{view === 'map' ? <List /> : <Map />}{view === 'map' ? 'Ver lista' : 'Ver mapa'}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem asChild><Link to={`/adoteumaarvore${citySearch}`}><Sprout />Adote uma árvore</Link></DropdownMenuItem>
      <DropdownMenuItem asChild><Link to={`/arvores-da-comunidade${citySearch}`}><Leaf />Árvores da comunidade</Link></DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
