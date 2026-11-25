import React from 'react';
import { ArrowUpRight, CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { legislativeDate } from '@/lib/legislative';
import { LegislativeMatterCard } from './LegislativeComponents';

export default function LegislativeSessionDetail({ data, cityId }) {
  const session = data.session;
  return <>
    <section className="legislative-panel legislative-document-summary">
      <time className="legislative-session-date" dateTime={session.data.date}><CalendarDays size={17} aria-hidden="true" />{legislativeDate(session.data.date)}</time>
      <h2 className="legislative-detail-title">{session.data.label}</h2>
      <div className="legislative-detail-actions">{[['Cadastro oficial', session.source_url], ['Ata', session.data.minutes_url], ['Pauta', session.data.agenda_url], ['Vídeo', session.data.video_url]].filter(([, url]) => url).map(([label, url]) => <Button key={label} variant="outline" asChild><a href={url} target="_blank" rel="noreferrer">{label}<ArrowUpRight size={16} aria-hidden="true" /></a></Button>)}</div>
    </section>
    <div className="legislative-columns legislative-document-columns">
      <section>
        <div className="legislative-section-heading"><h2>Matérias da sessão</h2><span className="legislative-result-count">{data.agenda.length}</span></div>
        <div className="legislative-list">{data.agenda.map(item => item.matter ? <div key={`${item.section}-${item.id}`}><p className="legislative-agenda-item">{item.section} · item {item.data.order || '—'}</p><LegislativeMatterCard cityId={cityId} matter={item.matter} /></div> : <article className="legislative-panel" key={`${item.section}-${item.id}`}><p>{item.section} · matéria fora do recorte do acervo</p><a className="legislative-text-link" href={item.source_url} target="_blank" rel="noreferrer">Ver registro na Câmara</a></article>)}{!data.agenda.length && <p className="legislative-notice">Nenhuma matéria registrada neste acervo.</p>}</div>
      </section>
      <section className="legislative-panel">
        <h2>Presenças registradas</h2>
        <p className="legislative-notice">A ausência de um nome nesta lista não comprova falta.</p>
        <ul className="legislative-attendance-list">{data.attendance.map((item, i) => <li key={i}><a href={item.source_url} target="_blank" rel="noreferrer">{item.name}</a></li>)}</ul>
        {!data.attendance.length && <p className="legislative-empty-copy">Sem lista de presença publicada neste acervo.</p>}
      </section>
    </div>
  </>;
}
