export const TREE_STATUS = {
  saudavel: { label: 'Saudável', color: '#15803d' },
  atencao: { label: 'Precisa de atenção', color: '#b45309' },
  risco: { label: 'Avaliação técnica necessária', color: '#b91c1c' },
  removida: { label: 'Removida', color: '#64748b' },
};

export const TREE_MAP_STATES = { ...TREE_STATUS, linked: { label: 'Bronca vinculada', color: '#eab308' } };

export function treeMapMarkerKey(tree, selected = false) {
  if (tree?.status === 'removida') return 'removida';
  if (selected || Number(tree?.service_requests) > 0) return 'linked';
  return TREE_STATUS[tree?.status] ? tree.status : 'saudavel';
}

export const TREE_ORIGINS = { nativa: 'Nativa', exotica: 'Exótica', nao_identificada: 'Não identificada' };
export const TREE_ACTIONS = { nenhuma: 'Sem manejo pendente', vistoria: 'Vistoria', poda: 'Poda', tratamento: 'Tratamento', remocao: 'Avaliação para remoção', plantio: 'Reposição / plantio' };
export const TREE_SERVICES = { poda: 'Poda', remocao: 'Remoção', vistoria: 'Vistoria', tratamento: 'Tratamento', plantio: 'Plantio' };
export const TREE_PLANTED_BY = { nao_informado: 'Não informado', prefeitura: 'Prefeitura', comunidade: 'Comunidade / morador', outro: 'Outro' };

export const treeLabel = tree => [tree?.public_code, tree?.common_name].filter(Boolean).join(' · ');

export function treeImage(tree, failedUrls = []) {
  const real = tree?.photo_url?.trim();
  const illustration = tree?.species_illustration_url?.trim();
  if (real && !failedUrls.includes(real)) return { url: real, illustrative: false, caption: 'Foto da árvore', alt: `Foto de ${tree.common_name}` };
  if (illustration && !failedUrls.includes(illustration)) return { url: illustration, illustrative: true,
    caption: `Imagem ilustrativa da espécie ${tree.common_name}.`, alt: `Imagem ilustrativa da espécie ${tree.common_name}` };
  return null;
}

export const EMPTY_TREE = {
  common_name: '', scientific_name: '', origin: 'nao_identificada', status: 'saudavel',
  address: '', neighborhood: '', latitude: '', longitude: '', height_m: '', crown_diameter_m: '',
  planted_at: '', maintenance_action: 'nenhuma', maintenance_due_at: '', notes: '',
  species_id: '', bairro_id: '', photo_url: '', planted_by: 'nao_informado', estimated_birth_year: '', is_historic_site: false,
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
  const birthYear = optionalNumber(form.estimated_birth_year);
  if (birthYear !== null && (!Number.isInteger(birthYear) || birthYear < 1 || birthYear > new Date().getFullYear())) throw new Error('Informe um ano de nascimento estimado válido.');
  if ([height, crown].some(value => value !== null && (!Number.isFinite(value) || value <= 0))) throw new Error('As medidas devem ser maiores que zero.');
  if (!TREE_STATUS[form.status] || !TREE_ORIGINS[form.origin] || !TREE_ACTIONS[form.maintenance_action]) throw new Error('Revise a situação, a origem e o manejo da árvore.');
  for (const date of [form.planted_at, form.maintenance_due_at]) {
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) throw new Error('Informe uma data válida.');
  }
  if (form.planted_at && form.planted_at > new Date().toLocaleDateString('en-CA')) throw new Error('A data do plantio não pode estar no futuro.');
  if (!TREE_PLANTED_BY[form.planted_by || 'nao_informado']) throw new Error('Selecione um responsável pelo plantio válido.');
  return {
    city_id: cityId, common_name: form.common_name.trim(), scientific_name: form.scientific_name?.trim() || null,
    origin: form.origin, status: form.status, address: form.address?.trim() || null, neighborhood: form.neighborhood?.trim() || null,
    latitude, longitude, height_m: height, crown_diameter_m: crown, planted_at: form.planted_at || null,
    maintenance_action: form.maintenance_action,
    maintenance_due_at: form.maintenance_action === 'nenhuma' ? null : form.maintenance_due_at || null,
    notes: form.notes?.trim() || null,
    species_id: form.species_id || null, bairro_id: form.bairro_id || null, photo_url: form.photo_url || null,
    planted_by: form.planted_by || 'nao_informado', estimated_birth_year: birthYear, is_historic_site: !!form.is_historic_site,
  };
}

export function filterTrees(trees, { search = '', species = 'all', status = 'all', origin = 'all', neighborhood = 'all', action = 'all', plantedBy = 'all', plantedYear = '', historic = 'all', centenarian = 'all', minAge = '', maxAge = '' } = {}) {
  const term = normalize(search).trim();
  const year = new Date().getFullYear();
  const validBirthYear = tree => tree.estimated_birth_year != null && Number.isInteger(Number(tree.estimated_birth_year)) && Number(tree.estimated_birth_year) > 0 && Number(tree.estimated_birth_year) <= year;
  return trees.filter(tree => (status === 'all' || (status === 'living' ? tree.status !== 'removida' : tree.status === status))
    && (origin === 'all' || tree.origin === origin)
    && (species === 'all' || (species === 'unidentified' ? !tree.species_id : String(tree.species_id) === species))
    && (neighborhood === 'all' || (neighborhood === 'unidentified' ? !tree.bairro_id && !tree.neighborhood?.trim() : tree.neighborhood === neighborhood))
    && (plantedBy === 'all' || tree.planted_by === plantedBy)
    && (!plantedYear || tree.planted_at?.slice(0, 4) === plantedYear)
    && (historic === 'all' || tree.is_historic_site === (historic === 'yes'))
    && (minAge === '' || (validBirthYear(tree) && year - Number(tree.estimated_birth_year) >= Number(minAge)))
    && (maxAge === '' || (validBirthYear(tree) && year - Number(tree.estimated_birth_year) <= Number(maxAge)))
    && (centenarian === 'all' || (tree.estimated_birth_year != null && Number(tree.estimated_birth_year) <= new Date().getFullYear() - 100 && tree.status !== 'removida'))
    && (action === 'all' || (action === 'pending' ? tree.maintenance_action !== 'nenhuma' : tree.maintenance_action === action))
    && (!term || normalize([tree.public_code, tree.common_name, tree.scientific_name, ...(tree.species_aliases || []), tree.address, tree.neighborhood].join(' ')).includes(term)));
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
  const rows = [['Cidade', 'Código da árvore', 'Nome popular', 'Nome científico', 'Origem', 'Situação', 'Endereço', 'Bairro', 'Latitude', 'Longitude', 'Altura (m)', 'Diâmetro da copa (m)', 'Plantio', 'Manejo', 'Prazo do manejo', 'Observações', 'Cadastro na plataforma', 'Plantado por', 'Ano de nascimento estimado', 'Sítio histórico', 'Solicitações de serviço'],
    ...trees.map(tree => [cities.find(city => String(city.id) === String(tree.city_id))?.name || tree.city_id,
      tree.public_code, tree.common_name, tree.scientific_name, TREE_ORIGINS[tree.origin], TREE_STATUS[tree.status]?.label,
      tree.address, tree.neighborhood, tree.latitude, tree.longitude, tree.height_m, tree.crown_diameter_m,
      tree.planted_at, TREE_ACTIONS[tree.maintenance_action], tree.maintenance_due_at, tree.notes, tree.created_at,
      TREE_PLANTED_BY[tree.planted_by], tree.estimated_birth_year, tree.is_historic_site ? 'Sim' : 'Não', tree.service_requests ?? 0])];
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
