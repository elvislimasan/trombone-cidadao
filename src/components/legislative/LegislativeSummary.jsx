import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileText, HeartHandshake, HelpCircle, Landmark, MessageSquare, Wrench } from 'lucide-react';
import { legislativeOfficialSearch, legislativeMatterFilters, legislativePath, LEGISLATIVE_GROUPS } from '@/lib/legislative';
import { LEGISLATIVE_CHART_COLORS } from '@/lib/legislativeCharts';

const groupsMeta = { melhorias: ['Melhorias', Wrench], cobrancas: ['Cobranças', MessageSquare], homenagens: ['Homenagens', HeartHandshake], leis: ['Propostas de lei', Landmark], outros: ['Outros', FileText] };

export default function LegislativeSummary({ metrics, groups, cityId = 64, filters = {}, officialHref }) {
  if (!metrics) return null;
  const entries = groups ? [['Tudo no período', metrics.matters, null, FileText], ...Object.keys(LEGISLATIVE_GROUPS).map(key => [groupsMeta[key][0], groups[key] || 0, key, groupsMeta[key][1]])] : [['Matérias no período', metrics.matters, null, FileText], ['Propostas normativas', metrics.normative, null, Landmark], ['Pedidos', metrics.requests, null, Wrench], ['Revisadas', metrics.classified, null, FileText]];
  return <section className="legislative-summary" aria-label="Resumo das propostas">
    <dl className="legislative-metrics">{entries.map(([label, value, group, Icon]) => {
      const href = legislativePath(cityId, `/materias?${legislativeMatterFilters({ ...filters, group })}`);
      return <div key={label} data-group={group || 'total'} data-large={value >= 10000} style={{ '--metric-color': LEGISLATIVE_CHART_COLORS[group] || '#ffffff' }}><span className="legislative-metric-icon" aria-hidden="true"><Icon size={21} /></span><dt><Link to={href}>{label}</Link></dt><dd><Link to={href} aria-label={`${group ? LEGISLATIVE_GROUPS[group] : label}: ${value}. Ver matérias`}>{new Intl.NumberFormat('pt-BR').format(value)}</Link></dd><a className="legislative-metric-source" href={officialHref || legislativeOfficialSearch(filters)} target="_blank" rel="noreferrer" aria-label={`Fonte oficial: ${label}`} title={`Fonte oficial: ${label}`}><ArrowUpRight size={15} /></a></div>;
    })}</dl>
    {groups && <div className="legislative-classification-note"><span>Grupos automáticos · estimativa</span><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('legislative:data-info', { detail: 'method' }))}><HelpCircle size={14} />Como contamos</button></div>}
  </section>;
}
