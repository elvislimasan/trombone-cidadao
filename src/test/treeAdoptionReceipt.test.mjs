import test from 'node:test';
import assert from 'node:assert/strict';
import { confirmAdoptionReceipt } from '../lib/treeAdoptionReceipt.js';

const request = { id: 'request', author_id: 'citizen', request_type: 'muda', status: 'pronta_retirada' };
const receipt = { ...request, status: 'concluida', fulfilled_on: '2026-11-03' };

test('recebimento envia só o identificador e aceita apenas o resultado confirmado pelo banco', async () => {
  let payload;
  const client = { rpc: async (name, body) => { payload = { name, body }; return { data: receipt }; } };
  assert.deepEqual(await confirmAdoptionReceipt(client, request, 'citizen'), receipt);
  assert.deepEqual(payload, { name: 'confirm_tree_adoption_receipt', body: { p_id: 'request' } });
});

test('outra conta, ausência de sessão, plantio e etapa incompatível não enviam confirmação', async () => {
  const client = { rpc() { assert.fail('Não deveria chamar o banco'); } };
  for (const [row, user] of [[request, null], [request, 'other'], [{ ...request, request_type: 'plantio' }, 'citizen'], [{ ...request, status: 'em_analise' }, 'citizen']]) await assert.rejects(confirmAdoptionReceipt(client, row, user));
});

test('falha ou resposta incompleta não encerra visualmente o atendimento', async () => {
  for (const data of [null, { ...receipt, status: 'pronta_retirada' }, { ...receipt, author_id: 'other' }, { ...receipt, fulfilled_on: null }]) await assert.rejects(confirmAdoptionReceipt({ rpc: async () => ({ data }) }, request, 'citizen'), /Não foi possível confirmar/);
  await assert.rejects(confirmAdoptionReceipt({ rpc: async () => ({ error: { code: 'PGRST202' } }) }, request, 'citizen'), /indisponível/);
  await assert.rejects(confirmAdoptionReceipt({ rpc: async () => ({ error: { code: '40001', message: 'O pedido foi atualizado.' } }) }, request, 'citizen'), /atualizado/);
});
