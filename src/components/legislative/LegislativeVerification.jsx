import React from 'react';
import { Link } from 'react-router-dom';
import report from '@/data/legislativeVerification.json';
import { legislativeDate, legislativePath } from '@/lib/legislative';

const resultLabel = comparison => comparison.matches === true ? 'Confere' : comparison.matches === false ? 'Divergência' : 'Não confirmado';

export default function LegislativeVerification({ cityId, source }) {
  if (Number(cityId) !== report.city_id || !source?.run_id) return null;
  return <details className="legislative-method"><summary>Conferência dos dados</summary><div>
    <p>Amostra comparada com as páginas e o relatório oficial da Câmara em {legislativeDate(report.verified_at)}. Período: {legislativeDate(report.period.start)} a {legislativeDate(report.period.end)}.</p>
    {source.run_id !== report.run_id && <p role="status">A conferência se refere a uma coleta anterior. O acervo atual ainda não recebeu essa mesma comparação.</p>}
    <p><a className="text-brand underline" href={report.sessions.official_url} target="_blank" rel="noreferrer">Sessões: Trombone {report.sessions.trombone} · Câmara {report.sessions.official ?? 'não confirmado'} · {resultLabel(report.sessions)}</a></p>
    <div className="legislative-admin-table"><table><thead><tr><th>Parlamentar</th><th>Matérias Trombone / Câmara</th><th>Presenças em sessão Trombone / Câmara</th><th>Presenças na ordem do dia Trombone / Câmara</th></tr></thead><tbody>{report.people.map(person => <tr key={person.id}><td><Link className="text-brand" to={legislativePath(cityId, `/vereadores/${person.id}`)}>{person.name}</Link></td>{['matters', 'attendance', 'agenda_attendance'].map(key => <td key={key}><a className="text-brand underline" href={person[key].official_url} target="_blank" rel="noreferrer">{person[key].trombone} / {person[key].official ?? 'não confirmado'} · {resultLabel(person[key])}</a></td>)}</tr>)}</tbody></table></div>
    <p>O relatório separado de matérias por autor retornou erro 500 na conferência. As contagens de matérias foram comparadas com a pesquisa oficial, vinculada na tabela.</p>
    <ul className="list-disc pl-5">{report.limitations.map(note => <li key={note}>{note}</li>)}</ul>
  </div></details>;
}
