import { municipalReportsQuery, REPORT_PHASES } from './municipalReports.js';
import { municipalContextPath } from './municipalAccess.js';

export function attendanceOverviewScope(context) {
  const enabled = context.enabledCategoryIds || [];
  if (context.isAdministrator && !context.activeChannelId) return enabled;
  const readable = new Set((context.readableChannelIds || []).map(String));
  return enabled.filter(category => (context.categoryChannels || []).some(mapping => mapping.category_id === category
    && (context.isAdministrator || readable.has(String(mapping.canal_id)))
    && (!context.activeChannelId || String(mapping.canal_id) === String(context.activeChannelId))));
}

export function overviewWeekDays(now = new Date()) {
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, index) => {
    const start = new Date(today); start.setDate(start.getDate() + index - 6);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    return { label: start.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', ''), date: start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }), start: start.toISOString(), end: end.toISOString(), value: 0 };
  });
}

export function overviewReportPath(context, { phase, visibility, category } = {}) {
  const params = new URLSearchParams();
  if (phase) params.set('fase', phase);
  if (visibility === 'internal') params.set('visibilidade', 'internas');
  const ids = attendanceOverviewScope(context);
  const selectedCategory = category || (ids.length === 1 ? ids[0] : '');
  if (selectedCategory) params.set('categoria', selectedCategory);
  const matching = (context.categoryChannels || []).filter(mapping => mapping.category_id === selectedCategory && context.readableChannelIds?.includes(String(mapping.canal_id)));
  const channel = context.activeChannelId || (!context.isAdministrator && matching.length === 1 ? matching[0].canal_id : '');
  return municipalContextPath('/prefeitura/broncas?' + params, context.municipality.city_id, channel);
}

export async function loadAttendanceOverview(client, { municipalityId, cityId, categoryIds, signal, now = new Date() }) {
  const emptyCounts = () => Object.fromEntries(REPORT_PHASES.map(([id]) => [id, { total: 0, public: 0, internal: 0 }]));
  const result = { total: 0, phases: emptyCounts(), categories: categoryIds.map(id => ({ id, total: 0, phases: emptyCounts() })), days: overviewWeekDays(now) };
  if (!categoryIds.length) return result;
  const categories = new Map(result.categories.map(category => [category.id, category]));
  const abort = () => { if (signal?.aborted) throw new DOMException('Consulta cancelada.', 'AbortError'); };
  for (let from = 0; ; ) {
    abort();
    const response = await municipalReportsQuery(client, { municipalityId, cityId, enabledCategoryIds: categoryIds, includeAllStatuses: true, visibility: 'all', signal },
      'id,city_id,category_id,status,is_public,moderation_status,created_by_municipality,created_at').range(from, from + 499);
    abort();
    if (response.error) throw response.error;
    const rows = response.data || [];
    if (!rows.length) break;
    for (const row of rows) {
      if (String(row.city_id) !== String(cityId) || !categories.has(row.category_id)) continue;
      const phase = REPORT_PHASES.find(([, , statuses]) => statuses.includes(row.status))?.[0];
      const visibility = row.is_public === true && (row.moderation_status == null || row.moderation_status === 'approved') ? 'public'
        : row.is_public === false && row.created_by_municipality === municipalityId && ['internal', 'approved', null, undefined].includes(row.moderation_status) ? 'internal' : null;
      if (!phase || !visibility) continue;
      const category = categories.get(row.category_id);
      result.total++; category.total++;
      for (const counts of [result.phases[phase], category.phases[phase]]) { counts.total++; counts[visibility]++; }
      const created = Date.parse(row.created_at);
      const day = result.days.find(item => created >= Date.parse(item.start) && created < Date.parse(item.end));
      if (day) day.value++;
    }
    // Some projects cap responses below the requested range size.
    from += rows.length;
  }
  return result;
}
