export const COMMUNITY_TREE_STATUS = { pending: 'Em análise', approved: 'Aprovada', rejected: 'Precisa de ajustes' };
export const COMMUNITY_CARE_ACTIONS = { watering: 'Rega', growth: 'Crescimento', observation: 'Observação' };
export const COMMUNITY_PHOTO_BUCKET = 'community-tree-photos';
export const COMMUNITY_REVIEW_PATH = '/prefeitura/adote-uma-arvore/comunidade';
export const communityTreePath = id => `/arvores-da-comunidade/${encodeURIComponent(id)}`;
export const communityToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Fortaleza' });
const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function validateCommunityTree(form, today = communityToday()) {
  if (!form.city_id || !/^\d+$/.test(String(form.city_id))) return 'Selecione a cidade da árvore.';
  if (String(form.name || '').trim().length < 3 || form.name.trim().length > 100) return 'Dê um nome à árvore (3 a 100 caracteres).';
  if (typeof form.latitude !== 'number' || typeof form.longitude !== 'number' || !Number.isFinite(form.latitude) || !Number.isFinite(form.longitude) || Math.abs(form.latitude) > 90 || Math.abs(form.longitude) > 180) return 'Marque no mapa onde a árvore está.';
  if ((form.address || '').length > 300) return 'Use até 300 caracteres no endereço.';
  if (form.planted_on && (!validDate(form.planted_on) || form.planted_on > today)) return 'Informe uma data de plantio válida, até hoje.';
  if (!['city', 'exact'].includes(form.location_visibility) || typeof form.public_profile !== 'boolean') return 'Revise as opções de privacidade.';
  return '';
}

export function validateCommunityCare(form, today = communityToday()) {
  if (!COMMUNITY_CARE_ACTIONS[form.action]) return 'Escolha o cuidado que você registrou.';
  if (!validDate(form.performed_on || '') || form.performed_on > today) return 'Informe a data do cuidado, até hoje.';
  if ((form.notes || '').length > 1500) return 'Use até 1.500 caracteres na observação.';
  return '';
}

export function communityApiError(error, fallback = 'Não foi possível concluir. Tente novamente.') {
  if (['PGRST202', 'PGRST205', '42P01'].includes(error?.code)) return 'Este recurso ainda precisa da atualização do banco de dados. O preenchimento foi mantido.';
  return error?.message || fallback;
}

export async function communityRpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) throw new Error(communityApiError(error));
  return data;
}

// Reencodar a foto remove metadados EXIF (inclusive GPS) antes do envio.
export async function prepareCommunityPhoto(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw new Error('Escolha uma foto JPG, PNG ou WebP de até 5 MB.');
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = objectUrl; await img.decode();
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
    if (!blob) throw new Error('Não foi possível preparar a foto. Escolha outra imagem.');
    return blob;
  } finally { URL.revokeObjectURL(objectUrl); }
}

async function uploadCommunityPhoto(client, file, treeId, userId) {
  if (file?.nativePath) {
    const { resolveItemsForUpload } = await import('@/hooks/useNativeCamera');
    const [resolved] = await resolveItemsForUpload([file]);
    if (!resolved) throw new Error('Não foi possível ler a foto. Tire outra foto ou escolha uma imagem da galeria.');
    file = resolved;
  }
  const photo = await prepareCommunityPhoto(file);
  const path = `${userId}/${treeId}/${crypto.randomUUID()}.jpg`;
  const { error } = await client.storage.from(COMMUNITY_PHOTO_BUCKET).upload(path, photo, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('Não foi possível enviar a foto. Confira sua conexão e tente novamente.');
  return path;
}

async function cleanupPhoto(client, path) {
  if (!path) return;
  try { await client.storage.from(COMMUNITY_PHOTO_BUCKET).remove([path]); } catch { /* A política impede apagar fotos já vinculadas. */ }
}

export async function submitCommunityTree(client, form, file, userId) {
  const validation = validateCommunityTree(form);
  if (validation) throw new Error(validation);
  if (!userId) throw new Error('Entre na sua conta para cadastrar a árvore.');
  let uploaded;
  try {
    uploaded = file ? await uploadCommunityPhoto(client, file, form.id, userId) : null;
    if (!uploaded && !form.cover_photo) throw new Error('Adicione uma foto da árvore.');
    const payload = { id: form.id, city_id: form.city_id, name: form.name.trim(), species_id: form.species_id || null, latitude: form.latitude, longitude: form.longitude, address: form.address?.trim() || null, planted_on: form.planted_on || null, public_profile: form.public_profile, location_visibility: form.location_visibility, cover_photo: uploaded || form.cover_photo };
    const id = await communityRpc(client, 'submit_community_tree', { p_tree: payload });
    await cleanupPhoto(client, uploaded); // Só remove arquivos não vinculados em tentativas repetidas.
    return id;
  } catch (error) {
    // Uma resposta perdida não deve apagar a foto de um cadastro confirmado.
    try {
      const existing = await communityRpc(client, 'get_community_tree', { p_id: form.id });
      if (existing?.is_owner && ['pending', 'approved'].includes(existing.status)) { await cleanupPhoto(client, uploaded); return existing.id; }
    } catch { /* Preserva a mensagem original. */ }
    await cleanupPhoto(client, uploaded); throw error;
  }
}

export async function recordCommunityCare(client, form, file, userId) {
  const validation = validateCommunityCare(form);
  if (validation) throw new Error(validation);
  if (!userId) throw new Error('Entre na sua conta para registrar o cuidado.');
  let uploaded;
  try {
    uploaded = file ? await uploadCommunityPhoto(client, file, form.tree_id, userId) : null;
    const id = await communityRpc(client, 'record_community_tree_care', { p_care: { id: form.id, tree_id: form.tree_id, action: form.action, performed_on: form.performed_on, notes: form.notes?.trim() || null, photo_path: uploaded, is_public: form.is_public } });
    await cleanupPhoto(client, uploaded);
    return id;
  } catch (error) { await cleanupPhoto(client, uploaded); throw error; }
}

export async function updateCommunityTree(client, form, file, userId, previous) {
  const validation = validateCommunityTree(form);
  if (validation) throw new Error(validation);
  if (!userId || !previous?.is_owner || previous.id !== form.id) throw new Error('Entre na conta responsável por esta árvore.');
  if (!previous.updated_at) throw new Error('Atualize a página antes de editar a árvore.');
  let uploaded;
  try {
    uploaded = file ? await uploadCommunityPhoto(client, file, form.id, userId) : null;
    const photo = uploaded || form.cover_photo;
    if (!photo) throw new Error('Adicione uma foto da árvore.');
    const id = await communityRpc(client, 'update_community_tree', { p_expected_updated_at: previous.updated_at, p_tree: {
      id: form.id, city_id: previous.city_id, name: form.name.trim(), species_id: form.species_id || null,
      latitude: form.latitude, longitude: form.longitude, address: form.address?.trim() || null, planted_on: form.planted_on || null,
      cover_photo: photo, public_profile: form.public_profile, location_visibility: form.location_visibility,
    } });
    if (uploaded && previous.cover_photo !== uploaded) await cleanupPhoto(client, previous.cover_photo);
    return id;
  } catch (error) { await cleanupPhoto(client, uploaded); throw error; }
}

export async function updateCommunityCare(client, form, file, userId, previous, removePhoto = false) {
  const validation = validateCommunityCare(form);
  if (validation) throw new Error(validation);
  if (!userId || !previous?.updated_at || previous.id !== form.id || previous.tree_id !== form.tree_id) throw new Error('Atualize a página antes de editar o cuidado.');
  let uploaded;
  try {
    uploaded = file ? await uploadCommunityPhoto(client, file, form.tree_id, userId) : null;
    const photo = uploaded || (removePhoto ? null : previous.photo_path || null);
    const id = await communityRpc(client, 'update_community_tree_care', { p_expected_updated_at: previous.updated_at, p_care: {
      id: form.id, tree_id: form.tree_id, action: form.action, performed_on: form.performed_on,
      notes: form.notes?.trim() || null, photo_path: photo, is_public: form.is_public,
    } });
    if (photo !== previous.photo_path) await cleanupPhoto(client, previous.photo_path);
    return id;
  } catch (error) { await cleanupPhoto(client, uploaded); throw error; }
}

export async function deleteCommunityRecord(client, { type, record, userId, treeId }) {
  if (!['tree', 'care'].includes(type) || !userId || !record?.id || !record.updated_at) throw new Error('Atualize a página antes de excluir.');
  const paths = await communityRpc(client, type === 'tree' ? 'delete_community_tree' : 'delete_community_tree_care', { p_id: record.id, p_expected_updated_at: record.updated_at });
  const prefix = `${userId}/${type === 'tree' ? record.id : treeId}/`;
  const ownPaths = [...new Set((Array.isArray(paths) ? paths : []).filter(item => typeof item === 'string' && item.startsWith(prefix) && !item.includes('..')))];
  let cleanupPending = false;
  if (ownPaths.length) {
    try { const { error } = await client.storage.from(COMMUNITY_PHOTO_BUCKET).remove(ownPaths); cleanupPending = Boolean(error); }
    catch { cleanupPending = true; }
  }
  return { cleanupPending };
}

export function communityPhotoGallery(tree, care) {
  const photos = tree.photo_url ? [{ id: 'cover', url: tree.photo_url, label: 'Foto de capa', date: tree.created_at }] : [];
  for (const entry of care) {
    if (!entry.photo_url || entry.is_hidden || (!tree.is_owner && !tree.can_review && !entry.is_public)) continue;
    photos.push({ id: entry.id, url: entry.photo_url, label: COMMUNITY_CARE_ACTIONS[entry.action] || 'Foto da árvore', date: entry.performed_on });
  }
  return photos;
}

export async function hydrateCommunityPhotos(client, rows) {
  const paths = [...new Set(rows.flatMap(row => [row.cover_photo, row.photo_path]).filter(Boolean))];
  if (!paths.length) return rows;
  const { data } = await client.storage.from(COMMUNITY_PHOTO_BUCKET).createSignedUrls(paths, 300);
  const urls = new Map((data || []).filter(row => !row.error).map(row => [row.path, row.signedUrl]));
  return rows.map(row => ({ ...row, photo_url: urls.get(row.cover_photo || row.photo_path) || null }));
}

export function communityShareData(tree, care) {
  if (tree.status !== 'approved' || !tree.public_profile) return null;
  const publicCare = care.filter(row => row.is_public && !row.is_hidden);
  const latestPhoto = [...publicCare].filter(row => row.photo_url).sort((a, b) => b.performed_on.localeCompare(a.performed_on) || String(b.created_at).localeCompare(String(a.created_at)))[0];
  return { name: tree.name, city: tree.city_name, species: tree.species_name || 'Uma árvore, muitos cuidados', before: tree.photo_url, after: latestPhoto?.photo_url || tree.photo_url, beforeDate: tree.created_at?.slice(0, 10), afterDate: latestPhoto?.performed_on || tree.created_at?.slice(0, 10), count: Number(tree.public_care_count ?? publicCare.length), path: communityTreePath(tree.id) };
}
