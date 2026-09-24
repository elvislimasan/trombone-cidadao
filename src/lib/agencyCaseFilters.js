export const AGENCY_SORTS = [
  { id: 'antigas', label: 'Broncas mais antigas' },
  { id: 'recentes', label: 'Atualizadas recentemente' },
  { id: 'novas', label: 'Broncas mais recentes' },
  { id: 'prazo', label: 'Prazo mais próximo' },
];

// Faixas fixas permitem comparar regiões mesmo depois de alterar os filtros.
export const AGENCY_AREA_LEVELS = [
  { max: 3, label: 'Baixa', range: '1–3 abertas', color: '#2563eb', opacity: 0.18 },
  { max: 9, label: 'Moderada', range: '4–9 abertas', color: '#ca8a04', opacity: 0.24 },
  { max: 19, label: 'Alta', range: '10–19 abertas', color: '#ea580c', opacity: 0.30 },
  { max: Infinity, label: 'Muito alta', range: '20 ou mais abertas', color: '#b91c1c', opacity: 0.38 },
];
export const agencyAreaLevel = (count) => AGENCY_AREA_LEVELS.find((level) => count <= level.max) || AGENCY_AREA_LEVELS.at(-1);

export function createAgencyCasesQuery(client, select, filters) {
  const search = String(filters.search || '').trim();
  const searchJoins = search ? ',report_search:reports!orgao_casos_report_id_fkey(),canal_search:orgao_canais!orgao_casos_canal_id_fkey()' : '';
  // Consulta direta preserva RLS e permite filtros em reports. O endpoint RPC
  // SETOF existente falha ao combinar !inner com filtros da relação embutida.
  let query = client.from('orgao_casos').select(select + searchJoins, { count: 'exact' });
  if (filters.channelId !== 'all') query = query.eq('canal_id', filters.channelId);
  if (filters.statusFilter === 'abertas') query = query.not('status', 'in', '(encerrada,recusada)');
  else if (filters.statusFilter !== 'all') query = query.eq('status', filters.statusFilter);
  if (search) {
    const pattern = JSON.stringify(`%${search.replace(/[\\%_]/g, '\\$&')}%`);
    query = query.or(`title.ilike.${pattern},address.ilike.${pattern},neighborhood.ilike.${pattern}`, { foreignTable: 'report_search' })
      .ilike('canal_search.nome', `%${search.replace(/[\\%_]/g, '\\$&')}%`)
      .or(`protocolo.ilike.${pattern},report_search.not.is.null,canal_search.not.is.null`);
  }
  return applyAgencyFilters(query, filters);
}

// Aplicados ao conjunto inteiro no PostgREST, antes de range(). O relacionamento
// report deve usar !inner para filtros de categoria/data eliminarem a demanda.
export function applyAgencyFilters(query, filters, now = new Date()) {
  if (filters.category && filters.category !== 'all') query = query.eq('report.category_id', filters.category);
  if (filters.priority && filters.priority !== 'all') query = query.eq('prioridade', filters.priority);
  if (filters.assignment === 'minhas' && filters.userId) query = query.eq('atribuido_a', filters.userId);
  if (filters.assignment === 'sem') query = query.is('atribuido_a', null);
  if (filters.overdue) query = query.lt('prazo_em', now.toISOString()).not('status', 'in', '(encerrada,recusada)');
  if ([7, 30, 90].includes(Number(filters.age))) {
    query = query.lte('report.created_at', new Date(now.getTime() - Number(filters.age) * 86400000).toISOString());
  }
  if (filters.sort === 'antigas' || filters.sort === 'novas') {
    query = query.order('report(created_at)', { ascending: filters.sort === 'antigas', nullsFirst: false });
  } else if (filters.sort === 'prazo') {
    query = query.order('prazo_em', { ascending: true, nullsFirst: false });
  } else {
    query = query.order('updated_at', { ascending: false });
  }
  return query.order('report_id', { ascending: true });
}

export function agencyCasePoint(item) {
  const location = item.report?.location;
  const coordinates = location?.type === 'Point' ? location.coordinates : null;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;
  const [lng, lat] = coordinates;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return [lat, lng];
}

export const isAgencyCaseOpen = (item) => !['encerrada', 'recusada'].includes(item.status);
export const isAgencyCaseOverdue = (item, now = Date.now()) => isAgencyCaseOpen(item)
  && Boolean(item.prazo_em) && new Date(item.prazo_em).getTime() < now;

// Grade fixa de aproximadamente 500 m. Mede concentração de registros abertos,
// não gravidade presumida. Inclui a cidade na chave para não misturar municípios.
export function agencyAttentionAreas(cases, now = Date.now()) {
  const groups = new Map();
  for (const item of cases) {
    if (!isAgencyCaseOpen(item)) continue;
    const point = agencyCasePoint(item);
    if (!point) continue;
    const [lat, lng] = point;
    const latCell = Math.floor(lat * 111320 / 500);
    const latitude = (latCell + 0.5) * 500 / 111320;
    const factor = Math.max(0.01, Math.cos(latitude * Math.PI / 180));
    const lngCell = Math.floor(lng * 111320 * factor / 500);
    const key = `${item.canal?.city_id || ''}:${latCell}:${lngCell}`;
    const group = groups.get(key) || { key, center: [latitude, (lngCell + 0.5) * 500 / (111320 * factor)], count: 0, overdue: 0, oldestDays: 0, neighborhoods: new Set() };
    group.count += 1;
    group.overdue += Number(isAgencyCaseOverdue(item, now));
    const age = Math.floor((now - new Date(item.report?.created_at).getTime()) / 86400000);
    if (Number.isFinite(age)) group.oldestDays = Math.max(group.oldestDays, age);
    if (item.report?.neighborhood) group.neighborhoods.add(item.report.neighborhood);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({ ...group, label: [...group.neighborhoods].join(' / ') || 'Área sem bairro informado' }))
    .sort((a, b) => b.count - a.count || b.overdue - a.overdue || b.oldestDays - a.oldestDays);
}

// Busca todos os lotes visíveis à conta. Não apresenta mapa parcial em caso de
// erro. Cancela logicamente requisições antigas quando os filtros mudam.
export async function loadAgencyMapCases(queryFactory, isCurrent = () => true) {
  const cases = new Map();
  const batch = 500;
  for (let offset = 0; ; offset += batch) {
    if (!isCurrent()) return null;
    const result = await queryFactory().range(offset, offset + batch - 1);
    if (!isCurrent()) return null;
    if (result.error) throw result.error;
    for (const item of result.data || []) cases.set(item.report_id, item);
    if ((result.data || []).length < batch) return [...cases.values()];
  }
}
