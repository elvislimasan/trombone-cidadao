import { comLoja, indexedDbDisponivel, LOJA_RASCUNHO_ELETRICISTA } from './offlineDb';

const pending = new Map();
function inOrder(key, work) {
  const next = (pending.get(key) || Promise.resolve()).catch(() => {}).then(work);
  pending.set(key, next);
  const clean = () => { if (pending.get(key) === next) pending.delete(key); };
  next.then(clean, clean);
  return next;
}

export function executorDraftKey({ userId, municipalityId, activity, orderId }) {
  if (!userId || !municipalityId || !activity || !orderId) throw new Error('Contexto de execução incompleto.');
  return `executor:${userId}:${municipalityId}:${activity}:${orderId}`;
}
export async function saveExecutorDraft(scope, form) {
  if (!indexedDbDisponivel()) throw new Error('Armazenamento local indisponível.');
  const files = form.files.map(({ id, file }) => ({ id, blob: file, name: file.name, type: file.type, lastModified: file.lastModified }));
  await inOrder(executorDraftKey(scope), () => comLoja(LOJA_RASCUNHO_ELETRICISTA, 'readwrite', store => store.put({ ...form, files, id: executorDraftKey(scope), scope, savedAt: new Date().toISOString() })));
}
export async function loadExecutorDraft(scope) {
  if (!indexedDbDisponivel()) return null;
  await pending.get(executorDraftKey(scope))?.catch(() => {});
  const record = await comLoja(LOJA_RASCUNHO_ELETRICISTA, 'readonly', store => store.get(executorDraftKey(scope)));
  if (!record || record.id !== executorDraftKey(scope)) return null;
  return { ...record, files: record.files.filter(item => item.blob instanceof Blob).map(item => ({ id: item.id, file: new File([item.blob], item.name, { type: item.type, lastModified: item.lastModified }) })) };
}
export async function clearExecutorDraft(scope) {
  if (!indexedDbDisponivel()) return;
  await inOrder(executorDraftKey(scope), () => comLoja(LOJA_RASCUNHO_ELETRICISTA, 'readwrite', store => store.delete(executorDraftKey(scope))));
}
