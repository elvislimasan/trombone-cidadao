import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { BarChart3, CalendarDays, CheckCircle2, ChevronDown, FileText, HelpCircle, MapPin, Wrench } from 'lucide-react';
import { legislativeDate, legislativePath, LEGISLATIVE_SERVICES } from '@/lib/legislative';
import { legislativePlaceSummary, legislativeServiceColors } from '@/lib/legislativeVisuals';
import { LegislativeAuthors } from './LegislativeComponents';
import { LegislativeBars } from './LegislativeCharts';
import LegislativeSectionStats from './LegislativeSectionStats';
import LegislativeDateBadge from './LegislativeDateBadge';

export default function LegislativeRecurrences({ data, cityId, layout = 'cards' }) {
  const [service, setService] = useState('');
  const summary = legislativePlaceSummary(data.groups);
  const groups = data.groups.filter(group => !service || group.service === service);
  const recent = [...groups].sort((a,b) => (b.last_date || '').localeCompare(a.last_date || '')).slice(0,4);
  const rows = summary.services.map(row => ({ ...row, label: LEGISLATIVE_SERVICES[row.key] || 'Serviço não informado', selected: service === row.key, onSelect: () => setService(current => current === row.key ? '' : row.key) }));
  return <>
    <LegislativeSectionStats label="Resumo dos locais exibidos" items={[
      {key:'places',label:'Locais nesta lista',value:summary.places,icon:MapPin},
      {key:'matters',label:'Pedidos nesta lista',value:summary.matters,icon:FileText},
      {key:'services',label:'Serviços citados',value:summary.services.length,icon:Wrench,color:'#139d89'},
      {key:'reviewed',label:'Grupos revisados',value:summary.reviewed,icon:CheckCircle2,color:'#4383cd'},
    ]} />
    <p className="legislative-inline-warning">Repetição não comprova falta de atendimento. Locais automáticos são estimativas.</p>
    {data.groups.length > 0 && <div className="legislative-analytics legislative-place-analytics">
      <section className="legislative-chart-panel"><header><h2><BarChart3 size={19} aria-hidden="true" />Pedidos por serviço</h2><span>Nesta lista</span></header><LegislativeBars rows={rows} label="Pedidos identificados por serviço" /><footer><details className="legislative-chart-explanation"><summary>Sobre a contagem</summary><p>Cada pedido conta uma vez por serviço nos grupos exibidos. Um pedido pode citar mais de um serviço.</p></details></footer></section>
      <section className="legislative-chart-panel"><header><h2><CalendarDays size={19} aria-hidden="true" />Pedidos mais recentes</h2></header><ol className="legislative-place-timeline">{recent.map(group => <li key={`${group.location_key}-${group.service}`}><a href={`#ocorrencia-${data.groups.indexOf(group)}`}><LegislativeDateBadge value={group.last_date} /><span><strong>{group.location}</strong><small>{LEGISLATIVE_SERVICES[group.service] || 'Serviço não informado'}{group.neighborhood ? ` · ${group.neighborhood}` : ''}</small></span></a></li>)}</ol></section>
    </div>}
    {data.groups.length > 0 && <div className="legislative-place-controls"><h2>Ocorrências por local</h2><div role="group" aria-label="Filtrar ocorrências por serviço"><button type="button" aria-pressed={!service} onClick={() => setService('')}>Todos</button>{summary.services.map(row => <button type="button" key={row.key} aria-pressed={service === row.key} onClick={() => setService(row.key)}>{LEGISLATIVE_SERVICES[row.key] || 'Outro serviço'}</button>)}</div></div>}
    <div className="legislative-directory legislative-recurrences" data-layout={layout}>{groups.map(group => <article id={`ocorrencia-${data.groups.indexOf(group)}`} className="legislative-panel legislative-recurrence-card" key={`${group.location_key}-${group.service}`} style={{'--place-color':legislativeServiceColors[group.service] || legislativeServiceColors.outros}}>
      <header><span className="legislative-place-pin" aria-hidden="true"><MapPin size={23} /></span><span className="legislative-request-count"><strong>{group.total}</strong> pedidos</span></header>
      <span className="legislative-eyebrow">{group.reviewed ? 'Local revisado' : 'Local estimado'}</span><h3>{group.location}</h3>{group.neighborhood && <p className="legislative-place-neighborhood">{group.neighborhood}</p>}
      <div className="legislative-place-service"><Wrench size={14} aria-hidden="true" />{LEGISLATIVE_SERVICES[group.service] || 'Serviço não informado'}</div>
      <dl className="legislative-place-dates"><div><dt>Primeiro pedido</dt><dd>{legislativeDate(group.first_date)}</dd></div><div><dt>Mais recente</dt><dd>{legislativeDate(group.last_date)}</dd></div></dl>
      <span className="legislative-unverified"><HelpCircle size={14} aria-hidden="true" />Atendimento ainda não verificado</span>
      <details className="legislative-recurrence-records"><summary>Ver pedidos e autores<ChevronDown size={17} aria-hidden="true" /></summary><ul>{group.matters.map(matter => <li key={matter.id}><div className="mb-1 flex flex-wrap gap-3"><Link className="text-brand" to={legislativePath(cityId, `/materias/${matter.id}`)}>Matéria {matter.number}/{matter.year}</Link>{matter.source_url && <a className="text-xs text-brand" href={matter.source_url} target="_blank" rel="noreferrer">Fonte oficial</a>}</div><LegislativeAuthors authors={matter.authors} cityId={cityId} /></li>)}</ul></details>
    </article>)}</div>
    {!data.groups.length && <p className="legislative-state">Nenhuma possível repetição identificada neste filtro. A busca textual pode localizar pedidos sem endereço extraído.</p>}
    {data.total > data.groups.length && <p className="legislative-notice">Exibindo {data.groups.length} de {data.total} grupos. Filtre por rua, bairro ou período para restringir.</p>}
  </>;
}
