import React, { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, Check, HelpCircle, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import useLegislativeData from '@/hooks/useLegislativeData';
import useIsMobile from '@/hooks/useIsMobile';
import { legislativeDate, legislativeMatterFilters, legislativeOfficialPresence, legislativePath } from '@/lib/legislative';
import { LegislativeState } from './LegislativeComponents';

const count = value => value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value);
const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function LegislativeAttendance({ cityId, filters, personId, councilorId }) {
  const heading = useId(), searchId = useId();
  const limit = useIsMobile() ? 3 : 6;
  const [revision, setRevision] = useState(0), [search, setSearch] = useState(''), [expanded, setExpanded] = useState(false);
  const query = useLegislativeData(cityId, 'attendance_summary', { start: filters.start, end: filters.end, parliamentarian_id: personId || filters.parliamentarianId, councilor_id: councilorId || filters.councilorId }, revision);
  const data = query.data, ready = data?.state === 'ready';
  const people = data?.people || [], matched = people
    .filter(person => fold(`${person.name} ${person.full_name}`).includes(fold(search)))
    .sort((a, b) => (b.presences ?? -1) - (a.presences ?? -1) || a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }) || a.id - b.id);
  const visible = expanded ? matched : matched.slice(0, limit);
  const largest = Math.max(1, ...people.map(person => (person.presences || 0) + (person.justified || 0)));
  const official = legislativeOfficialPresence(filters, (data?.legislature_ids || []).map(id => ({ data: { legislature_id: id } })));
  return <section className="legislative-attendance-panel" aria-labelledby={heading}>
    <header className="legislative-section-heading"><h2 id={heading}><CalendarDays size={20} aria-hidden="true" />Presenças e faltas</h2><div className="legislative-attendance-context"><span>{legislativeDate(filters.start)} – {legislativeDate(filters.end)}</span>{ready && <a href={official} target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight size={14} aria-hidden="true" /></a>}</div></header>
    <LegislativeState query={query} onRetry={() => setRevision(value => value + 1)} />
    {data?.state === 'unlinked' && <p className="legislative-notice">O vínculo com o cadastro da Câmara ainda não foi confirmado.</p>}
    {ready && <>
      <dl className="legislative-attendance-stats">{[
        ['Sessões no período', data.sessions, CalendarDays, 'sessions'],
        ['Presenças registradas', data.totals.presences, Check, 'presences'],
        ['Ausências justificadas', data.totals.justified, CalendarDays, 'justified'],
        ['Faltas não justificadas', data.totals.unexcused, HelpCircle, 'unexcused'],
      ].map(([label, value, Icon, key]) => <div key={key} data-kind={key}><Icon size={20} aria-hidden="true" /><dt>{label}</dt><dd>{count(value)}</dd></div>)}</dl>
      <p className="legislative-attendance-notice"><HelpCircle size={16} aria-hidden="true" />Faltas sem justificativa não confirmadas pela fonte. Registro ausente não comprova falta.</p>
      {!data.absence_complete && <p className="legislative-inline-warning" role="status">Ausências justificadas aguardam atualização do acervo.</p>}
      {!data.presence_complete && <p className="legislative-inline-warning" role="status">Presenças aguardam atualização do acervo.</p>}
      {data.totals.conflicts > 0 && <p className="legislative-inline-warning" role="status">Há registros de presença e ausência na mesma sessão. Eles exigem conferência e não entram nas ausências.</p>}
      {people.length > 1 && <div className="legislative-attendance-search"><label className="sr-only" htmlFor={searchId}>Buscar vereador nas presenças</label><Search size={17} aria-hidden="true" /><input id={searchId} type="search" name="buscar-presencas" placeholder="Buscar vereador" autoComplete="off" value={search} onChange={event => setSearch(event.target.value)} /></div>}
      {visible.length ? <div className="legislative-attendance-table"><table aria-label="Presenças e ausências por vereador"><thead><tr><th scope="col">Vereador</th><th scope="col">Registros no período</th><th scope="col">Presenças</th><th scope="col">Justificadas</th><th scope="col">Não justificadas</th><th scope="col"><span className="sr-only">Detalhes</span></th></tr></thead><tbody>{visible.map(person => {
        const href = legislativePath(cityId, `/vereadores/${person.id}?${legislativeMatterFilters({ start: filters.start, end: filters.end })}&aba=presencas`);
        return <tr key={person.id}>
          <th scope="row"><Link to={href}><span className="legislative-attendance-avatar" aria-hidden="true">{person.name.charAt(0)}</span>{person.name}</Link></th>
          <td data-label="Registros no período"><div className="legislative-attendance-bar" role="img" aria-label={`${count(person.presences)} presenças; ${count(person.justified)} ausências justificadas`}><span data-kind="presences" style={{ width: `${(person.presences || 0) / largest * 100}%` }} /><span data-kind="justified" style={{ width: `${(person.justified || 0) / largest * 100}%` }} /></div></td>
          <td data-label="Presenças" data-kind="presences">{count(person.presences)}</td><td data-label="Justificadas" data-kind="justified">{count(person.justified)}</td><td data-label="Não justificadas">{count(person.unexcused)}</td>
          <td><Link className="legislative-text-link" to={href}>Ver registros<ArrowUpRight size={14} aria-hidden="true" /></Link></td>
        </tr>;
      })}</tbody></table></div> : <p className="legislative-empty-copy">{search ? 'Nenhum vereador encontrado nesta busca.' : 'Nenhum registro de parlamentar disponível neste período.'}</p>}
      <footer className="legislative-attendance-footer"><div className="legislative-attendance-legend"><span><i data-kind="presences" />Presenças</span><span><i data-kind="justified" />Ausências justificadas</span></div>{matched.length > limit && <Button variant="ghost" onClick={() => setExpanded(value => !value)}>{expanded ? 'Mostrar menos' : `Ver todos os vereadores (${matched.length})`}</Button>}</footer>
    </>}
  </section>;
}
