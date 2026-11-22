import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BarChart3, CalendarDays, CheckCircle2, FileText, Video } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { legislativePath } from '@/lib/legislative';
import { legislativeChartScale } from '@/lib/legislativeCharts';
import { legislativeRecentMonths } from '@/lib/legislativeVisuals';
import { LegislativePagination } from './LegislativeComponents';
import { LegislativeBars } from './LegislativeCharts';
import LegislativeSectionStats from './LegislativeSectionStats';
import LegislativeDateBadge from './LegislativeDateBadge';

export default function LegislativeSessions({ data, cityId, layout, onPage, filters, onPeriodChange }) {
  const metrics = data.session_metrics;
  const months = metrics ? legislativeRecentMonths(metrics.months, filters) : [];
  const scale = legislativeChartScale(months.map(month => month.value));
  return <>
    <LegislativeSectionStats label="Resumo das sessões no período" items={[
      {key:'total',label:'Sessões no período',value:data.total,icon:CalendarDays},
      {key:'finished',label:'Finalizadas',value:metrics?.finished,icon:CheckCircle2,color:'#139d89'},
      {key:'minutes',label:'Atas publicadas',value:metrics?.minutes,icon:FileText},
      {key:'videos',label:'Vídeos disponíveis',value:metrics?.videos,icon:Video,color:'#4383cd'},
    ]} />
    {metrics && <div className="legislative-analytics legislative-session-analytics">
      <section className="legislative-chart-panel"><header><h2><BarChart3 size={19} aria-hidden="true" />Tipos de sessão</h2><span>No período</span></header>{metrics.types.length ? <LegislativeBars rows={metrics.types.slice(0,5).map(row => ({key:row.id || row.label,label:row.label,value:row.total}))} label="Sessões por tipo oficial" /> : <p className="legislative-chart-empty">Nenhuma sessão neste período.</p>}{metrics.types.length > 5 && <footer>Exibindo os cinco tipos mais frequentes.</footer>}</section>
      <section className="legislative-chart-panel"><header><h2><CalendarDays size={19} aria-hidden="true" />Sessões por mês</h2><span>{months.length > 1 ? `${months.length} meses finais do período` : 'No período'}</span></header><ul className="legislative-month-chart" aria-label="Quantidade de sessões por mês" style={{'--month-count':months.length || 1}}>{months.map(month => <li key={month.key}><button type="button" onClick={() => onPeriodChange({inicio:month.start,fim:month.end})} aria-label={`${month.value} sessões em ${month.label} de ${month.year}. Filtrar mês`}><span className="legislative-month-track"><span style={{height:`${month.value / scale.max * 100}%`}}><strong>{month.value}</strong></span></span><span className="legislative-month-label">{month.label}<small>{month.year}</small></span></button></li>)}</ul></section>
    </div>}
    <div className="legislative-section-heading"><h2>Arquivo de sessões <span className="legislative-result-count">{data.total}</span></h2></div>
    <div className="legislative-session-feed" data-layout={layout}>{data.sessions.map(session => <article className="legislative-panel legislative-session-card" key={session.id}>
      <header><LegislativeDateBadge value={session.data.date} /><span className="legislative-session-status" data-finished={session.data.finished}>{session.data.finished === true ? <><CheckCircle2 size={14} aria-hidden="true" />Finalizada</> : session.data.finished === false ? 'Não finalizada' : 'Situação não informada'}</span></header>
      <h3><Link to={legislativePath(cityId, `/sessoes/${session.id}`)}>{session.data.label}</Link></h3>
      <div className="legislative-session-docs">{[['Ata',session.data.minutes_url,FileText],['Pauta',session.data.agenda_url,FileText],['Vídeo',session.data.video_url,Video]].filter(([,url]) => url).map(([label,url,Icon]) => <a key={label} href={url} target="_blank" rel="noreferrer" aria-label={`${label}: ${session.data.label}`}><Icon size={15} aria-hidden="true" />{label}</a>)}{![session.data.minutes_url,session.data.agenda_url,session.data.video_url].some(Boolean) && <span>Documentos não publicados neste acervo.</span>}</div>
      <footer><Button asChild><Link to={legislativePath(cityId, `/sessoes/${session.id}`)}>Ver sessão<ArrowRight size={16} aria-hidden="true" /></Link></Button><a href={session.source_url} target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight size={14} aria-hidden="true" /></a></footer>
    </article>)}</div>
    {!data.total && <p className="legislative-notice">Nenhuma sessão cadastrada neste período.</p>}
    <LegislativePagination page={data.page} total={data.total} onChange={onPage} />
  </>;
}
