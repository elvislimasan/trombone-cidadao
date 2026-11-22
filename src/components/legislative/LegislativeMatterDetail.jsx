import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { legislativeDate, legislativePath, LEGISLATIVE_GROUPS, LEGISLATIVE_TOPICS } from '@/lib/legislative';
import { LegislativeAuthors, LegislativeRelatedRecords } from './LegislativeComponents';
import { LegislativeVoteGraphic } from './LegislativeCharts';

const count = value => value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value);

export default function LegislativeMatterDetail({ data, cityId }) {
  const { user } = useAuth();
  const matter = data.matter;
  return <>
    {/* A largura de leitura é limitada apenas na ementa, mantendo o painel fluido. */}
    <section className="legislative-panel legislative-document-summary">
      <div className="legislative-matter-meta">
        <span className="legislative-type">{matter.type_data.name} {matter.data.number}/{matter.data.year}</span>
        <time dateTime={matter.data.presented_on}>{legislativeDate(matter.data.presented_on)}</time>
      </div>
      {matter.data.group_key && <p className="legislative-document-category">{LEGISLATIVE_GROUPS[matter.data.group_key]} <span>· {matter.data.group_method === 'revisado' ? 'Revisado' : 'Estimativa automática'}</span></p>}
      <h2 className="legislative-detail-title">{matter.data.summary}</h2>
      <LegislativeAuthors authors={matter.authors} cityId={cityId} />
      <div className="legislative-detail-actions">
        {matter.data.document_url && <Button asChild><a href={matter.data.document_url} target="_blank" rel="noreferrer"><FileText size={16} aria-hidden="true" />Documento original</a></Button>}
        <Button asChild variant="outline"><a href={matter.source_url} target="_blank" rel="noreferrer">Ver na Câmara<ArrowUpRight size={16} aria-hidden="true" /></a></Button>
        {(user?.is_admin || user?.is_master) && <Button asChild variant="outline"><Link to={`/admin/legislativo?cidade=${cityId}&materia=${matter.id}`}>Revisar classificação</Link></Button>}
      </div>
      {matter.annotation?.topic && <p className="legislative-notice">Tema revisado: {LEGISLATIVE_TOPICS[matter.annotation.topic]}</p>}
    </section>
    <div className="legislative-columns legislative-document-columns">
      <section className="legislative-panel">
        <h2>Tramitação</h2>
        {!data.proceedings.length ? <p className="legislative-empty-copy">Nenhuma tramitação publicada neste acervo.</p> : <ol className="legislative-timeline">{data.proceedings.map(item => <li key={item.id}>
          <time dateTime={item.data.date}>{legislativeDate(item.data.date)}</time>
          <strong>{item.status || 'Movimentação registrada'}</strong><p>{item.data.text}</p>
          <a className="legislative-text-link" href={item.source_url} target="_blank" rel="noreferrer">Ver registro oficial</a>
        </li>)}</ol>}
      </section>
      <aside className="legislative-list">
        <section className="legislative-panel">
          <h2>Votações registradas</h2>
          {!data.ballots.length && <p className="legislative-empty-copy">Nenhum resultado publicado neste acervo.</p>}
          {data.ballots.map(ballot => <div className="legislative-ballot" key={ballot.id}>
            <strong className="legislative-ballot-result">{ballot.result || 'Resultado não informado'}</strong>
            <LegislativeVoteGraphic votes={ballot.data} />
            <div className="legislative-vote-tally">{[['yes', 'favoráveis'], ['no', 'contrários'], ['abstentions', 'abstenções']].map(([key, label]) => <span key={key}><strong>{count(ballot.data[key])}</strong> {label}</span>)}</div>
            {ballot.session_id && <Link className="legislative-text-link" to={legislativePath(cityId, `/sessoes/${ballot.session_id}`)}>Ver sessão</Link>}
            {ballot.votes.length ? <details><summary>Votos nominais publicados ({ballot.votes.length})</summary><ul>{ballot.votes.map((vote, i) => <li key={i}><span>{vote.name}</span><a href={vote.source_url} target="_blank" rel="noreferrer">{vote.choice}<span className="sr-only"> · fonte oficial</span></a></li>)}</ul></details> : <p className="legislative-inline-warning">Sem votos individuais publicados neste acervo.</p>}
          </div>)}
          <p className="legislative-notice">O placar geral não permite deduzir o voto de cada vereador.</p>
        </section>
        {data.norms.length > 0 && <section className="legislative-panel"><h2>Normas relacionadas</h2><ul className="legislative-timeline">{data.norms.map(norm => <li key={norm.id}><time>{legislativeDate(norm.data.date)}</time><p>{norm.data.summary}</p><a href={norm.source_url} target="_blank" rel="noreferrer" className="legislative-text-link">Norma {norm.data.number}/{norm.data.year}</a></li>)}</ul></section>}
      </aside>
    </div>
    {data.related?.length > 0 && <section className="legislative-panel legislative-related-section"><h2>Registros relacionados</h2><LegislativeRelatedRecords records={data.related} /><p className="legislative-notice">Vínculos revisados. Não comprovam execução do serviço nem autoria do atendimento.</p></section>}
  </>;
}
