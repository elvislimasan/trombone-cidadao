import React from 'react';
import { Link } from 'react-router-dom';
import { legislativeDate, legislativePath, LEGISLATIVE_SERVICES } from '@/lib/legislative';
import { LegislativeAuthors } from './LegislativeComponents';

export default function LegislativeRecurrences({ data, cityId, layout = 'cards' }) {
  return <>
    <p className="legislative-inline-warning">Repetição não comprova falta de atendimento. Locais automáticos são estimativas.</p>
    <div className="legislative-directory legislative-recurrences" data-layout={layout}>{data.groups.map(group => <article className="legislative-panel legislative-recurrence-card" key={`${group.location_key}-${group.service}`}>
      <header><div><span className="legislative-eyebrow">{group.reviewed ? 'Local revisado' : 'Local estimado'}</span><h2>{group.location}</h2>{group.neighborhood && <p className="text-sm text-content-secondary">{group.neighborhood}</p>}</div><span className="legislative-request-count"><strong>{group.total}</strong> pedidos</span></header>
      <div className="legislative-recurrence-meta"><strong>{LEGISLATIVE_SERVICES[group.service]}</strong><span>{legislativeDate(group.first_date)} a {legislativeDate(group.last_date)}</span></div>
      <span className="legislative-unverified">Atendimento ainda não verificado</span>
      <details className="legislative-recurrence-records"><summary>Ver pedidos e autores</summary><ul>{group.matters.map(matter => <li key={matter.id}><div className="mb-1 flex flex-wrap gap-3"><Link className="text-brand" to={legislativePath(cityId, `/materias/${matter.id}`)}>Matéria {matter.number}/{matter.year}</Link>{matter.source_url && <a className="text-xs text-brand" href={matter.source_url} target="_blank" rel="noreferrer">Fonte oficial</a>}</div><LegislativeAuthors authors={matter.authors} cityId={cityId} /></li>)}</ul></details>
    </article>)}</div>
    {!data.groups.length && <p className="legislative-state">Nenhuma possível repetição identificada neste filtro. A busca textual pode localizar pedidos sem endereço extraído.</p>}
    {data.total > data.groups.length && <p className="legislative-notice">Exibindo {data.groups.length} de {data.total} grupos. Filtre por rua, bairro ou período para restringir.</p>}
  </>;
}
