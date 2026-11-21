import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, FileText, Vote } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import useLegislativeData from '@/hooks/useLegislativeData';
import { legislativeDate, legislativeMatterFilters, legislativeOfficialPresence, legislativeOfficialSearch, legislativePath } from '@/lib/legislative';
import { LegislativeMatterList, LegislativeMetrics, LegislativeState } from './LegislativeComponents';
import LegislativePageInfo from './LegislativePageInfo';

export default function LegislativeActivity({ data, cityId, councilorId, parliamentarianId, filters, showSource = true, presentation }) {
  const [tab, setTab] = useState('matters'), [revision, setRevision] = useState(0);
  const scoped = { ...filters, ...(parliamentarianId ? { parliamentarianId } : { councilorId }) };
  const activity = useLegislativeData(tab !== 'matters' ? cityId : null, parliamentarianId ? 'parliamentarian_activity' : 'activity', {
    start: filters.start, end: filters.end, councilor_id: councilorId, parliamentarian_id: parliamentarianId,
  }, revision);
  const official = legislativeOfficialSearch(filters, data.parliamentarian?.author_ids || []);
  const path = legislativePath(cityId, `/materias?${legislativeMatterFilters(scoped)}`);
  return <>
    <Tabs value={tab} onValueChange={setTab} className="legislative-activity">
      <div className="legislative-activity-heading"><TabsList className="legislative-activity-tabs" aria-label="Atuação na Câmara">
        <TabsTrigger value="matters"><FileText size={15} />Propostas</TabsTrigger><TabsTrigger value="votes"><Vote size={15} />Votos</TabsTrigger><TabsTrigger value="attendance"><CalendarDays size={15} />Presenças</TabsTrigger>
      </TabsList>{showSource && <span className="legislative-period-caption">{legislativeDate(filters.start)} – {legislativeDate(filters.end)}</span>}</div>
      <TabsContent value={tab}>
        {tab === 'matters' ? <>
          {presentation?.summary !== false && <LegislativeMetrics metrics={data.metrics} groups={data.groups} cityId={cityId} filters={scoped} officialHref={official} />}
          <LegislativeMatterList matters={data.matters.slice(0, 3)} cityId={cityId} layout={presentation?.layout || 'cards'} />
          {!data.total && <p className="legislative-notice">Nenhuma proposta deste parlamentar registrada no recorte consultado.</p>}
          <Link className="legislative-more-link" to={path}>Ver todas as propostas ({data.total})<ArrowUpRight size={15} /></Link>
        </> : <>
          <LegislativeState query={activity} onRetry={() => setRevision(value => value + 1)} />
          {activity.data?.state === 'ready' && (tab === 'votes' ? <section className="legislative-panel">
            <div className="legislative-section-heading"><h2>{activity.data.votes.total} {activity.data.votes.total === 1 ? 'voto individual publicado' : 'votos individuais publicados'}</h2><a href="https://sapl.floresta.pe.leg.br/sistema/relatorios/votacoes_nominais" target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight size={14} /></a></div>
            <p className="legislative-inline-warning">Sem registro individual não significa que o parlamentar não votou.</p>
            <ul className="legislative-timeline">{activity.data.votes.items.map(vote => <li key={vote.id}><time>{legislativeDate(vote.date)}</time><strong>{vote.choice}</strong><div className="flex flex-wrap gap-4"><Link className="text-sm text-brand" to={legislativePath(cityId, `/sessoes/${vote.session_id}`)}>Ver sessão</Link><a className="text-xs text-brand" href={vote.source_url} target="_blank" rel="noreferrer">Fonte do voto</a></div></li>)}</ul>
            <details className="legislative-count-help"><summary>Sobre a contagem</summary><p>Contagem do Trombone de registros nominais disponíveis no período. Exibindo até 50; o total considera todos. Resultados gerais sem voto individual não entram.</p></details>
          </section> : <section className="legislative-panel">
            <div className="legislative-section-heading"><h2>{activity.data.attendance.total} {activity.data.attendance.total === 1 ? 'presença registrada' : 'presenças registradas'} em sessão</h2><a href={legislativeOfficialPresence(filters, activity.data.terms)} target="_blank" rel="noreferrer">Relatório oficial<ArrowUpRight size={14} /></a></div>
            <p className="legislative-inline-warning">Registro ausente não comprova falta.</p>
            <p className="text-xs text-content-secondary">{activity.data.agenda_attendance.total} presenças na ordem do dia</p>
            <ul className="legislative-timeline">{activity.data.attendance.items.map(item => <li key={item.session_id}><time>{legislativeDate(item.date)}</time><Link className="text-sm font-semibold text-brand" to={legislativePath(cityId, `/sessoes/${item.session_id}`)}>{item.label}</Link>{item.source_url && <a className="ml-3 text-xs text-brand" href={item.source_url} target="_blank" rel="noreferrer">Fonte</a>}</li>)}</ul>
            <details className="legislative-count-help"><summary>Sobre a contagem</summary><p>Contagem do Trombone sem percentual de frequência. Exibindo até 50 registros; o total considera todos no período. Exercício, suplências e cobertura precisam de conferência.</p></details>
          </section>)}
        </>}
      </TabsContent>
    </Tabs>
    {showSource && <LegislativePageInfo cityId={cityId} source={data.source} />}
  </>;
}
