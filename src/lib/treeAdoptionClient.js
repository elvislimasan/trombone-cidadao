import { EMPTY_ADOPTION } from './treeAdoption.js';

const sessionError = () => Object.assign(new Error('Sua sessão precisa ser renovada. Entre novamente para enviar o pedido. O preenchimento foi mantido nesta aba.'), { code: 'ADOPTION_SESSION', needsLogin: true });
const serverError = () => Object.assign(new Error('O serviço de adoção não autorizou o envio. O preenchimento foi mantido. Tente novamente ou informe a equipe responsável.'), { code: 'ADOPTION_SERVER_ACCESS' });
const validSession = (session, userId) => Boolean(userId && session?.access_token && session.user?.id === userId);
const deniedFunction = error => error?.code === '42501' && /permission denied for function submit_tree_adoption/i.test(error.message || '');

export async function submitAdoptionRequest(client, payload, userId) {
  const current = await client.auth.getSession();
  if (current.error || !validSession(current.data?.session, userId)) throw sessionError();
  let result = await client.rpc('submit_tree_adoption', { p_request: payload });
  // Uma única renovação. Reutiliza o UUID do pedido: uma resposta perdida
  // ou a repetição do clique não cria outro pedido nem outro evento.
  if (deniedFunction(result.error) || result.status === 401 || result.error?.code === 'PGRST301') {
    const renewed = await client.auth.refreshSession();
    if (renewed.error || !validSession(renewed.data?.session, userId)) throw sessionError();
    result = await client.rpc('submit_tree_adoption', { p_request: payload });
  }
  if (result.error) {
    if (deniedFunction(result.error) || result.error.code === '42501') throw serverError();
    if (result.status === 401 || result.error.code === 'PGRST301') throw sessionError();
    if (result.error.code === 'PGRST202') throw Object.assign(new Error('O envio de pedidos está temporariamente indisponível. O preenchimento foi mantido. Tente novamente mais tarde.'), { code: result.error.code });
    throw result.error;
  }
  if (!result.data?.id) throw new Error('Não foi possível confirmar o envio. Tente novamente com os mesmos dados.');
  return result.data;
}

const draftKey = (cityId, userId) => `tc_tree_adoption_draft:${cityId}:${userId}`;

export function readAdoptionDraft(storage, cityId, userId) {
  if (!cityId || !userId) return null;
  try {
    const value = JSON.parse(storage.getItem(draftKey(cityId, userId)) || 'null');
    if (!value || typeof value.requestId !== 'string' || !/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value.requestId) || !value.form || !Number.isInteger(value.step) || value.step < 0 || value.step > 3) return null;
    const form = { ...EMPTY_ADOPTION };
    for (const field of Object.keys(form)) {
      const item = value.form[field];
      const valid = field === 'commitment' ? typeof item === 'boolean'
        : (typeof item === 'string' && item.length <= 3000) || (['latitude', 'longitude'].includes(field) && typeof item === 'number' && Number.isFinite(item));
      if (valid) form[field] = item;
    }
    return { requestId: value.requestId, form, step: value.step };
  } catch { return null; }
}

export function storeAdoptionDraft(storage, cityId, userId, draft) {
  if (!cityId || !userId) return;
  try {
    if (draft) storage.setItem(draftKey(cityId, userId), JSON.stringify(draft));
    else storage.removeItem(draftKey(cityId, userId));
  } catch { /* O formulário continua funcionando quando o armazenamento está bloqueado. */ }
}
