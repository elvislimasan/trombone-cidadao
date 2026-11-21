export const LEGISLATIVE_TOPICS = { homenagem: 'Homenagens e denominações', servicos_urbanos: 'Serviços urbanos', saude: 'Saúde', educacao: 'Educação', fiscalizacao: 'Fiscalização', orcamento: 'Orçamento', outros: 'Outros' };
export const LEGISLATIVE_GROUPS = { melhorias: 'Melhorias nos bairros', cobrancas: 'Perguntas e cobranças', homenagens: 'Homenagens', leis: 'Propostas de lei', outros: 'Outros documentos' };
export const LEGISLATIVE_SERVICES = { poda: 'Poda', limpeza: 'Limpeza', iluminacao: 'Iluminação', esgoto: 'Esgoto', pavimentacao: 'Pavimentação', agua: 'Abastecimento de água', outros: 'Outros' };
export const LEGISLATIVE_METHOD = 'legislative-2';
export const legislativeDate = value => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : 'Não informada';
export const legislativePath = (cityId, suffix = '') => `/camara/${Number(cityId)}${suffix}`;
// Only omit a recognized request introduction. The visible excerpt remains an
// exact substring, including negations; the detail page keeps the entire source.
export function legislativePreview(summary, group) {
  if (!summary || summary.length < 240 || !['melhorias', 'cobrancas'].includes(group)) return summary || '';
  const marker = /\b(?:no sentido de|com o objetivo de|a fim de)\s+/i.exec(summary);
  if (!marker || marker.index < 80) return summary;
  return `… ${summary.slice(marker.index + marker[0].length).trim()}`;
}
export function legislativeOfficialSearch(filters = {}, authorIds = []) {
  const url = new URL('https://sapl.floresta.pe.leg.br/materia/pesquisar-materia');
  if (filters.start) url.searchParams.set('data_apresentacao_0', filters.start.split('-').reverse().join('/'));
  if (filters.end) url.searchParams.set('data_apresentacao_1', filters.end.split('-').reverse().join('/'));
  if (authorIds.length === 1) url.searchParams.set('autoria__autor', String(authorIds[0]));
  if (filters.typeId) url.searchParams.set('tipo', String(filters.typeId));
  url.searchParams.set('pesquisar', 'Pesquisar');
  return url.href;
}
export function legislativeOfficialPresence(filters = {}, terms = []) {
  const url = new URL('https://sapl.floresta.pe.leg.br/sistema/relatorios/presenca');
  const legislatures = [...new Set(terms.filter(term => (!term.data.started_on || term.data.started_on <= filters.end) && (!term.data.ended_on || term.data.ended_on >= filters.start)).map(term => term.data.legislature_id).filter(Boolean))];
  if (legislatures.length === 1) { url.searchParams.set('legislatura', String(legislatures[0]));url.searchParams.set('tipo', '');url.searchParams.set('exibir_ordem_dia', 'on'); }
  if (filters.start) url.searchParams.set('data_inicio_0', filters.start.split('-').reverse().join('/'));
  if (filters.end) url.searchParams.set('data_inicio_1', filters.end.split('-').reverse().join('/'));
  return url.href;
}
export function legislativeMatterFilters(filters = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries({ inicio: filters.start, fim: filters.end, busca: filters.search, grupo: filters.group, territorio: filters.territory, parlamentar: filters.parliamentarianId, vereador: filters.councilorId, tipo: filters.typeId, tema: filters.topic })) if (value != null && value !== '') params.set(key, String(value));
  return params;
}
export function legislativeRecordTarget(value) {
  try {
    const url = new URL(value.trim(), 'https://trombone.invalid');
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    const match = url.pathname.match(/^\/(bronca|mapa-pavimentacao\/rua)\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})\/?$/i);
    return match ? { kind: match[1] === 'bronca' ? 'report' : 'street', target_id: match[2] } : null;
  } catch { return null; }
}
export function legislativeFilters(params, firstYear = 2025) {
  const currentYear = new Date().getFullYear();
  const date = (key, fallback) => {
    const value = params.get(key) || '', parsed = new Date(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? value : fallback;
  };
  const start = date('inicio', `${firstYear}-01-01`), end = date('fim', new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' }));
  return { start, end, search: (params.get('busca') || '').slice(0, 200), territory: (params.get('territorio') || '').trim().slice(0, 200), group: Object.hasOwn(LEGISLATIVE_GROUPS, params.get('grupo')) ? params.get('grupo') : null, parliamentarianId: /^[1-9]\d*$/.test(params.get('parlamentar') || '') && Number.isSafeInteger(Number(params.get('parlamentar'))) ? Number(params.get('parlamentar')) : null, typeId: /^\d+$/.test(params.get('tipo') || '') ? Number(params.get('tipo')) : null, councilorId: /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(params.get('vereador') || '') ? params.get('vereador') : null, topic: Object.hasOwn(LEGISLATIVE_TOPICS, params.get('tema')) ? params.get('tema') : null, page: Math.max(1, Math.min(100000, Math.floor(Number(params.get('pagina'))) || 1)), currentYear };
}
export async function legislativeRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    const absent = ['PGRST202', '42P01', '42883'].includes(error.code);
    const failure = new Error(absent ? 'A integração legislativa ainda não foi instalada neste ambiente.' : error.code === 'P0001' ? error.message : 'Não foi possível consultar os dados legislativos. Tente novamente.');
    failure.notInstalled = absent;throw failure;
  }
  return data;
}
