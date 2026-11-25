import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ChevronLeft, ChevronRight, FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { legislativePath } from '@/lib/legislative';

export function LegislativeState({ query, onRetry }) {
  if (query.loading) return <div className="legislative-state" role="status"><Loader2 className="animate-spin" size={22} aria-hidden="true" />Consultando a Câmara…</div>;
  if (query.error) return <div className="legislative-state" role={query.error.notInstalled ? 'status' : 'alert'}><p>{query.error.notInstalled ? 'Dados da Câmara ainda não disponíveis.' : query.error.message}</p>{!query.error.notInstalled && <Button variant="outline" onClick={onRetry}>Tentar novamente</Button>}</div>;
  const message = { unconfigured: 'Integração oficial ainda não disponível nesta cidade.', pending: 'O acervo desta Câmara ainda não foi publicado.', missing: 'Registro não encontrado.' }[query.data?.state];
  return message ? <div className="legislative-state" role="status"><FileText size={26} aria-hidden="true" /><p>{message}</p></div> : null;
}

export function LegislativeSource({ source }) {
  if (!source) return null;
  return <div className="legislative-source"><a href={source.url} target="_blank" rel="noreferrer">{source.name}<ArrowUpRight size={14} aria-hidden="true" /></a><span>Coleta: {source.collected_at ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Fortaleza' }).format(new Date(source.collected_at)) : 'ainda não realizada'}</span>{source.stale && <span role="status">Atualização pendente · exibindo o último acervo conferido</span>}</div>;
}

export { default as LegislativeMetrics } from './LegislativeSummary';

export function LegislativeAuthors({ authors = [], cityId }) {
  return <div className="legislative-authors">{authors.length ? authors.map(author => author.parliamentarian_id ? <Link key={author.id} to={legislativePath(cityId, `/vereadores/${author.parliamentarian_id}`)}>{author.name}</Link> : author.councilor_id && author.slug ? <Link key={author.id} to={`/vereadores/${cityId}/${author.slug}`}>{author.name}</Link> : <span key={author.id}>{author.name || 'Autor não identificado'}</span>) : <span>Autoria não informada pela fonte</span>}</div>;
}

export { default as LegislativeMatterCard, LegislativeMatterList } from './LegislativeMatterCard';

export function LegislativePagination({ page, total, pageSize = 20, onChange }) {
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) return null;
  return <nav className="legislative-pagination" aria-label="Paginação legislativa"><span>{page} de {pages}</span><Button variant="outline" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} />Anterior</Button><Button variant="outline" disabled={page >= pages} onClick={() => onChange(page + 1)}>Próxima<ChevronRight size={16} /></Button></nav>;
}

export function LegislativeRelatedRecords({ records = [], onRemove, disabled = false }) {
  const status = { pending: 'Registrada', 'in-progress': 'Em atendimento', pending_resolution: 'Conclusão em análise', resolved: 'Registrada como resolvida no Trombone' };
  return <div className="legislative-list mt-4">{records.map(item => <article key={item.id} className="rounded-xl border p-4"><div className="flex flex-wrap items-center justify-between gap-3"><Link className="text-sm font-semibold text-brand" to={item.href}>{item.title}</Link>{onRemove && <Button size="sm" variant="outline" disabled={disabled} onClick={() => onRemove(item.id)}>Remover vínculo</Button>}</div>{item.kind === 'report' && <p className="mt-2 text-xs text-content-secondary">{status[item.status] || 'Registro público'}</p>}<p className="mt-2 text-sm">{item.note}</p></article>)}</div>;
}

export function LegislativeMethodology() {
  return <details id="metodo-legislativo" className="legislative-method"><summary>Como calculamos</summary><div><p>Contagens calculadas pelo Trombone a partir dos registros oficiais. Cada matéria conta uma vez, pela data de apresentação. Coautorias aparecem em cada perfil; somar os perfis pode ultrapassar o total da Câmara. Todas as pessoas e partidos seguem a mesma regra, sem nota ou ranking.</p><p>Os cinco grupos são exclusivos. Pareceres, autógrafos e atos de procedimento ficam em “Outros documentos”, mesmo quando tratam de homenagem. Entre as propostas, manifestações de pesar, parabéns, títulos, nomes de espaços públicos e datas comemorativas entram em “Homenagens”. Projetos de lei, resoluções, decretos e emendas restantes entram em “Propostas de lei”. Pedidos de informação, esclarecimento, prestação de contas e repúdio entram em “Perguntas e cobranças”. Pedidos de providência, indicações e demais requerimentos entram em “Melhorias nos bairros”. Os documentos restantes ficam em “Outros documentos”.</p><p>Classificação automática por tipo e palavras na ementa, sujeita a erro. Uma revisão com justificativa substitui a regra automática; a classificação é refeita se o documento mudar. Clique em cada grupo para conferir as propostas e seus links oficiais. O tipo original permanece visível.</p><p>Rua e bairro são buscados no texto e nas revisões, sem exigir acentos. Possíveis repetições agrupam pelo menos duas matérias com a mesma rua, bairro identificado e serviço; locais ambíguos não são unidos automaticamente. Extração textual não comprova a localização física. Cada grupo informa se houve revisão. Pedido repetido não prova que a Prefeitura ignorou nem que o serviço foi executado.</p><p>Votos e presenças são somente registros publicados. Placar agregado não identifica o voto individual; registro ausente não comprova falta. Não calculamos frequência sem conferir exercício e cobertura. A legislatura cadastrada como 2025–2026 requer conferência. Os contatos de perfis são os canais publicados pelo responsável.</p><p>Método legislative-2 · Grupos regras-1 · Locais texto-1. Acervo importado desde 2025. Dados oficiais da Câmara; organização e contagens pelo Trombone Cidadão.</p></div></details>;
}
