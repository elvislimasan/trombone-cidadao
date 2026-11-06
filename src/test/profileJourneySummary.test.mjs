import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchProfileJourneySummary } from '../lib/profileJourneySummary.js';

function fixture({ failedTable } = {}) {
  const calls = [];
  const counts = { reports: 1205, favorite_reports: 7, community_trees: 3, tree_adoption_requests: 1 };
  return { calls, from(table) {
    const call = { table, filters: [] }; calls.push(call);
    return { select(columns, options) { Object.assign(call, { columns, options }); return this; }, eq(key, value) { call.filters.push([key, value]); return this; }, then(resolve, reject) { return Promise.resolve(table === failedTable ? { error: new Error('Sem acesso') } : { count: counts[table] }).then(resolve, reject); } };
  } };
}
test('quantidades usam contagem exata no servidor, a conta atual e a cidade dos destinos locais', async () => {
  const client = fixture();
  const totals = await fetchProfileJourneySummary(client, 'account-a', 64);
  assert.deepEqual(totals, { reports: 1205, following: 7, trees: 3, requests: 1 });
  for (const query of client.calls) assert.deepEqual(query.options, { count: 'exact', head: true });
  assert.deepEqual(client.calls.find(query => query.table === 'reports').filters, [['author_id', 'account-a']]);
  assert.deepEqual(client.calls.find(query => query.table === 'favorite_reports').filters, [['user_id', 'account-a']]);
  for (const table of ['community_trees', 'tree_adoption_requests']) assert.deepEqual(client.calls.find(query => query.table === table).filters, [['author_id', 'account-a'], ['city_id', 64]]);
  assert.equal(client.calls.find(query => query.table === 'favorite_reports').columns, 'report:reports!inner(id)');
});
test('falha em uma área não vira zero nem apaga as demais quantidades', async () => {
  const totals = await fetchProfileJourneySummary(fixture({ failedTable: 'tree_adoption_requests' }), 'account-a', 64);
  assert.equal(totals.requests, null);
  assert.equal(totals.reports, 1205);
});
test('visitante não consulta contagens e ausência de cidade não cria filtro inválido', async () => {
  const client = fixture();
  assert.deepEqual(await fetchProfileJourneySummary(client, null, 64), {});
  assert.equal(client.calls.length, 0);
  await fetchProfileJourneySummary(client, 'account-b', null);
  assert.ok(client.calls.every(query => !query.filters.some(([key]) => key === 'city_id')));
  assert.ok(client.calls.every(query => query.filters[0][1] === 'account-b'));
});
