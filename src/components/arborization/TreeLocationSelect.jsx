import React, { useId, useState } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { treeNameKey } from '@/lib/treeInventory';

export default function TreeLocationSelect({ label, items, value, onChange, fallback = '', placeholder = 'Selecione', emptyLabel = 'Não identificado', searchLabel, disabled = false, normalize = treeNameKey }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const selected = items.find(item => String(item.id) === String(value));
  const term = normalize(search);
  const filtered = items.filter(item => normalize(item.name).includes(term));
  const choose = next => { onChange(next); setOpen(false); };
  return <div className="tree-entry-field tree-location-select">
    <label id={`${id}-label`}>{label}</label>
    <Popover modal open={open} onOpenChange={next => { setOpen(next); if (next) setSearch(''); }}>
      <PopoverTrigger asChild><Button type="button" variant="outline" role="combobox" aria-labelledby={`${id}-label`} aria-expanded={open} data-value={value || ''} disabled={disabled} className="tree-location-select-trigger">
        <span>{selected?.name || fallback || placeholder}</span><ChevronsUpDown size={16} />
      </Button></PopoverTrigger>
      <PopoverContent align="start" className="tree-location-popover" onKeyDown={event => { if (event.key === 'Enter') event.stopPropagation(); }}>
        <Command shouldFilter={false}>
          <CommandInput aria-label={searchLabel} placeholder={`${searchLabel}…`} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>Nenhum resultado encontrado.</CommandEmpty>
            <CommandGroup>
              {!term && <CommandItem value="unknown" data-location-option="" onSelect={() => choose('')}><Check size={15} className={value ? 'opacity-0' : ''} /><span>{fallback ? `Manter ${fallback}` : emptyLabel}</span></CommandItem>}
              {filtered.map(item => <CommandItem key={item.id} value={String(item.id)} data-location-option={item.id} onSelect={() => choose(item.id)}><Check size={15} className={String(value) === String(item.id) ? '' : 'opacity-0'} /><span>{item.name}</span></CommandItem>)}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  </div>;
}
