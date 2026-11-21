// Shared by the Edge worker, local import and contract tests. Never forward raw API objects.
export const SAPL_HOST = 'sapl.floresta.pe.leg.br';
export const SAPL_VERSION = 'floresta-1';
const definitions = [
  ['parliamentarians', 'parlamentares/parlamentar'], ['authors', 'base/autor'],
  ['parties', 'parlamentares/partido'], ['affiliations', 'parlamentares/filiacao'],
  ['legislatures', 'parlamentares/legislatura'], ['mandates', 'parlamentares/mandato'],
  ['matter_types', 'materia/tipomaterialegislativa'], ['statuses', 'materia/statustramitacao'],
  ['units', 'materia/unidadetramitacao'], ['authorships', 'materia/autoria'],
  ['proceedings', 'materia/tramitacao'], ['sessions', 'sessao/sessaoplenaria'],
  ['session_types', 'sessao/tiposessaoplenaria'], ['agenda', 'sessao/ordemdia'],
  ['expedient', 'sessao/expedientemateria'], ['ballot_types', 'sessao/tiporesultadovotacao'],
  ['ballots', 'sessao/registrovotacao'], ['votes', 'sessao/votoparlamentar'],
  ['attendance', 'sessao/sessaoplenariapresenca'], ['agenda_attendance', 'sessao/presencaordemdia'],
  ['norms', 'norma/normajuridica'], ['committees', 'comissoes/comissao'],
];
export const RESOURCE_KINDS = [...definitions.map(([kind]) => kind), 'matters'];
const integer = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const identifier = value => value !== null && value !== undefined && value !== '' && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const text = (value, max = 16000) => typeof value === 'string' ? value.replace(/<[^>]*>/g, ' ').replace(/&#(\d+);/g, (_, n) => Number(n) <= 0x10ffff ? String.fromCodePoint(Number(n)) : '').replace(/&(?:amp|nbsp|quot|lt|gt);/g, x => ({ '&amp;': '&', '&nbsp;': ' ', '&quot;': '"', '&lt;': '<', '&gt;': '>' }[x])).trim().slice(0, max) : '';
const date = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : null;
};
const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;

export function saplUrl(value, { external = false } = {}) {
  if (!value) return null;
  try {
    const url = new URL(value, `https://${SAPL_HOST}`);
    if (url.username || url.password || url.port || !['http:', 'https:'].includes(url.protocol)) return null;
    if (url.hostname !== SAPL_HOST && !(external && ['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname))) return null;
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

export function buildSaplPlan(firstYear = 2025, lastYear = new Date().getUTCFullYear()) {
  if (!Number.isInteger(firstYear) || !Number.isInteger(lastYear) || firstYear < 2000 || lastYear < firstYear || lastYear - firstYear > 30) throw Error('Período de coleta inválido.');
  const jobs = definitions.map(([kind, path]) => ({ key: kind, kind, path, params: kind === 'sessions' ? { data_inicio__gte: `${firstYear}-01-01` } : {} }));
  // The nested filters on authorships, proceedings, attendance and ballots are ignored
  // by this SAPL installation. Scan and reconcile them, then scope by parent IDs in SQL.
  return [...jobs, ...Array.from({ length: lastYear - firstYear + 1 }, (_, i) => ({ key: `matters-${firstYear + i}`, kind: 'matters', path: 'materia/materialegislativa', params: { ano: firstYear + i } }))];
}

export function normalizeSaplRow(kind, row) {
  if (!row || identifier(row.id) === null || !RESOURCE_KINDS.includes(kind)) throw Error('Registro SAPL inválido.');
  const id = Number(row.id);
  const names = () => ({ name: text(row.descricao || row.nome || row.__str__, 600), abbreviation: text(row.sigla, 80) });
  let data;
  switch (kind) {
    case 'parliamentarians': data = { name: text(row.nome_completo, 300), parliamentary_name: text(row.nome_parlamentar, 200), active: row.ativo === true, photo_url: saplUrl(row.fotografia) }; break;
    case 'authors': data = { name: text(row.nome || row.autor_related?.text, 500), type_id: integer(row.tipo), parliamentarian_id: row.tipo === 1 ? integer(row.autor_related?.value || row.object_id) : null }; break;
    case 'affiliations': data = { parliamentarian_id: integer(row.parlamentar), party_id: integer(row.partido), started_on: date(row.data), ended_on: date(row.data_desfiliacao) }; break;
    case 'legislatures': data = { number: integer(row.numero), started_on: date(row.data_inicio), ended_on: date(row.data_fim), label: text(row.__str__, 300) }; break;
    case 'mandates': data = { parliamentarian_id: integer(row.parlamentar), legislature_id: integer(row.legislatura), started_on: date(row.data_inicio_mandato), ended_on: date(row.data_fim_mandato), titular: row.titular === true }; break;
    case 'matters': data = { number: integer(row.numero), year: integer(row.ano), type_id: integer(row.tipo), presented_on: date(row.data_apresentacao), summary: text(row.ementa), document_url: saplUrl(row.texto_original), in_progress: row.em_tramitacao === true, author_ids: Array.isArray(row.autores) ? [...new Set(row.autores.map(integer).filter(Boolean))] : [], source_modified_at: text(row.data_ultima_atualizacao, 80) }; break;
    case 'authorships': data = { matter_id: integer(row.materia), author_id: integer(row.autor), first_author: row.primeiro_autor === true }; break;
    case 'proceedings': data = { matter_id: integer(row.materia), date: date(row.data_tramitacao), status_id: integer(row.status), from_unit_id: integer(row.unidade_tramitacao_local), to_unit_id: integer(row.unidade_tramitacao_destino), text: text(row.texto) }; break;
    case 'sessions': data = { number: integer(row.numero), date: date(row.data_inicio), end_date: date(row.data_fim), start_time: text(row.hora_inicio, 20), type_id: integer(row.tipo), legislature_id: integer(row.legislatura), label: text(row.__str__, 500), minutes_url: saplUrl(row.upload_ata), agenda_url: saplUrl(row.upload_pauta), video_url: saplUrl(row.url_video, { external: true }), finished: row.finalizada === true }; break;
    case 'agenda': case 'expedient': data = { session_id: integer(row.sessao_plenaria), matter_id: integer(row.materia), order: integer(row.numero_ordem), ballot_type: integer(row.tipo_votacao), result: text(row.resultado, 500) }; break;
    case 'ballots': data = { matter_id: integer(row.materia), agenda_id: integer(row.ordem), expedient_id: integer(row.expediente), result_id: identifier(row.tipo_resultado_votacao), yes: count(row.numero_votos_sim), no: count(row.numero_votos_nao), abstentions: count(row.numero_abstencoes) }; break;
    case 'votes': data = { ballot_id: integer(row.votacao), parliamentarian_id: integer(row.parlamentar), choice: text(row.voto, 100) }; break;
    case 'attendance': case 'agenda_attendance': data = { session_id: integer(row.sessao_plenaria), parliamentarian_id: integer(row.parlamentar) }; break;
    case 'norms': data = { matter_id: integer(row.materia), number: text(String(row.numero ?? ''), 80), year: integer(row.ano), date: date(row.data), type_id: integer(row.tipo), summary: text(row.ementa), document_url: saplUrl(row.texto_integral) }; break;
    case 'committees': data = { name: text(row.nome, 500), abbreviation: text(row.sigla, 100), active: row.ativa === true }; break;
    default: data = names();
  }
  if (kind === 'matters' && (!data.year || !data.type_id || !data.number || !data.presented_on)) throw Error(`Matéria ${id} sem identificação/data válida.`);
  return { kind, external_id: id, payload: data, source_url: `https://${SAPL_HOST}/${kind === 'matters' ? `materia/${id}` : kind === 'sessions' ? `sessao/${id}` : kind === 'parliamentarians' ? `parlamentar/${id}` : `api/${definitions.find(([key]) => key === kind)?.[1]}/${id}/`}` };
}

export async function fetchSaplPage(job, page = 1, { fetchImpl = fetch, timeoutMs = 25000 } = {}) {
  const allowed = buildSaplPlan(2025, 2025).some(item => item.kind === job.kind && item.path === job.path);
  if (!allowed || !integer(page)) throw Error('Recurso de coleta não autorizado.');
  const url = new URL(`https://${SAPL_HOST}/api/${job.path}/`);
  for (const [key, value] of Object.entries(job.params || {})) {
    if (!['ano', 'data_inicio__gte'].includes(key)) throw Error('Filtro de coleta não autorizado.');
    url.searchParams.set(key, String(value));
  }
  url.searchParams.set('page_size', '100');url.searchParams.set('page', String(page));url.searchParams.set('o', 'id');
  const response = await fetchImpl(url.href, { redirect: 'error', signal: AbortSignal.timeout(timeoutMs), headers: { Accept: 'application/json', 'User-Agent': 'TromboneCidadao-Legislative/1.0' } });
  if (!response.ok) {
    const error = new Error(`Fonte oficial retornou HTTP ${response.status}.`), retry = response.headers.get('retry-after');
    error.retryable = response.status === 429 || response.status >= 500;
    const seconds = /^\d+$/.test(retry || '') ? Number(retry) : Math.ceil((Date.parse(retry || '') - Date.now()) / 1000);
    error.retryAfter = Math.max(30, Math.min(86400, seconds || 60));throw error;
  }
  if (!response.headers.get('content-type')?.includes('application/json')) throw Error('A fonte não retornou JSON.');
  const reader = response.body.getReader();const chunks = [];let bytes = 0;
  for (;;) { const next = await reader.read();if (next.done) break;bytes += next.value.byteLength;if (bytes > 8 * 1024 * 1024) { await reader.cancel();throw Error('Página da fonte acima do limite.'); }chunks.push(next.value); }
  const buffer = new Uint8Array(bytes);let offset = 0;for (const chunk of chunks) { buffer.set(chunk, offset);offset += chunk.byteLength; }
  const body = JSON.parse(new TextDecoder().decode(buffer));const meta = body.pagination;
  if (!Array.isArray(body.results) || body.results.length > 100 || !meta || meta.page !== page || !Number.isSafeInteger(meta.total_entries) || meta.total_entries < 0 || meta.total_entries > 1000000 || !Number.isSafeInteger(meta.total_pages) || meta.total_pages < 0 || meta.total_pages > 10000 || page > Math.max(1, meta.total_pages) || (meta.total_entries > 0 && meta.total_pages === 0)) throw Error('Paginação da fonte inválida.');
  const nextPage = meta.next_page;
  if (nextPage != null && nextPage !== page + 1) throw Error('Paginação cíclica ou descontínua.');
  if (nextPage != null && nextPage > meta.total_pages) throw Error('Continuação acima do total de páginas.');
  if (nextPage != null && !body.results.length) throw Error('Página vazia com continuação.');
  const records = body.results.map(row => normalizeSaplRow(job.kind, row));
  if (new Set(records.map(row => row.external_id)).size !== records.length) throw Error('A fonte repetiu identificadores na mesma página.');
  if (job.kind === 'matters' && records.some(row => row.payload.year !== Number(job.params.ano))) throw Error('A fonte ignorou o filtro do ano.');
  if (job.kind === 'sessions' && records.some(row => row.payload.date < job.params.data_inicio__gte)) throw Error('A fonte ignorou o período de sessões.');
  return { page, total: meta.total_entries, next_page: nextPage, records, source_url: url.href };
}
