import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_ADOPTION } from '../lib/treeAdoption.js';
import { readAdoptionDraft, storeAdoptionDraft, submitAdoptionRequest } from '../lib/treeAdoptionClient.js';

const userId = 'citizen';
const session = { access_token: 'test-token', user: { id: userId } };
const payload = { id: '90000000-0000-0000-0000-000000000001', city_id: 64 };
const denied = { error: { code: '42501', message: 'permission denied for function submit_tree_adoption' } };
function client(results, current = session, renewed = session) {
  const calls = [], auth = { refreshes: 0 };
  auth.getSession = async () => ({ data: { session: current } });
  auth.refreshSession = async () => { auth.refreshes++; return { data: { session: renewed } }; };
  return { auth, calls, async rpc(name, args) { calls.push({ name, args }); return results.shift(); } };
}

test('envio usa sessão da mesma conta e renova uma única vez preservando a chave idempotente', async () => {
  const api = client([denied, { data: payload }]);
  assert.deepEqual(await submitAdoptionRequest(api, payload, userId), payload);
  assert.equal(api.auth.refreshes, 1);
  assert.equal(api.calls.length, 2);
  assert.deepEqual(api.calls[0], api.calls[1]);
  assert.equal(api.calls[0].args.p_request.id, payload.id);
});

test('sessão ausente ou de outra conta nunca envia; troca de conta ao renovar impede repetição', async () => {
  for (const current of [null, { ...session, user: { id: 'another' } }]) {
    const api = client([], current);
    await assert.rejects(submitAdoptionRequest(api, payload, userId), error => error.needsLogin === true);
    assert.equal(api.calls.length, 0);
  }
  for (const renewed of [null, { ...session, user: { id: 'another' } }]) {
    const api = client([denied], session, renewed);
    await assert.rejects(submitAdoptionRequest(api, payload, userId), error => error.needsLogin === true);
    assert.equal(api.calls.length, 1);
  }
});

test('recusa persistente vira mensagem de serviço; regra do banco não é repetida nem escondida', async () => {
  const api = client([denied, denied]);
  await assert.rejects(submitAdoptionRequest(api, payload, userId), error => error.code === 'ADOPTION_SERVER_ACCESS' && !error.message.includes('permission denied'));
  assert.equal(api.auth.refreshes, 1);
  const businessError = { code: '23514', message: 'A espécie não tem disponibilidade confirmada.' };
  const unavailable = client([{ error: businessError }]);
  await assert.rejects(submitAdoptionRequest(unavailable, payload, userId), error => error === businessError);
  assert.equal(unavailable.auth.refreshes, 0);
});

test('rascunho guarda formulário, etapa e UUID por conta/cidade e é removido após envio', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const draft = { form: { ...EMPTY_ADOPTION, address: 'Rua do Plantio, 20', latitude: -8.6, commitment: true, author_id: 'injetado' }, step: 3, requestId: payload.id };
  storeAdoptionDraft(storage, 64, userId, draft);
  const saved = readAdoptionDraft(storage, 64, userId);
  assert.equal(saved.form.address, draft.form.address); assert.equal(saved.step, 3); assert.equal(saved.requestId, payload.id);
  assert.equal(saved.form.author_id, undefined);
  assert.equal(readAdoptionDraft(storage, 65, userId), null); assert.equal(readAdoptionDraft(storage, 64, 'another'), null);
  storeAdoptionDraft(storage, 64, userId, null);
  assert.equal(readAdoptionDraft(storage, 64, userId), null);
  storage.setItem('tc_tree_adoption_draft:64:citizen', '{broken');
  assert.equal(readAdoptionDraft(storage, 64, userId), null);
});
