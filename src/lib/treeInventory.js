import { haversineDistanceKm } from './geoUtils.js';
import { TREE_SERVICES } from './arborization.js';

export const treeNameKey = value => String(value || '').normalize('NFD').replace(/\p{Mn}/gu, '').trim().replace(/\s+/g, ' ').toLowerCase();

export async function allTreeRows(client, table, configure = query => query) {
  const rows = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await configure(client.from(table).select('*')).order('id').range(start, start + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function loadTreeCatalogs(client, cityId) {
  if (!cityId) return { species: [], neighborhoods: [] };
  const [species, neighborhoods] = await Promise.all([
    allTreeRows(client, 'city_tree_species', query => query.eq('city_id', cityId)),
    allTreeRows(client, 'bairros', query => query.eq('city_id', cityId)),
  ]);
  return { species: species.sort((a, b) => a.common_name.localeCompare(b.common_name, 'pt-BR')),
    neighborhoods: neighborhoods.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')) };
}

export function nearbyTrees(trees, location, radius = 80) {
  if (!location || location.lat == null || location.lng == null) return [];
  return trees.flatMap(tree => {
    if (tree.status === 'removida' || tree.latitude == null || tree.longitude == null) return [];
    const distance = haversineDistanceKm(location, { lat: tree.latitude, lng: tree.longitude });
    return distance != null && distance * 1000 <= radius ? [{ ...tree, distance_m: Math.round(distance * 1000) }] : [];
  }).sort((a, b) => a.distance_m - b.distance_m);
}

export async function loadReportMapTrees(client, bounds, cityId) {
  if (!bounds || ![bounds.south, bounds.north, bounds.west, bounds.east].every(Number.isFinite)
    || bounds.south > bounds.north || bounds.west > bounds.east) return [];
  return allTreeRows(client, 'city_trees', query => {
    let scoped = query.neq('status', 'removida')
      .gte('latitude', bounds.south).lte('latitude', bounds.north)
      .gte('longitude', bounds.west).lte('longitude', bounds.east);
    if (cityId) scoped = scoped.eq('city_id', cityId);
    return scoped;
  });
}

export function treeReportSelection(tree) {
  const lat = Number(tree?.latitude), lng = Number(tree?.longitude);
  if (!tree?.id || !tree.city_id || tree.status === 'removida' || tree.latitude == null || tree.longitude == null
    || !Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { tree_id: tree.id, tree_label: tree.common_name, tree_registration: null, tree_photo_file: null,
    location: { lat, lng }, city_id: tree.city_id, address: tree.address || '' };
}

export function treeNeighborhoodCounts(trees, neighborhoods = []) {
  const counts = new Map(neighborhoods.map(item => [treeNameKey(item.name), { name: item.name, count: 0 }]));
  for (const tree of trees) {
    if (!tree.neighborhood || tree.status === 'removida') continue;
    const key = treeNameKey(tree.neighborhood);
    const row = counts.get(key) || { name: tree.neighborhood, count: 0 };
    row.count++;
    counts.set(key, row);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'));
}

export async function treeRequestCounts(client, cityId) {
  const counts = new Map();
  for (let start = 0; ; start += 1000) {
    const { data, error } = await client.rpc('city_tree_request_counts', { p_city_id: cityId || null }).order('tree_id').range(start, start + 999);
    if (error) throw error;
    for (const row of data || []) counts.set(row.tree_id, row);
    if (!data || data.length < 1000) return counts;
  }
}

export function treeTimeline(tree, care = [], reports = [], updates = []) {
  const entries = tree.created_at ? [{ id: 'registration', date: tree.created_at, title: 'Árvore cadastrada na plataforma', source: 'Inventário' }] : [];
  for (const event of care) entries.push({ id: event.id, date: `${event.performed_on}T12:00:00`, title: `${TREE_SERVICES[event.service_type] || 'Manejo'}: serviço realizado`, description: event.notes, source: 'Equipe municipal' });
  for (const report of reports) {
    entries.push({ id: `report-${report.id}`, date: report.created_at, title: `Solicitação de ${TREE_SERVICES[report.tree_service] || 'poda'}`, source: 'Bronca vinculada', reportId: report.id, description: report.title });
    for (const update of updates.filter(row => row.report_id === report.id && row.update_type === 'solved')) {
      entries.push({ id: `update-${update.id}`, date: update.created_at, title: 'Conclusão informada na bronca', source: 'Atualização da bronca', reportId: report.id,
        description: `${update.description || ''}${report.status === 'resolved' ? ' · Solicitação resolvida.' : ' · Aguardando confirmação da resolução.'}` });
    }
  }
  return entries.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
}

export async function loadTreeHistory(client, treeId) {
  // Todas as consultas preservam a RLS das broncas e de suas atualizações.
  const [care, reports] = await Promise.all([
    allTreeRows(client, 'city_tree_care', query => query.eq('tree_id', treeId)),
    allTreeRows(client, 'reports', query => query.eq('tree_id', treeId).neq('status', 'duplicate')),
  ]);
  const updates = [];
  for (let start = 0; start < reports.length; start += 100) {
    updates.push(...await allTreeRows(client, 'report_updates', query => query.in('report_id', reports.slice(start, start + 100).map(row => row.id)).eq('update_type', 'solved')));
  }
  return { care, reports, updates };
}

export async function uploadTreePhoto(client, file, cityId) {
  if (!file) return null;
  const extensions = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  if (!extensions[file.type] || file.size > 5 * 1024 * 1024) throw new Error('Selecione uma foto JPG, PNG ou WebP de até 5 MB.');
  const { data, error: authError } = await client.auth.getUser();
  const user = data?.user;
  if (authError || !user) throw new Error('Sua sessão expirou. Entre novamente para enviar a foto da árvore.');
  const path = `${cityId}/${user.id}/${crypto.randomUUID()}.${extensions[file.type]}`;
  const bucket = client.storage.from('tree-photos');
  const { error } = await bucket.upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    const detail = String(error.message || '');
    if (/row.level security|unauthorized|permission|access denied/i.test(detail) || [401, 403].includes(Number(error.statusCode || error.status))) throw new Error('O envio da foto foi recusado por uma regra de acesso. Entre novamente; se persistir, solicite a atualização das permissões de fotos de árvores.');
    if (/bucket.*not found/i.test(detail)) throw new Error('O armazenamento de fotos de árvores ainda não está configurado nesta instalação.');
    throw new Error('Não foi possível enviar a foto da árvore. Verifique a conexão e tente novamente.');
  }
  return { path, url: bucket.getPublicUrl(path).data.publicUrl };
}
