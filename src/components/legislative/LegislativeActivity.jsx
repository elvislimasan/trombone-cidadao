import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowUpRight, CalendarDays, FileText, Vote } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import useLegislativeData from '@/hooks/useLegislativeData';
import { legislativeDate, legislativeMatterFilters, legislativeOfficialPresence, legislativeOfficialSearch, legislativePath } from '@/lib/legislative';
import { LegislativeMatterList, LegislativeMetrics, LegislativeState } from './LegislativeComponents';
import LegislativePageInfo from './LegislativePageInfo';
import LegislativeCharts from './LegislativeCharts';
import LegislativeAttendance from './LegislativeAttendance';

export default function LegislativeActivity({ data, cityId, councilorId, parliamentarianId, filters, showSource = true, presentation }) {
  const [params] = useSearchParams();
  const [tab, setTab] = useState(() => params.get('aba') === 'presencas' ? 'attendance' : 'matters'), [revision, setRevision] = useState(0);
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
          {presentation?.summary !== false && <LegislativeCharts data={data} cityId={cityId} filters={scoped} officialHref={official} />}
          <LegislativeMatterList matters={data.matters.slice(0, 3)} cityId={cityId} layout={presentation?.layout || 'cards'} />
          {!data.total && <p className="legislative-notice">Nenhuma proposta deste parlamentar registrada no recorte consultado.</p>}
          <Link className="legislative-more-link" to={path}>Ver todas as propostas ({data.total})<ArrowUpRight size={15} /></Link>
        </> : <>
          <LegislativeState query={activity} onRetry={() => setRevision(value => value + 1)} />
          {activity.data?.state === 'ready' && (tab === 'votes' ? <section className="legislative-panel">
            <div className="legislative-section-heading"><h2>{activity.data.votes.total} {activity.data.votes.total === 1 ? 'voto individual publicado' : 'votos individuais publicados'}</h2><a href="https://sapl.floresta.pe.leg.br/sistema/relatorios/votacoes_nominais" target="_blank" rel="noreferrer">Fonte oficial<ArrowUpRight size={14} /></a></div>
            <p className="legislative-inline-warning">Sem registro individual não significa que o parlamentar não votou.</p>
            <ul className="legislative-timeline legislative-vote-list">{activity.data.votes.items.map(vote => <li key={vote.id}><header><time>{legislativeDate(vote.date)}</time><strong>Voto: {vote.choice || 'Não informado'}</strong></header>{vote.matter ? <div className="legislative-voted-matter"><span><FileText size={15} aria-hidden="true" />{vote.matter.type_abbreviation || vote.matter.type_name || 'Matéria'} {vote.matter.number}/{vote.matter.year}</span><h3><Link to={legislativePath(cityId, `/materias/${vote.matter.id}`)} title={vote.matter.summary}>{vote.matter.summary || vote.matter.type_name || 'Ementa não informada pela fonte'}</Link></h3><Link className="legislative-text-link" to={legislativePath(cityId, `/materias/${vote.matter.id}`)}>Ver matéria<ArrowUpRight size={14} aria-hidden="true" /></Link></div> : <div className="legislative-voted-matter"><p>Matéria não disponível neste acervo.</p>{vote.matter_url && <a className="legislative-text-link" href={vote.matter_url} target="_blank" rel="noreferrer">Ver matéria na Câmara<ArrowUpRight size={14} aria-hidden="true" /></a>}</div>}<footer><Link to={legislativePath(cityId, `/sessoes/${vote.session_id}`)}>Ver sessão</Link><a href={vote.source_url} target="_blank" rel="noreferrer">Fonte do voto<ArrowUpRight size={14} aria-hidden="true" /></a></footer></li>)}</ul>
            <details className="legislative-count-help"><summary>Sobre a contagem</summary><p>Contagem do Trombone de registros nominais disponíveis no período. Exibindo até 50; o total considera todos. Resultados gerais sem voto individual não entram.</p></details>
          </section> : <div className="legislative-attendance-profile"><LegislativeAttendance cityId={cityId} filters={filters} personId={parliamentarianId} councilorId={councilorId} /><section className="legislative-panel">
            <div className="legislative-section-heading"><h2>{activity.data.attendance.total} {activity.data.attendance.total === 1 ? 'presença registrada' : 'presenças registradas'} em sessão</h2><a href={legislativeOfficialPresence(filters, activity.data.terms)} target="_blank" rel="noreferrer">Relatório oficial<ArrowUpRight size={14} /></a></div>
            <p className="legislative-inline-warning">Registro ausente não comprova falta.</p>
            <p className="text-xs text-content-secondary">{activity.data.agenda_attendance.total} presenças na ordem do dia</p>
            <ul className="legislative-timeline">{activity.data.attendance.items.map(item => <li key={item.session_id}><time>{legislativeDate(item.date)}</time><Link className="text-sm font-semibold text-brand" to={legislativePath(cityId, `/sessoes/${item.session_id}`)}>{item.label}</Link>{item.source_url && <a className="ml-3 text-xs text-brand" href={item.source_url} target="_blank" rel="noreferrer">Fonte</a>}</li>)}</ul>
            <details className="legislative-count-help"><summary>Sobre a contagem</summary><p>Contagem do Trombone sem percentual de frequência. Exibindo até 50 registros; o total considera todos no período. Exercício, suplências e cobertura precisam de conferência.</p></details>
          </section></div>)}
        </>}
      </TabsContent>
    </Tabs>
    {showSource && <LegislativePageInfo cityId={cityId} source={data.source} />}
  </>;
}
