import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { legislativeDate, legislativePath } from '@/lib/legislative';
import { LegislativePagination } from './LegislativeComponents';

export default function LegislativeSessions({ data, cityId, layout, onPage }) {
  return <>
    <div className="legislative-section-heading"><h2>Sessões <span className="legislative-result-count">{data.total}</span></h2></div>
    <div className="legislative-session-feed" data-layout={layout}>{data.sessions.map(session => <article className="legislative-panel legislative-session-card" key={session.id}>
      <time dateTime={session.data.date}><CalendarDays size={16} />{legislativeDate(session.data.date)}</time>
      <h2><Link to={legislativePath(cityId, `/sessoes/${session.id}`)}>{session.data.label}</Link></h2>
      <a href={session.source_url} target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight size={14} /></a>
    </article>)}</div>
    {!data.total && <p className="legislative-notice">Nenhuma sessão cadastrada neste período.</p>}
    <LegislativePagination page={data.page} total={data.total} onChange={onPage} />
  </>;
}
