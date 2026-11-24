import React from 'react';
import { Link } from 'react-router-dom';
import { legislativePath } from '@/lib/legislative';

export default function LegislativeDirectory({ data, cityId, search = '', activeOnly = true, layout = 'cards' }) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const confirmed = data.membership?.complete === true;
  const people = data.parliamentarians.filter(person => (!activeOnly || person.current_mandate === true) && normalize(`${person.data.name} ${person.data.parliamentary_name}`).includes(normalize(search)));
  return <>
    <div className="legislative-section-heading"><h2>Vereadores <span className="legislative-result-count">{activeOnly && !confirmed ? '—' : people.length}</span></h2><span className="text-xs text-content-secondary">{activeOnly ? 'Mandato atual' : 'Todos os cadastros'}</span></div>
    {!confirmed && <p className="legislative-inline-warning" role="status">A identificação dos mandatos atuais aguarda atualização do acervo. Os registros históricos estão em “Todos os cadastros”.</p>}
    <div className="legislative-directory" data-layout={layout}>{people.map(person => <article className="legislative-panel legislative-person" key={person.id}>
      <div className="legislative-person-identity">
        {person.councilor?.photo_url || person.data.photo_url ? <img alt="" width={64} height={64} loading="lazy" src={person.councilor?.photo_url || person.data.photo_url} /> : <span className="legislative-person-avatar" aria-hidden="true">{person.data.name.charAt(0)}</span>}
        <div className="min-w-0"><h3>{person.data.parliamentary_name || person.data.name}</h3>{person.data.parliamentary_name && person.data.parliamentary_name !== person.data.name && <p>{person.data.name}</p>}<span className="legislative-person-registration">{person.current_mandate === true ? 'Mandato atual' : person.current_mandate === false ? 'Fora de exercício no período atual' : 'Mandato em conferência'}</span></div>
      </div>
      <div className="legislative-person-links"><Link className="legislative-person-primary" to={legislativePath(cityId, `/vereadores/${person.id}`)}>Ver atuação na Câmara</Link><div><a href={person.source_url} target="_blank" rel="noreferrer">Ficha oficial</a>{person.councilor && <Link to={`/vereadores/${cityId}/${person.councilor.slug}`}>Perfil no Trombone</Link>}</div></div>
    </article>)}</div>
    {!people.length && (!activeOnly || confirmed) && <p className="legislative-notice">Nenhum parlamentar encontrado neste filtro.</p>}
  </>;
}
