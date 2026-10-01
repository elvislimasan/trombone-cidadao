import { DEMAND_PRIORITIES, DEMAND_STATUSES, OPEN_DEMAND_STATUSES, demandReportLocations } from './municipalDemand.js';
import { municipalReportsQuery, REPORT_STATUSES, reportAge } from './municipalReports.js';

export const DEMAND_LIST_FIELDS = 'id,protocolo,titulo,bairro,endereco,prioridade,status,created_at,updated_at,prazo_em,previsto_em,primeira_resposta_prazo_em,primeira_resposta_em,report_id,atribuido_a,canal_id,revisao_pendente,proxima_acao,proxima_acao_em,category:categories(name),responsavel:profiles!demandas_municipais_atribuido_a_fkey(name),secretaria:orgao_canais(nome)';
export const EXPORT_DEFAULT_FILTERS = { query: '', statuses: [], responsible: 'all', channel: 'all', category: 'all', neighborhood: '', priority: 'all', age: 'all', orderLink: 'all', queue: 'all', overdue: false, dueToday: false, dateFrom: '', dateTo: '', sort: 'recentes' };
export const EXPORT_QUEUES = [['all', 'Todas as filas'], ['em_atendimento', 'Em andamento'], ['minhas', 'Minhas demandas'], ['sem_responsavel', 'Sem responsável'], ['revisao', 'Precisam de revisão'], ['primeira_resposta', 'Primeira resposta atrasada'], ['proxima_acao', 'Próxima ação em até 24h']];
export const exportLabel = (options, key) => options.find(([id]) => String(id) === String(key))?.[1] || key || 'Não informado';

function createdPeriod(request, filters) {
  if (filters.dateFrom) request = request.gte('created_at', new Date(filters.dateFrom + 'T00:00:00').toISOString());
  if (filters.dateTo) {
    const end = new Date(filters.dateTo + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    request = request.lt('created_at', end.toISOString());
  }
  return request;
}

export function municipalDemandsQuery(client, filters, { head = false, fields = DEMAND_LIST_FIELDS, count = 'exact' } = {}) {
  const sorts = { recentes: ['updated_at', false], antigas: ['created_at', true], prazo: ['prazo_em', true] };
  const [sortField, ascending] = sorts[filters.sort] || sorts.recentes;
  let request = client.from('demandas_municipais').select(head ? 'id' : fields, { count, head })
    .eq('prefeitura_id', filters.municipalityId).order(sortField, { ascending, nullsFirst: false }).order('id');
  if (filters.assignedOnly) request = request.eq('atribuido_a', filters.userId);
  if (filters.status && filters.status !== 'all') request = request.eq('status', filters.status);
  if (filters.statuses?.length) request = request.in('status', filters.statuses);
  if (filters.priority && filters.priority !== 'all') request = request.eq('prioridade', filters.priority);
  if (filters.channel && filters.channel !== 'all') request = request.eq('canal_id', filters.channel);
  if (filters.category && filters.category !== 'all') request = request.eq('category_id', filters.category);
  if (filters.neighborhood?.trim()) request = request.eq('bairro', filters.neighborhood.trim());
  if (filters.responsible === 'unassigned') request = request.is('atribuido_a', null);
  else if (filters.responsible && filters.responsible !== 'all') request = request.eq('atribuido_a', filters.responsible);
  const now = filters.now || new Date();
  if (filters.overdue) request = request.in('status', OPEN_DEMAND_STATUSES).lt('prazo_em', now.toISOString());
  if (filters.linked || filters.orderLink === 'linked') request = request.not('report_id', 'is', null);
  if (filters.orderLink === 'unlinked') request = request.is('report_id', null);
  if (filters.dueToday) {
    const start = new Date(now); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    request = request.in('status', OPEN_DEMAND_STATUSES).gte('prazo_em', start.toISOString()).lt('prazo_em', end.toISOString());
  }
  if (filters.queue === 'em_atendimento') request = request.in('status', OPEN_DEMAND_STATUSES.filter((id) => !['aberta', 'aguardando_confirmacao'].includes(id)));
  if (filters.queue === 'minhas') request = request.eq('atribuido_a', filters.userId);
  if (filters.queue === 'sem_responsavel') request = request.is('atribuido_a', null).in('status', OPEN_DEMAND_STATUSES);
  if (filters.queue === 'revisao') request = request.eq('revisao_pendente', true);
  if (filters.queue === 'primeira_resposta') request = request.is('primeira_resposta_em', null).lt('primeira_resposta_prazo_em', now.toISOString()).in('status', OPEN_DEMAND_STATUSES);
  if (filters.queue === 'proxima_acao') request = request.in('status', OPEN_DEMAND_STATUSES).lt('proxima_acao_em', new Date(now.getTime() + 86400000).toISOString());
  const term = (filters.query || '').trim().replace(/[%,()"'\\]/g, '');
  if (term) request = request.or(['titulo', 'protocolo', 'bairro', 'endereco'].map((field) => `${field}.ilike.%${term}%`).join(','));
  request = createdPeriod(request, filters);
  return filters.signal ? request.abortSignal(filters.signal) : request;
}

function checkAbort(signal) {
  if (signal?.aborted) throw new Error('Exportação cancelada.');
}

// Advance by the actual batch length: even a lower server row limit must not truncate exports.
export async function collectExportRows(makeRequest, { signal, onProgress } = {}) {
  const rows = [];
  for (let from = 0; ; ) {
    checkAbort(signal);
    const result = await makeRequest().range(from, from + 499);
    if (result.error) throw result.error;
    checkAbort(signal);
    const batch = result.data || [];
    if (!batch.length) break;
    rows.push(...batch);
    from += batch.length;
    onProgress?.(rows.length);
  }
  return rows;
}

export async function loadMunicipalExport(client, { kind, municipalityId, cityId, userId, filters, selectedIds = [], scope = 'filtered', signal, onProgress }) {
  const snapshot = { ...filters, municipalityId, cityId, userId, signal, now: new Date() };
  if (scope === 'selected' && !selectedIds.length) return [];
  // Chunk selected IDs as well, keeping request URLs below the gateway limit.
  const selectedChunks = scope === 'selected' ? Array.from({ length: Math.ceil(selectedIds.length / 100) }, (_, index) => selectedIds.slice(index * 100, index * 100 + 100)) : [null];
  let records = [];
  for (const ids of selectedChunks) {
    const previousCount = records.length;
    const select = (request) => ids ? request.in('id', ids) : request;
    const batch = await collectExportRows(() => {
      if (kind === 'demands') return select(municipalDemandsQuery(client, snapshot, { fields: DEMAND_LIST_FIELDS + ',descricao', count: undefined }));
      let request = municipalReportsQuery(client, { ...snapshot, status: 'all' }, 'id,protocol,title,description,address,neighborhood,created_at,status,category_id,category:categories(name)');
      if (filters.statuses?.length) request = request.in('status', filters.statuses);
      return select(request);
    }, { signal, onProgress: (count) => onProgress?.(previousCount + count) });
    records = records.concat(batch);
  }
  if (kind === 'demands') {
    const locations = new Map();
    for (let start = 0; start < records.length; start += 100) {
      const ids = records.slice(start, start + 100).map((item) => item.id);
      const links = await collectExportRows(() => {
        let request = client.from('demanda_broncas').select('demanda_id,report_id,report:reports(id,title,address,neighborhood)')
          .in('demanda_id', ids).order('demanda_id').order('report_id');
        return signal ? request.abortSignal(signal) : request;
      }, { signal });
      for (const link of links) {
        if (!locations.has(link.demanda_id)) locations.set(link.demanda_id, []);
        locations.get(link.demanda_id).push(...demandReportLocations([link.report || { id: link.report_id }]));
      }
    }
    checkAbort(signal);
    return sortExportRecords(records.map((item) => normalizeExportRecord({ ...item, linkedLocations: locations.get(item.id) || [] }, kind, snapshot.now)), filters.sort, kind);
  }

  const enriched = [];
  for (let from = 0; from < records.length; from += 500) {
    checkAbort(signal);
    const batch = records.slice(from, from + 500);
    let request = client.rpc('vinculos_broncas_prefeitura', { p_prefeitura: municipalityId, p_reports: batch.map((item) => item.id) });
    if (signal) request = request.abortSignal(signal);
    const result = await request;
    if (result.error) throw result.error;
    const links = new Map((result.data || []).map((link) => [link.report_id, link]));
    const orderIds = [...new Set((result.data || []).map((link) => link.demanda_id).filter(Boolean))];
    const orders = [];
    for (let start = 0; start < orderIds.length; start += 100) {
      const batchIds = orderIds.slice(start, start + 100);
      orders.push(...await collectExportRows(() => {
        let query = client.from('demandas_municipais').select('id,atribuido_a,canal_id,responsavel:profiles!demandas_municipais_atribuido_a_fkey(name),secretaria:orgao_canais(nome)').eq('prefeitura_id', municipalityId).in('id', batchIds).order('id');
        return signal ? query.abortSignal(signal) : query;
      }, { signal }));
    }
    const orderMap = new Map(orders.map((order) => [order.id, order]));
    for (const item of batch) {
      const link = links.get(item.id);
      const order = orderMap.get(link?.demanda_id);
      if (filters.orderLink === 'unlinked' && link) continue;
      if (filters.orderLink === 'linked' && !link) continue;
      if (filters.responsible === 'unassigned' && link && (!order || order.atribuido_a)) continue;
      if (filters.responsible && !['all', 'unassigned'].includes(filters.responsible) && order?.atribuido_a !== filters.responsible) continue;
      if (filters.channel && filters.channel !== 'all' && String(order?.canal_id) !== String(filters.channel)) continue;
      enriched.push(normalizeExportRecord({ ...item, order, link }, kind, snapshot.now));
    }
  }
  checkAbort(signal);
  return sortExportRecords(enriched, filters.sort, kind);
}

function sortExportRecords(records, sort, kind) {
  const key = sort === 'prazo' ? 'dueAt' : kind === 'demands' && sort !== 'antigas' ? 'updatedAt' : 'createdAt';
  return records.sort((a, b) => {
    if (!a[key] || !b[key]) return a[key] ? -1 : b[key] ? 1 : String(a.id).localeCompare(String(b.id));
    const difference = new Date(a[key]) - new Date(b[key]);
    return difference ? difference * (sort === 'recentes' || !sort ? -1 : 1) : String(a.id).localeCompare(String(b.id));
  });
}

export function normalizeExportRecord(item, kind, now = new Date()) {
  const demand = kind === 'demands';
  const assignment = demand ? item : item.order;
  const restricted = !demand && item.link && !item.order;
  const linkedLocations = demand ? item.linkedLocations || [] : [];
  return {
    id: item.id, reference: demand ? item.protocolo : item.protocol || item.id,
    title: (demand ? item.titulo : item.title) || 'Sem título',
    description: (demand ? item.descricao : item.description) || '',
    address: (demand ? item.endereco : item.address) || [...new Set(linkedLocations.map((location) => location.address).filter(Boolean))].join('; ') || 'Endereço não informado',
    neighborhood: (demand ? item.bairro : item.neighborhood) || [...new Set(linkedLocations.map((location) => location.neighborhood).filter(Boolean))].join('; ') || 'Bairro não informado',
    linkedLocations, serviceAddress: demand ? item.endereco || '' : '',
    category: item.category?.name || 'Sem categoria', statusId: item.status,
    status: exportLabel(demand ? DEMAND_STATUSES : REPORT_STATUSES, item.status),
    responsible: restricted ? 'Acesso restrito' : assignment?.responsavel?.name || 'Sem responsável',
    channel: restricted ? 'Acesso restrito' : assignment?.secretaria?.nome || 'Sem secretaria',
    priority: demand ? exportLabel(DEMAND_PRIORITIES, item.prioridade) : '',
    createdAt: item.created_at, updatedAt: item.updated_at, dueAt: item.prazo_em, forecastAt: item.previsto_em,
    age: reportAge(item.created_at, now), nextAction: item.proxima_acao || '', nextActionAt: item.proxima_acao_em,
    orderReference: item.link?.protocolo || 'Sem ordem', review: Boolean(item.revisao_pendente),
    overdue: demand && OPEN_DEMAND_STATUSES.includes(item.status) && Boolean(item.prazo_em) && new Date(item.prazo_em) < now,
  };
}

export function groupExportRecords(records, groupBy = 'none') {
  const groups = new Map();
  for (const record of records) {
    const name = groupBy === 'none' ? 'Todos os registros' : record[groupBy] || 'Não informado';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(record);
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b, 'pt-BR')).map(([name, rows]) => ({ name, rows }));
}

export function selectPageRecords(selectedIds, pageIds, checked) {
  return checked ? [...new Set([...selectedIds, ...pageIds])] : selectedIds.filter((id) => !pageIds.includes(id));
}
