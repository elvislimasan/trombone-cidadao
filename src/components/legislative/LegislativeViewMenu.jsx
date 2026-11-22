import React from 'react';
import { BookOpenText, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuCheckboxItem, DropdownMenuItem } from '@/components/ui/dropdown-menu';

export default function LegislativeViewMenu({ presentation, summary = false, distribution = false }) {
  return <DropdownMenu>
    <DropdownMenuTrigger asChild><Button variant="outline" className="legislative-toolbar-button legislative-view-button" aria-label="Personalizar visualização" title="Personalizar visualização">{presentation.layout === 'list' ? <List size={18} /> : <BookOpenText size={18} />}<span className="legislative-view-label">Visualização</span></Button></DropdownMenuTrigger>
    <DropdownMenuContent align="end" collisionPadding={12} className="legislative-display-menu">
      <DropdownMenuLabel>Visualização {presentation.mobile ? 'no celular' : 'no desktop'}</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={presentation.layout} onValueChange={layout => presentation.update({ layout })}>
        <DropdownMenuRadioItem value="cards"><BookOpenText size={16} className="mr-2" />Leitura</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="list"><List size={16} className="mr-2" />Lista compacta</DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      {(summary || distribution) && <DropdownMenuSeparator />}
      {summary && <DropdownMenuCheckboxItem checked={presentation.summary} onCheckedChange={value => presentation.update({ summary: value })}>Mostrar resumo</DropdownMenuCheckboxItem>}
      {distribution && <DropdownMenuCheckboxItem checked={presentation.distribution} onCheckedChange={value => presentation.update({ distribution: value })}>Mostrar tipos oficiais</DropdownMenuCheckboxItem>}
      <DropdownMenuSeparator /><DropdownMenuItem onSelect={presentation.reset}>Restaurar padrão</DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>;
}
