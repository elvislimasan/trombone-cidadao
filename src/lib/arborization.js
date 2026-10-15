export const TREE_STATUS = {
  saudavel: { label: 'Saudável', color: '#15803d' },
  atencao: { label: 'Precisa de atenção', color: '#b45309' },
  risco: { label: 'Em risco', color: '#b91c1c' },
  removida: { label: 'Removida', color: '#64748b' },
};

export const TREE_ORIGINS = { nativa: 'Nativa', exotica: 'Exótica', nao_identificada: 'Não identificada' };
export const TREE_ACTIONS = { nenhuma: 'Sem manejo pendente', vistoria: 'Vistoria', poda: 'Poda', tratamento: 'Tratamento', remocao: 'Avaliação para remoção', plantio: 'Reposição / plantio' };

export const EMPTY_TREE = {
  common_name: '', scientific_name: '', origin: 'nao_identificada', status: 'saudavel',
  address: '', neighborhood: '', latitude: '', longitude: '', height_m: '', crown_diameter_m: '',
  planted_at: '', maintenance_action: 'nenhuma', maintenance_due_at: '', notes: '',
};

const normalize = value => String(value || '').normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase();
const optionalNumber = value => String(value ?? '').trim() === '' ? null : Number(String(value).replace(',', '.'));

export function treePayload(form, cityId) {
  if (!cityId || !/^\d+$/.test(String(cityId))) throw new Error('Selecione uma cidade para cadastrar a árvore.');
  if (!form.common_name?.trim()) throw new Error('Informe o nome popular ou uma identificação para a árvore.');
  const latitude = optionalNumber(form.latitude);
  const longitude = optionalNumber(form.longitude);
  if (latitude === null || longitude === null || !Number.isFinite(latitude) || !Number.isFinite(longitude)
    || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) throw new Error('Marque uma localização válida no mapa.');
  const height = optionalNumber(form.height_m);
  const crown = optionalNumber(form.crown_diameter_m);
  if ([height, crown].some(value => value !== null && (!Number.isFinite(value) || value <= 0))) throw new Error('As medidas devem ser maiores que zero.');
  if (!TREE_STATUS[form.status] || !TREE_ORIGINS[form.origin] || !TREE_ACTIONS[form.maintenance_action]) throw new Error('Revise a situação, a origem e o manejo da árvore.');
  for (const date of [form.planted_at, form.maintenance_due_at]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Informe uma data válida.');
  }
  return {
    city_id: cityId, common_name: form.common_name.trim(), scientific_name: form.scientific_name?.trim() || null,
    origin: form.origin, status: form.status, address: form.address?.trim() || null, neighborhood: form.neighborhood?.trim() || null,
    latitude, longitude, height_m: height, crown_diameter_m: crown, planted_at: form.planted_at || null,
    maintenance_action: form.maintenance_action,
    maintenance_due_at: form.maintenance_action === 'nenhuma' ? null : form.maintenance_due_at || null,
    notes: form.notes?.trim() || null,
  };
}

export function filterTrees(trees, { search = '', status = 'all', origin = 'all', neighborhood = 'all', action = 'all' } = {}) {
  const term = normalize(search).trim();
  return trees.filter(tree => (status === 'all' || tree.status === status)
    && (origin === 'all' || tree.origin === origin)
    && (neighborhood === 'all' || tree.neighborhood === neighborhood)
    && (action === 'all' || (action === 'pending' ? tree.maintenance_action !== 'nenhuma' : tree.maintenance_action === action))
    && (!term || normalize([tree.common_name, tree.scientific_name, tree.address, tree.neighborhood].join(' ')).includes(term)));
}

export function treeStats(trees) {
  const living = trees.filter(tree => tree.status !== 'removida');
  return { total: trees.length, living: living.length, native: living.filter(tree => tree.origin === 'nativa').length,
    risk: living.filter(tree => tree.status === 'risco').length,
    pending: trees.filter(tree => tree.maintenance_action !== 'nenhuma').length };
}

export function treesCsv(trees, cities = []) {
  // Neutraliza fórmulas ao abrir o CSV em planilhas, inclusive após espaços.
  const cell = value => `"${String(value ?? '').replace(/^(\s*[=+@-])/, "'$1").replaceAll('"', '""')}"`;
  const rows = [['Cidade', 'Nome popular', 'Nome científico', 'Origem', 'Situação', 'Endereço', 'Bairro', 'Latitude', 'Longitude', 'Altura (m)', 'Diâmetro da copa (m)', 'Plantio', 'Manejo', 'Prazo do manejo', 'Observações'],
    ...trees.map(tree => [cities.find(city => String(city.id) === String(tree.city_id))?.name || tree.city_id,
      tree.common_name, tree.scientific_name, TREE_ORIGINS[tree.origin], TREE_STATUS[tree.status]?.label,
      tree.address, tree.neighborhood, tree.latitude, tree.longitude, tree.height_m, tree.crown_diameter_m,
      tree.planted_at, TREE_ACTIONS[tree.maintenance_action], tree.maintenance_due_at, tree.notes])];
  return '\uFEFF' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}

// Paginação explícita evita o limite padrão de 1.000 registros do PostgREST.
export async function loadCityTrees(client, cityId) {
  const rows = [];
  const size = 1000;
  for (let start = 0; ; start += size) {
    let query = client.from('city_trees').select('*').order('created_at', { ascending: false }).order('id').range(start, start + size - 1);
    if (cityId) query = query.eq('city_id', cityId);
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < size) return rows;
  }
}
