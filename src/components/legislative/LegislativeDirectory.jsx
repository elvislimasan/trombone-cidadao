import React from 'react';
import { Link } from 'react-router-dom';
import { legislativePath } from '@/lib/legislative';

export default function LegislativeDirectory({ data, cityId, search = '', activeOnly = true, layout = 'cards' }) {
  const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const people = data.parliamentarians.filter(person => (!activeOnly || person.data.active) && normalize(`${person.data.name} ${person.data.parliamentary_name}`).includes(normalize(search)));
  return <>
    <div className="legislative-section-heading"><h2>Vereadores <span className="legislative-result-count">{people.length}</span></h2><span className="text-xs text-content-secondary">{activeOnly ? 'Ativos no cadastro da Câmara' : 'Todos os cadastros'}</span></div>
    <div className="legislative-directory" data-layout={layout}>{people.map(person => <article className="legislative-panel legislative-person" key={person.id}>
      {person.councilor?.photo_url || person.data.photo_url ? <img alt="" loading="lazy" src={person.councilor?.photo_url || person.data.photo_url} /> : <span aria-hidden="true">{person.data.name.charAt(0)}</span>}
      <div className="min-w-0"><h2>{person.data.parliamentary_name || person.data.name}</h2><p>{person.data.name}</p><Link to={legislativePath(cityId, `/vereadores/${person.id}`)}>Ver atuação na Câmara</Link><a className="mt-2 block text-xs" href={person.source_url} target="_blank" rel="noreferrer">Ficha oficial</a>{person.councilor && <Link className="mt-2 block text-xs" to={`/vereadores/${cityId}/${person.councilor.slug}`}>Perfil no Trombone</Link>}</div>
    </article>)}</div>
    {!people.length && <p className="legislative-notice">Nenhum parlamentar encontrado neste filtro.</p>}
  </>;
}
