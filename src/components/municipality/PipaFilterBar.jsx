import React, { useId, useState } from 'react';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function PipaFilterBar({ search, onSearch, placeholder = 'Buscar', labels = [], children, onClear, actions, secondary }) {
  const [expanded, setExpanded] = useState(false), id = useId();
  return <div className="pipa-filter-bar">
    <div className="pipa-filter-bar-main">
      {onSearch && <label className="pipa-quick-search"><Search size={16} aria-hidden="true" /><span className="sr-only">{placeholder}</span><input type="search" placeholder={placeholder} value={search} onChange={event => onSearch(event.target.value)} />{search && <button type="button" aria-label="Limpar busca" onClick={() => onSearch('')}><X size={15} /></button>}</label>}
      <div className="pipa-active-filter-labels" aria-label="Filtros ativos">{labels.filter(Boolean).map(label => <span key={label}>{label}</span>)}</div>
      <div className="pipa-filter-bar-actions"><Button type="button" variant="outline" className={expanded ? 'is-expanded' : ''} aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(value => !value)}><SlidersHorizontal size={15} className="mr-2" />Filtros</Button>{actions}</div>
    </div>
    {secondary && <div className="pipa-filter-bar-secondary">{secondary}</div>}
    <div id={id} hidden={!expanded} className="pipa-filter-panel"><div className="pipa-filter-panel-fields">{children}</div><div className="pipa-filter-panel-footer">{onClear && <Button variant="ghost" size="sm" type="button" onClick={onClear}>Restaurar filtros</Button>}<Button variant="outline" size="sm" type="button" onClick={() => setExpanded(false)}>Concluir filtros</Button></div></div>
  </div>;
}
