export const REPORT_STATUSES = [['pending', 'Aberta'], ['in-progress', 'Em andamento'], ['pending_resolution', 'Aguardando confirmação'], ['resolved', 'Resolvida']];
export const OPEN_REPORT_STATUSES = ['pending', 'in-progress'];
export const REPORT_PHASES = [
  ['pending', 'Pendentes', ['pending']],
  ['in_progress', 'Em andamento', ['in-progress', 'pending_resolution']],
  ['finished', 'Finalizadas', ['resolved']],
];
export const REPORT_AGES = [['all', 'Todas'], ['7', 'Até 7 dias'], ['15', '8–15 dias'], ['30', '16–30 dias'], ['older', '+30 dias']];
export const REPORT_PAGE_SIZES = [20, 50, 100];
const DAY = 86400000;
const BATCH_SIZE = 500;
const REPORT_FIELDS = 'id,title,address,neighborhood,created_at,status,category_id,issue_type,is_public,created_by_municipality,featured_image_url,report_media(url,type,created_at),category:categories(name)';

export function reportAge(value, now = new Date()) {
  const created = new Date(value);
  if (!value || !Number.isFinite(created.getTime())) return null;
  const calendarDay = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.max(0, Math.round((calendarDay(now) - calendarDay(created)) / DAY));
}

export function reportAgeBounds(age, now = new Date()) {
  const boundary = (days) => {
    const date = new Date(now);
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() - days);
    return date.toISOString();
  };
  if (age === '7') return { from: boundary(7) };
  if (age === '15') return { from: boundary(15), before: boundary(7) };
  if (age === '30') return { from: boundary(30), before: boundary(15) };
  if (age === 'older') return { before: boundary(30) };
  return {};
}

export function municipalReportsQuery(client, filters, fields = REPORT_FIELDS, options = {}) {
  let request = client.from('reports').select(fields, options)
    .eq('city_id', filters.cityId)
    .or('is_petition.eq.false,is_petition.is.null');
  if (filters.visibility === 'internal') request = request.eq('is_public', false);
  else if (filters.visibility === 'public') request = request.eq('is_public', true).or('moderation_status.eq.approved,moderation_status.is.null');
  else request = request.or('moderation_status.eq.approved,moderation_status.eq.internal,moderation_status.is.null' + (filters.municipalityId ? `,created_by_municipality.eq.${filters.municipalityId}` : ''));
  const phaseStatuses = REPORT_PHASES.find(([id]) => id === filters.phase)?.[2];
  request = phaseStatuses
    ? request.in('status', phaseStatuses)
    : filters.includeAllStatuses
      ? request.in('status', filters.statuses?.length ? filters.statuses : REPORT_STATUSES.map(([id]) => id))
      : request.eq('status', 'pending');
  if (filters.publicOnly) request = request.eq('is_public', true).eq('moderation_status', 'approved');
  if (filters.category && filters.category !== 'all') request = request.eq('category_id', filters.category);
  if (filters.issueType && filters.issueType !== 'all') request = request.eq('issue_type', filters.issueType);
  if (filters.status && filters.status !== 'all') request = request.eq('status', filters.status);
  if (filters.neighborhood && filters.neighborhood !== 'all') request = request.eq('neighborhood', filters.neighborhood);
  const bounds = reportAgeBounds(filters.age, filters.now);
  if (bounds.from) request = request.gte('created_at', bounds.from);
  if (bounds.before) request = request.lt('created_at', bounds.before);
  if (filters.dateFrom) request = request.gte('created_at', new Date(filters.dateFrom + 'T00:00:00').toISOString());
  if (filters.dateTo) {
    const end = new Date(filters.dateTo + 'T00:00:00');
    end.setDate(end.getDate() + 1);
    request = request.lt('created_at', end.toISOString());
  }
  const term = (filters.query || '').trim().replace(/[%,()"'\\]/g, '');
  if (term) request = request.or(['protocol', 'title', 'address', 'neighborhood', 'description'].map((field) => `${field}.ilike.%${term}%`).join(','));
  request = filters.sort === 'status_asc' || filters.sort === 'status_desc'
    ? request.order('status', { ascending: filters.sort === 'status_asc' }).order('created_at', { ascending: false }).order('id')
    : request.order('created_at', { ascending: filters.sort === 'antigas' }).order('id');
  return filters.signal ? request.abortSignal(filters.signal) : request;
}

async function reportLinks(client, municipalityId, ids, signal) {
  if (!ids.length) return [];
  let request = client.rpc('vinculos_broncas_prefeitura', { p_prefeitura: municipalityId, p_reports: ids });
  if (signal) request = request.abortSignal(signal);
  const result = await request;
  if (result.error) throw result.error;
  return result.data || [];
}

export async function loadMunicipalReportFacets(client, filters) {
  const { cityId, municipalityId, signal } = filters;
  const counts = { all: 0 };
  const visibilityCounts = { public: 0, internal: 0 };
  const phaseCounts = { pending: 0, in_progress: 0, finished: 0 };
  const neighborhoods = new Set();
  const neighborhoodCounts = {};
  for (let from = 0; ; from += BATCH_SIZE) {
    // Count each tab without applying its own selected category or phase.
    const result = await municipalReportsQuery(client, { ...filters, category: 'all', visibility: 'all', phase: undefined, status: 'all' }, 'id,category_id,neighborhood,status,moderation_status,is_public,created_by_municipality').range(from, from + BATCH_SIZE - 1);
    if (result.error) throw result.error;
    const candidates = result.data || [];
    const links = filters.includeLinked ? [] : await reportLinks(client, municipalityId, candidates.map((item) => item.id), signal);
    const linked = new Set(links.map((item) => item.report_id));
    for (const item of candidates) {
      if (linked.has(item.id)) continue;
      const visibility = item.created_by_municipality && item.is_public === false ? 'internal'
        : item.is_public === true && (item.moderation_status === 'approved' || item.moderation_status == null) ? 'public' : null;
      if (!visibility) continue;
      const phase = REPORT_PHASES.find(([, , statuses]) => statuses.includes(item.status))?.[0];
      if (!phase) continue;
      if (!filters.phase || phase === filters.phase) visibilityCounts[visibility]++;
      if (filters.visibility && filters.visibility !== 'all' && filters.visibility !== visibility) continue;
      phaseCounts[phase]++;
      if (filters.phase && phase !== filters.phase) continue;
      counts.all++;
      if (item.category_id) counts[item.category_id] = (counts[item.category_id] || 0) + 1;
      const neighborhood = item.neighborhood?.trim();
      if (neighborhood) {
        neighborhoods.add(neighborhood);
        neighborhoodCounts[neighborhood] = (neighborhoodCounts[neighborhood] || 0) + 1;
      }
    }
    if (candidates.length < BATCH_SIZE) break;
  }
  // Inclui bairros cadastrados mesmo quando as broncas antigas ainda não têm
  // neighborhood. Mantém nomes já gravados que não estão mais no cadastro.
  for (let from = 0; ; from += BATCH_SIZE) {
    let request = client.from('bairros').select('name').eq('city_id', cityId).order('name').range(from, from + BATCH_SIZE - 1);
    if (signal) request = request.abortSignal(signal);
    const result = await request;
    if (result.error) throw result.error;
    for (const item of result.data || []) {
      const name = item.name?.trim();
      if (name) neighborhoods.add(name);
    }
    if ((result.data || []).length < BATCH_SIZE) break;
  }
  return { counts, visibilityCounts, phaseCounts, neighborhoodCounts, neighborhoods: [...neighborhoods].sort((a, b) => a.localeCompare(b, 'pt-BR')) };
}

export async function loadMunicipalReportPage(client, filters, page, pageSize) {
  const start = (page - 1) * pageSize;
  // Check links before pagination, including orders outside the user's department.
  let total = 0;
  const pageIds = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const result = await municipalReportsQuery(client, filters, 'id').range(from, from + BATCH_SIZE - 1);
    if (result.error) throw result.error;
    const candidates = result.data || [];
    const links = filters.includeLinked ? [] : await reportLinks(client, filters.municipalityId, candidates.map((item) => item.id), filters.signal);
    const linked = new Set(links.map((item) => item.report_id));
    for (const item of candidates) {
      if (linked.has(item.id)) continue;
      if (total >= start && pageIds.length < pageSize) pageIds.push(item.id);
      total++;
    }
    if (candidates.length < BATCH_SIZE) break;
  }
  if (!pageIds.length) return { reports: [], total, links: [] };
  const result = await municipalReportsQuery(client, filters).in('id', pageIds);
  if (result.error) throw result.error;
  const links = filters.includeLinked ? await reportLinks(client, filters.municipalityId, pageIds, filters.signal) : [];
  return { reports: result.data || [], total, links };
}

export async function loadPendingMapReports(client, filters, fields = 'id,title,address,neighborhood,location,created_at,status,category:categories(name)') {
  const reports = [];
  for (let from = 0; ; from += BATCH_SIZE) {
    const result = await municipalReportsQuery(client, filters, fields).range(from, from + BATCH_SIZE - 1);
    if (result.error) throw result.error;
    const candidates = result.data || [];
    const links = await reportLinks(client, filters.municipalityId, candidates.map((item) => item.id), filters.signal);
    const linked = new Set(links.map((item) => item.report_id));
    reports.push(...candidates.filter((item) => !linked.has(item.id)));
    if (candidates.length < BATCH_SIZE) break;
  }
  return reports;
}

export function reportPageNumbers(page, pages) {
  const values = [...new Set([1, page - 1, page, page + 1, pages])].filter((value) => value >= 1 && value <= pages).sort((a, b) => a - b);
  return values.flatMap((value, index) => index && value - values[index - 1] > 1 ? [`gap-${value}`, value] : [value]);
}
