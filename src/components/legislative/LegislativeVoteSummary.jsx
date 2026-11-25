import React from 'react';
import { ArrowUpRight } from 'lucide-react';

const count = value => value == null ? '—' : new Intl.NumberFormat('pt-BR').format(value);

export default function LegislativeVoteSummary({ query, onRetry }) {
  const data = query.data?.state === 'ready' ? query.data : null;
  return <section className="legislative-vote-summary" aria-label="Como votou no período" aria-busy={query.loading}>
    <h2>Como votou no período</h2>
    <dl>{[['yes', 'vezes sim'], ['no', 'vezes não'], ['abstentions', 'abstenções'], ['other', 'outros registros']].map(([key, label]) => <div key={key} data-vote={key}><dt>{label}</dt><dd>{count(data?.votes?.[key])}</dd></div>)}</dl>
    {query.loading ? <p role="status">Carregando votos…</p> : query.error ? <p role="status">Resumo de votos indisponível. <button type="button" onClick={onRetry}>Tentar novamente</button></p> : !data?.votes_complete ? <p>Votos individuais aguardam atualização do acervo.</p> : <p>{count(data.votes.total)} votos individuais publicados. Sem registro não significa que não votou.</p>}
    <a className="legislative-snapshot-source" href="https://sapl.floresta.pe.leg.br/sistema/relatorios/votacoes_nominais" target="_blank" rel="noreferrer">Fonte dos votos<ArrowUpRight size={13} aria-hidden="true" /></a>
  </section>;
}
