import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronRight } from 'lucide-react';
import { legislativeDate, legislativePath, legislativePreview, LEGISLATIVE_GROUPS } from '@/lib/legislative';
import { LegislativeAuthors } from './LegislativeComponents';

export default function LegislativeMatterCard({ matter, cityId }) {
  const preview = legislativePreview(matter.data.summary, matter.data.group_key);
  return <article className="legislative-matter-card" data-group={matter.data.group_key || 'outros'}>
    <div className="legislative-matter-meta"><span className="legislative-type">{matter.type_data?.abbreviation || 'Matéria'} {matter.data.number}/{matter.data.year}</span><time dateTime={matter.data.presented_on}>{legislativeDate(matter.data.presented_on)}</time></div>
    {matter.data.group_key && <div className="legislative-card-group"><span>{LEGISLATIVE_GROUPS[matter.data.group_key]}</span><span className={matter.data.group_method === 'revisado' ? 'is-reviewed' : ''}>{matter.data.group_method === 'revisado' ? 'Revisado' : 'Estimativa'}</span></div>}
    <h3><Link to={legislativePath(cityId, `/materias/${matter.id}`)} title={matter.data.summary}>{preview || 'Ementa não informada pela fonte'}<ChevronRight className="legislative-card-arrow" size={18} aria-hidden="true" /></Link></h3>
    <div className="legislative-matter-bottom"><LegislativeAuthors authors={matter.authors} cityId={cityId} /><a href={matter.source_url} target="_blank" rel="noreferrer" aria-label={`Fonte oficial da matéria ${matter.data.number}/${matter.data.year}`}>Fonte<ArrowUpRight size={15} aria-hidden="true" /></a></div>
  </article>;
}

export function LegislativeMatterList({ matters = [], cityId, layout = 'cards' }) {
  return <div className="legislative-matter-feed" data-layout={layout}>{matters.map(matter => <LegislativeMatterCard key={matter.id} matter={matter} cityId={cityId} />)}</div>;
}
