import React, { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import useLegislativeData from '@/hooks/useLegislativeData';
import { legislativeDate, legislativeOfficialPresence } from '@/lib/legislative';
import { legislativePresenceRatio, legislativeSalaryBase } from '@/lib/legislativeProfile';

const count = value => value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value);

export default function LegislativeProfileSnapshot({ data, cityId, filters, parliamentarianId, councilorId }) {
  const [revision, setRevision] = useState(0);
  const query = useLegislativeData(cityId, 'attendance_summary', { start: filters.start, end: filters.end, parliamentarian_id: parliamentarianId, councilor_id: councilorId }, revision);
  const attendance = query.data?.state === 'ready' ? query.data : null;
  const person = attendance?.people?.find(person => parliamentarianId ? person.id === parliamentarianId : true);
  const ratio = legislativePresenceRatio(attendance, person), salary = legislativeSalaryBase(cityId, filters);
  return <section className="legislative-profile-snapshot" aria-label="Resumo do vereador">
    <div className="legislative-presence-highlight" aria-busy={query.loading}>
      <div className="legislative-presence-donut"><svg viewBox="0 0 80 80" aria-hidden="true"><circle className="legislative-presence-track" cx="40" cy="40" r="33" fill="none" strokeWidth="9" /><circle cx="40" cy="40" r="33" fill="none" strokeWidth="9" pathLength="100" strokeDasharray={`${ratio ?? 0} 100`} transform="rotate(-90 40 40)" /></svg><strong data-full={ratio === 100}>{ratio === null ? '—' : <span>{ratio}<span className="legislative-presence-unit">%</span></span>}</strong></div>
      <div><h3><strong>{count(person?.presences)} de {count(attendance?.sessions)}</strong> sessões no período</h3><p>{count(person?.justified)} {person?.justified === 1 ? 'ausência justificada' : 'ausências justificadas'}</p><span className="legislative-snapshot-period">Presenças / sessões · {legislativeDate(filters.start)} – {legislativeDate(filters.end)}</span></div>
    </div>
    {query.loading && <p className="legislative-snapshot-status" role="status">Carregando presenças…</p>}
    {query.error && <p className="legislative-snapshot-status" role="status">Não foi possível carregar as presenças. <button type="button" onClick={() => setRevision(value => value + 1)}>Tentar novamente</button></p>}
    {!query.loading && !query.error && !attendance && <p className="legislative-snapshot-status">Presenças ainda indisponíveis neste acervo.</p>}
    {attendance && (!attendance.presence_complete || !attendance.absence_complete || person?.conflicts > 0) && <p className="legislative-inline-warning">{person?.conflicts > 0 ? 'Há registros conflitantes; percentual em conferência.' : 'Cobertura dos registros em atualização.'}</p>}
    <dl className="legislative-profile-facts"><div><dt>{salary ? 'salário-base mensal · 2025' : 'salário-base mensal'}</dt><dd>{salary ? <a href={salary.source} target="_blank" rel="noreferrer" aria-label="Salário-base mensal: R$ 10.432. Ver Resolução 8/2023">{new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(salary.amount)}<ArrowUpRight size={13} aria-hidden="true" /></a> : 'Não informado'}</dd></div><div><dt>propostas no período</dt><dd>{count(data.metrics?.matters)}</dd></div></dl>
    <details className="legislative-snapshot-method"><summary>Fontes e cálculo da presença</summary><p>Percentual de presenças registradas sobre as sessões do período consultado. Não considera automaticamente afastamentos, suplências ou tempo de mandato. Registro ausente não comprova falta.</p><a href={legislativeOfficialPresence(filters, (attendance?.legislature_ids || []).map(id => ({ data: { legislature_id: id } })))} target="_blank" rel="noreferrer">Relatório de presenças<ArrowUpRight size={13} aria-hidden="true" /></a>{salary && <p>{salary.reference}. Subsídio previsto na resolução, antes de descontos. Revisões anuais e valores efetivamente pagos não estão confirmados por este indicador.</p>}</details>
  </section>;
}
