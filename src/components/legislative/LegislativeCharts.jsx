import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, BarChart3, PieChart, CheckCheck } from 'lucide-react';
import { legislativeMatterFilters, legislativeOfficialSearch, legislativePath } from '@/lib/legislative';
import { legislativeChartCount, legislativeChartScale, legislativeGroupChart } from '@/lib/legislativeCharts';

const format = value => value === null ? '—' : new Intl.NumberFormat('pt-BR').format(value);

export function LegislativeVoteGraphic({ votes }) {
  const rows = [['yes', 'favoráveis', '#139d89'], ['no', 'contrários', '#df594b'], ['abstentions', 'abstenções', '#7b8595']].map(([key, label, color]) => ({ key, label, color, value: legislativeChartCount(votes[key]) }));
  const total = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
  if (!total || rows.some(row => row.value === null)) return null;
  return <div className="legislative-vote-graphic" role="img" aria-label={`Placar publicado: ${rows.map(row => `${format(row.value)} ${row.label}`).join(', ')}`}>{rows.filter(row => row.value > 0).map(row => <span key={row.key} style={{ width: `${row.value / total * 100}%`, background: row.color }} title={`${format(row.value)} ${row.label}`} />)}</div>;
}

export function LegislativeBars({ rows, label }) {
  const scale = legislativeChartScale(rows.map(row => row.value));
  return <div className="legislative-bars" role="group" aria-label={label}>
    <ul>{rows.map(row => {
      const body = <><span className="legislative-bar-label">{row.label}</span><span className="legislative-bar-track" aria-hidden="true"><span style={{ width: `${(row.value ?? 0) / scale.max * 100}%`, background: row.color || 'var(--leg-chart-primary)' }} /></span><strong>{format(row.value)}</strong></>;
      return <li key={row.key}>{row.href ? <Link to={row.href} aria-label={`${row.label}: ${format(row.value)}. Ver propostas`}>{body}</Link> : row.onSelect ? <button type="button" aria-pressed={row.selected} onClick={row.onSelect}>{body}</button> : <div>{body}</div>}</li>;
    })}</ul>
    <div className="legislative-chart-axis" aria-hidden="true">{scale.ticks.map(value => <span key={value} style={{ left: `${value / scale.max * 100}%` }}>{format(value)}</span>)}</div>
  </div>;
}

export function LegislativeRing({ rows, total, caption }) {
  const id = useId(), [active, setActive] = useState(null);
  const sum = rows.reduce((count, row) => count + (row.value ?? 0), 0);
  let offset = 0;
  return <div className="legislative-ring-layout">
    <div className="legislative-ring">
      <svg viewBox="0 0 200 200" role="img" aria-labelledby={id}>
        <title id={id}>{rows.map(row => `${row.label}: ${format(row.value)}`).join('; ')}</title>
        <circle className="legislative-ring-track" cx="100" cy="100" r="78" fill="none" strokeWidth="24" />
        {rows.filter(row => row.value > 0).map(row => {
          const length = row.value / sum * 100, start = offset;offset += length;
          return <circle key={row.key} cx="100" cy="100" r="78" fill="none" strokeWidth="24" pathLength="100" stroke={row.color} strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-start} transform="rotate(-90 100 100)" opacity={active && active !== row.key ? .25 : 1}><title>{row.label}: {format(row.value)}</title></circle>;
        })}
      </svg>
      <div className="legislative-ring-center" data-large={total >= 10000} aria-hidden="true"><strong>{format(total)}</strong><span>{caption}</span></div>
    </div>
    <ul className="legislative-chart-legend">{rows.map(row => {
      const body = <><i aria-hidden="true" style={{ background: row.color }} /><span>{row.label}</span><strong>{format(row.value)}</strong></>;
      return <li key={row.key} onMouseEnter={() => setActive(row.key)} onMouseLeave={() => setActive(null)} onFocus={() => setActive(row.key)} onBlur={() => setActive(null)}>{row.href ? <Link to={row.href} aria-label={`${row.label}: ${format(row.value)}. Ver propostas`}>{body}</Link> : <div>{body}</div>}</li>;
    })}</ul>
  </div>;
}

export default function LegislativeCharts({ data, cityId, filters, officialHref, typesOnly = false }) {
  const typeId = useId(), groupId = useId();
  const official = officialHref || legislativeOfficialSearch(filters);
  const group = legislativeGroupChart(data.groups);
  const types = [...(data.distribution || [])].sort((a, b) => (b.total ?? -1) - (a.total ?? -1));
  const rows = types.slice(0, 5).map(type => ({ key: type.id, label: type.name, value: legislativeChartCount(type.total), href: legislativePath(cityId, `/materias?${legislativeMatterFilters({ ...filters, typeId: type.id })}`) }));
  const groups = group.rows.map(row => ({ ...row, href: legislativePath(cityId, `/materias?${legislativeMatterFilters({ ...filters, group: row.key })}`) }));
  const reviewed = legislativeChartCount(data.classification?.reviewed), automatic = legislativeChartCount(data.classification?.automatic);
  const full = group.complete && group.total === data.metrics?.matters;
  return <div className="legislative-analytics">
    <section className="legislative-chart-panel" aria-labelledby={typeId}>
      <header><h2 id={typeId}><BarChart3 size={19} aria-hidden="true" />Tipos na Câmara</h2>{types.length > 5 && <span>5 de {types.length} tipos</span>}</header>
      {rows.length ? <LegislativeBars rows={rows} label="Propostas por tipo oficial" /> : <p className="legislative-chart-empty">Sem distribuição por tipo publicada neste recorte.</p>}
      <footer><a href={official} target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight size={14} aria-hidden="true" /></a><span>{types.length > 5 ? 'Tipos mais frequentes' : 'Tipos oficiais'}</span></footer>
    </section>
    {!typesOnly && <section className="legislative-chart-panel" aria-labelledby={groupId}>
      <header><h2 id={groupId}><PieChart size={19} aria-hidden="true" />Perfil das propostas</h2><button type="button" className="legislative-chart-help" onClick={() => window.dispatchEvent(new CustomEvent('legislative:data-info', { detail: 'method' }))}>Como contamos</button></header>
      <LegislativeRing rows={groups} total={group.total} caption={full ? 'Propostas' : 'No gráfico'} />
      <footer><span>Grupos automáticos · estimativa</span>{reviewed !== null && automatic !== null && <span className="legislative-chart-review"><CheckCheck size={15} aria-hidden="true" />{format(reviewed)} de {format(reviewed + automatic)} revisadas</span>}</footer>
      {!full && <p className="legislative-chart-coverage">Distribuição disponível para parte das propostas deste recorte.</p>}
    </section>}
  </div>;
}
