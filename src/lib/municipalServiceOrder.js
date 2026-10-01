import { canEditDemand, DEMAND_INITIAL_FORM, demandPayload, suggestDemandAssignment } from './municipalDemand.js';
import { collectExportRows } from './municipalExport.js';
import { municipalReportsQuery, OPEN_REPORT_STATUSES } from './municipalReports.js';

export const SERVICE_ORDER_INSTRUCTION = 'Realizar vistoria/ronda nos locais relacionados abaixo e executar ou avaliar os serviços necessários.';
const REPORT_FIELDS = 'id,protocol,title,description,address,neighborhood,created_at,status,category_id,location,issue_type,pole_number,pole_id,category:categories(name)';

async function selectedReports(client, context, ids, signal) {
  const rows = [];
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    rows.push(...await collectExportRows(() => municipalReportsQuery(client, { cityId: context.municipality.city_id, includeAllStatuses: true, statuses: OPEN_REPORT_STATUSES, sort: 'antigas', signal }, REPORT_FIELDS).in('id', batch), { signal }));
  }
  return rows;
}

export async function loadServiceOrderSelection(client, context, ids, signal) {
  const reports = await selectedReports(client, context, ids, signal);
  const links = [];
  for (let start = 0; start < ids.length; start += 500) {
    let request = client.rpc('vinculos_broncas_prefeitura', { p_prefeitura: context.municipality.id, p_reports: ids.slice(start, start + 500) });
    if (signal) request = request.abortSignal(signal);
    const result = await request;
    if (result.error) throw result.error;
    links.push(...(result.data || []));
  }
  const poles = await loadOrderPoles(client, context.municipality.city_id, reports, signal);
  const byId = new Map(reports.map((report) => [report.id, { ...report, pole: poles.get(report.pole_id) }]));
  const linked = new Map(links.map((link) => [link.report_id, link]));
  return ids.map((id) => ({ id, report: byId.get(id), link: linked.get(id) }));
}

async function loadOrderPoles(client, cityId, reports, signal) {
  const ids = [...new Set(reports.map((report) => report.pole_id).filter((id) => id != null))];
  const poles = [];
  for (let start = 0; start < ids.length; start += 100) {
    const batch = ids.slice(start, start + 100);
    poles.push(...await collectExportRows(() => {
      let request = client.from('poles').select('id,identifier,plate,address,latitude,longitude,lighting_status').eq('city_id', cityId).in('id', batch).order('id');
      return signal ? request.abortSignal(signal) : request;
    }, { signal }));
  }
  return new Map(poles.map((pole) => [pole.id, pole]));
}

export function serviceOrderDraft(reports, context) {
  const categories = [...new Set(reports.map((report) => report.category_id).filter(Boolean))];
  const issueTypes = [...new Set(reports.map((report) => report.issue_type).filter(Boolean))];
  const neighborhoods = [...new Set(reports.map((report) => report.neighborhood).filter(Boolean))];
  const categoryId = categories.length === 1 ? categories[0] : '';
  const category = context.categories.find((item) => item.id === categoryId)?.name;
  const title = [category ? `Atendimento de ${category}` : 'Atendimento de ocorrências', neighborhoods.length === 1 ? neighborhoods[0] : `${reports.length} ocorrências`].join(' · ');
  return { ...DEMAND_INITIAL_FORM, ...suggestDemandAssignment(context, categoryId), titulo: title.slice(0, 180), category_id: categoryId, issue_type: issueTypes.length === 1 ? issueTypes[0] : '', bairro: neighborhoods.length === 1 ? neighborhoods[0] : '', prioridade: context.serviceRules?.find((rule) => rule.category_id === categoryId)?.prioridade || 'normal', origem: 'bronca' };
}

export async function createMunicipalServiceOrder(client, { context, id, selection, title, channelId, responsibleId, priority, issueType, observation }) {
  if (!context.canEdit || (channelId ? !canEditDemand(context, channelId) : !context.isAdministrator)) throw new Error('Escolha uma secretaria em que você pode registrar o serviço.');
  if (!selection.length || selection.some((item) => !item.report || item.link || !OPEN_REPORT_STATUSES.includes(item.report.status))) throw new Error('Remova as ocorrências indisponíveis ou já vinculadas antes de criar a ordem.');
  if (title.trim().length < 3 || title.trim().length > 180) throw new Error('Informe um título com 3 a 180 caracteres.');
  const form = { ...serviceOrderDraft(selection.map((item) => item.report), context), titulo: title, canal_id: channelId, atribuido_a: responsibleId || '', prioridade: priority, issue_type: issueType || '', status: 'aberta', descricao: observation.trim() };
  let result;
  try {
    result = await client.rpc('salvar_demanda_municipal', {
      p_prefeitura: context.municipality.id, p_id: id, p_versao: null,
      p_dados: demandPayload(form), p_reports: selection.map((item) => item.id),
      p_anexos: [], p_resposta_publica: null, p_nota_interna: null, p_motivo: null,
    });
  } catch (error) { result = { error }; }
  if (result.error) {
    // Recover an acknowledged-late write after a lost response; reuse the same UUID.
    // Never register a second order merely because its first download or response failed.
    try {
      const existing = await client.from('demandas_municipais').select('*').eq('prefeitura_id', context.municipality.id).eq('id', id).maybeSingle();
      if (existing.data?.criado_por === context.userId) {
        const links = await collectExportRows(() => client.from('demanda_broncas').select('report_id').eq('demanda_id', id).order('report_id'));
        const linkedIds = new Set(links.map((link) => link.report_id));
        if (linkedIds.size === selection.length && selection.every((item) => linkedIds.has(item.id))) return existing.data;
      }
    } catch { /* Preserve the original save error when recovery is unavailable. */ }
    throw result.error;
  }
  return result.data;
}

export async function loadMunicipalServiceOrder(client, context, id) {
  const detail = await client.from('demandas_municipais').select('*,secretaria:orgao_canais(nome),responsavel:profiles!demandas_municipais_atribuido_a_fkey(name),criador:profiles!demandas_municipais_criado_por_fkey(name),category:categories(name)')
    .eq('prefeitura_id', context.municipality.id).eq('id', id).maybeSingle();
  if (detail.error) throw detail.error;
  if (!detail.data) throw new Error('Ordem não encontrada ou sem permissão de acesso.');
  // Links are paginated too: a large work order must remain complete when reprinted.
  const links = await collectExportRows(() => client.from('demanda_broncas').select('report:reports(' + REPORT_FIELDS + ')').eq('demanda_id', id).order('report_id'), {});
  const reports = links.map((link) => link.report).filter(Boolean);
  const poles = await loadOrderPoles(client, context.municipality.city_id, [...reports, { pole_id: detail.data.pole_id }]);
  return { order: { ...detail.data, pole: poles.get(detail.data.pole_id) }, reports: reports.map((report) => ({ ...report, pole: poles.get(report.pole_id) })) };
}

export function serviceOrderCoordinates(report) {
  const [longitude, latitude] = report.location?.coordinates || [];
  const lat = latitude ?? report.location?.lat ?? report.pole?.latitude;
  const lng = longitude ?? report.location?.lng ?? report.pole?.longitude;
  return lat != null && lng != null && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? `${Number(lat).toFixed(6)}, ${Number(lng).toFixed(6)}` : 'Não informado';
}
