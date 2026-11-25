import React, { useId } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { legislativeMatterFilters, legislativeOfficialSearch, legislativePath } from '@/lib/legislative';
import { legislativeGroupChart } from '@/lib/legislativeCharts';
import './legislative-profile-summary.css';

const labels = { melhorias: 'Pedidos de melhoria nos bairros', cobrancas: 'Perguntas e cobranças', homenagens: 'Homenagens', leis: 'Propostas de lei', outros: 'Outros' };
const count = value => value === null ? '—' : new Intl.NumberFormat('pt-BR').format(value);

export default function LegislativeProposalSummary({ data, cityId, filters, profile = false, officialHref }) {
  const id = useId(), chart = legislativeGroupChart(data.groups);
  return <section className="legislative-proposal-summary" aria-labelledby={id}>
    <header><h2 id={id}>{profile ? 'O que propôs no período' : 'Propostas no período'}</h2><Link to={legislativePath(cityId, `/materias?${legislativeMatterFilters({ ...filters, group: null })}`)} className="legislative-proposal-total">{count(data.metrics?.matters ?? null)}<span> propostas</span><ChevronRight size={16} aria-hidden="true" /></Link></header>
    <div className="legislative-category-strip" role="img" aria-label={chart.rows.map(row => `${labels[row.key]}: ${count(row.value)}`).join('; ')}>{chart.rows.filter(row => row.value > 0).map(row => <span key={row.key} style={{ flex: row.value, background: row.color }} />)}</div>
    <ul className="legislative-category-list">{chart.rows.map(row => <li key={row.key}><Link to={legislativePath(cityId, `/materias?${legislativeMatterFilters({ ...filters, group: row.key })}`)}><i style={{ background: row.color }} aria-hidden="true" /><span>{labels[row.key]}</span><strong>{count(row.value)}</strong><ChevronRight size={14} aria-hidden="true" /></Link></li>)}</ul>
    <footer><span>Grupos automáticos · estimativa</span><button type="button" onClick={() => window.dispatchEvent(new CustomEvent('legislative:data-info', { detail: 'method' }))}>Como contamos</button></footer>
    {(!chart.complete || chart.total !== data.metrics?.matters) && <p className="legislative-inline-warning">Distribuição disponível para parte das propostas.</p>}
    <a className="legislative-snapshot-source" href={officialHref || legislativeOfficialSearch(filters)} target="_blank" rel="noreferrer">Fonte das propostas<ArrowUpRight size={13} aria-hidden="true" /></a>
  </section>;
}
