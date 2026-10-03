import { comLoja, indexedDbDisponivel, LOJA_RASCUNHO_ELETRICISTA } from '@/lib/offlineDb';
import { electricianPoleForm } from '@/lib/electricianPole';

const orderFields = [
  'id', 'prefeitura_id', 'atribuido_a', 'protocolo', 'titulo', 'descricao',
  'endereco', 'bairro', 'issue_type', 'prioridade', 'status', 'prazo_em',
  'previsto_em', 'latitude', 'longitude', 'pole_id', 'resultado', 'service_type',
  'registro_execucao', 'revisao_pendente', 'versao',
];
const poleFields = ['id', 'identifier', 'plate', 'address', 'latitude', 'longitude', 'lamp_type', 'lamp_power_w', 'raw_properties', 'updated_at'];
const pending = new Map();

const pick = (source, fields) => source && Object.fromEntries(
  fields.filter((field) => Object.hasOwn(source, field)).map((field) => [field, source[field]]),
);

export function electricianDraftKey({ userId, municipalityId, orderId }) {
  if (!userId || !municipalityId || !orderId) throw new Error('Identificação do rascunho incompleta');
  return `${userId}:${municipalityId}:${orderId}`;
}

const inOrder = (key, work) => {
  const previous = pending.get(key) || Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  pending.set(key, next);
  const cleanup = () => { if (pending.get(key) === next) pending.delete(key); };
  next.then(cleanup, cleanup);
  return next;
};

export function serializeElectricianDraft(scope, { result = '', serviceType = '', technicalNote = '', files = [], order = null, pole = null, poleForm = null }) {
  const id = electricianDraftKey(scope);
  if (files.some((item) => !(item.file instanceof Blob))) {
    throw new Error('Uma das fotos não pode ser guardada neste aparelho');
  }
  return {
    id, userId: scope.userId, municipalityId: scope.municipalityId, orderId: scope.orderId,
    savedAt: new Date().toISOString(), result, serviceType, technicalNote, poleForm,
    photos: files.map(({ id: photoId, file }) => ({
      id: photoId, blob: file, name: file.name || 'foto.jpg',
      type: file.type || 'image/jpeg', lastModified: file.lastModified || Date.now(),
    })),
    order: pick(order, orderFields), pole: pick(pole, poleFields),
  };
}

export async function saveElectricianDraft(scope, state) {
  if (!indexedDbDisponivel()) throw new Error('Armazenamento local indisponível neste aparelho');
  const value = serializeElectricianDraft(scope, state);
  await inOrder(value.id, () => comLoja(LOJA_RASCUNHO_ELETRICISTA, 'readwrite', (store) => store.put(value)));
  return value.savedAt;
}

export async function loadElectricianDraft(scope) {
  if (!indexedDbDisponivel()) return null;
  const key = electricianDraftKey(scope);
  await pending.get(key)?.catch(() => {});
  const record = await comLoja(LOJA_RASCUNHO_ELETRICISTA, 'readonly', (store) => store.get(key));
  if (!record || record.userId !== scope.userId || record.municipalityId !== scope.municipalityId
    || record.orderId !== scope.orderId) return null;
  return {
    result: record.result || '', serviceType: record.serviceType || '', technicalNote: record.technicalNote || '',
    files: (record.photos || []).filter((item) => item.blob instanceof Blob).map((item) => ({
      id: item.id,
      file: new File([item.blob], item.name, { type: item.type, lastModified: item.lastModified }),
    })),
    order: record.order || null, pole: record.pole || null, poleForm: record.poleForm || null, savedAt: record.savedAt,
  };
}

export function electricianDraftHasWork(record) {
  if (!record) return false;
  return Boolean(record.result?.trim() || record.serviceType || record.technicalNote?.trim() || record.photos?.length
    || (record.poleForm && JSON.stringify(record.poleForm) !== JSON.stringify(electricianPoleForm(record.pole, record.order?.titulo))));
}

export async function listElectricianDraftSummaries({ userId, municipalityId }) {
  if (!indexedDbDisponivel() || !userId || !municipalityId) return [];
  await Promise.all([...pending.values()].map((task) => task.catch(() => {})));
  const records = await comLoja(LOJA_RASCUNHO_ELETRICISTA, 'readonly', (store) => store.getAll());
  return (records || []).filter((record) => record.userId === userId && record.municipalityId === municipalityId
    && electricianDraftHasWork(record)).map(({ orderId, order, savedAt }) => ({ orderId, order, savedAt }));
}

export async function clearElectricianDraft(scope) {
  if (!indexedDbDisponivel()) return;
  const key = electricianDraftKey(scope);
  await inOrder(key, () => comLoja(LOJA_RASCUNHO_ELETRICISTA, 'readwrite', (store) => store.delete(key)));
}
