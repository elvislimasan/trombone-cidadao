import React, { useState } from 'react';
import { ChevronDown, Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { FiltrosDePavimentacao, PAVEMENT_FILTERS } from '@/components/pavement/PavementSidebar';

export default function PavementStatisticsFilters({ filtros, onFiltroChange, bairros, autores, busca, onBuscaChange }) {
  const [more, setMore] = useState(false);
  const advanced = ['lei', 'projeto', 'autor', 'nome'];
  const active = PAVEMENT_FILTERS.filter(field => filtros[field.id] && filtros[field.id] !== 'all');
  const labelFor = field => {
    const choices = field.id === 'bairro' ? bairros : field.id === 'autor' ? [['sem', 'Sem autor vinculado'], ...autores.map(name => [name, name])] : field.opcoes;
    return choices?.find(([key]) => String(key) === String(filtros[field.id]))?.[1] || filtros[field.id];
  };
  return <section className="pavement-dashboard-filters" aria-label="Filtros das estatísticas">
    <div className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-content-tertiary" /><Input className="h-9 pl-9 text-xs" aria-label="Buscar rua nas estatísticas" placeholder="Buscar rua, bairro ou CEP…" value={busca} onChange={event => onBuscaChange(event.target.value)} /></div>
    <div className="pavement-dashboard-primary-filters">
      <FiltrosDePavimentacao filtros={filtros} onFiltroChange={onFiltroChange} bairros={bairros} autores={autores} fields={['bairro','situacao','tipo','cep']} colunas="grid-cols-2 min-[900px]:grid-cols-4" />
      <button type="button" className="pavement-more-filters" aria-expanded={more} aria-controls="pavement-advanced-filters" onClick={() => setMore(value => !value)}><SlidersHorizontal className="h-3.5 w-3.5" />Mais filtros{active.some(field => advanced.includes(field.id)) && <span className="h-1.5 w-1.5 rounded-full bg-brand" />}<ChevronDown className={`h-3 w-3 ${more ? 'rotate-180' : ''}`} /></button>
    </div>
    {more && <div id="pavement-advanced-filters"><FiltrosDePavimentacao filtros={filtros} onFiltroChange={onFiltroChange} bairros={bairros} autores={autores} fields={advanced} colunas="grid-cols-2 min-[900px]:grid-cols-4" /></div>}
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Filtros aplicados">
      {!active.length && !busca && <span className="text-[11px] text-content-tertiary">Todas as ruas da cidade</span>}
      {busca && <button type="button" className="pavement-filter-chip" onClick={() => onBuscaChange('')} aria-label="Remover busca">Busca: {busca}<X className="h-3 w-3" /></button>}
      {active.map(field => <button key={field.id} type="button" className="pavement-filter-chip" onClick={() => onFiltroChange(field.id,'all')} aria-label={`Remover filtro ${field.rotulo}`}>{field.rotulo}: {labelFor(field)}<X className="h-3 w-3 shrink-0" /></button>)}
      {(active.length > 0 || busca) && <button type="button" className="px-2 text-[11px] font-semibold text-brand" onClick={() => { active.forEach(field => onFiltroChange(field.id,'all')); onBuscaChange(''); }}>Limpar filtros</button>}
    </div>
  </section>;
}
