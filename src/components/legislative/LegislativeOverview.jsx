import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3 } from 'lucide-react';
import { legislativeMatterFilters, legislativePath } from '@/lib/legislative';
import { LegislativeMatterList, LegislativeMetrics } from './LegislativeComponents';

export default function LegislativeOverview({ data, cityId, filters, presentation }) {
  const base = legislativePath(cityId);
  return <>
    {presentation.summary && <LegislativeMetrics metrics={data.metrics} groups={data.groups} cityId={cityId} filters={filters} />}
    <div className={`legislative-overview-layout ${presentation.distribution ? 'has-distribution' : ''}`}>
      <section><div className="legislative-section-heading"><h2>Últimas propostas</h2><Link to={`${base}/materias?${legislativeMatterFilters(filters)}`}>Ver todas <ArrowUpRight size={15} /></Link></div>
        <LegislativeMatterList matters={data.matters.slice(0, 6)} cityId={cityId} layout={presentation.layout} />
        {!data.total && <p className="legislative-notice">Nenhuma proposta encontrada neste período e filtro.</p>}
      </section>
      {presentation.distribution && <aside className="legislative-panel legislative-distribution-panel"><h2 className="flex items-center gap-2"><BarChart3 size={18} />Tipos oficiais</h2><div className="legislative-distribution">{data.distribution.map(type => <div key={type.id}><Link to={`${base}/materias?${legislativeMatterFilters({ ...filters, typeId: type.id })}`}><span>{type.name}</span><strong>{type.total}</strong></Link><meter min={0} max={Math.max(1, data.total)} value={type.total} aria-label={`${type.name}: ${type.total}`} /></div>)}</div></aside>}
    </div>
  </>;
}
