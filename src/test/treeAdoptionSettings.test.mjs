import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTreeAdoptionSettings, saveTreeAdoptionSettings } from '../lib/treeAdoptionSettings.js';

function fixture(result) {
  const calls = [];
  const query = Object.fromEntries(['select', 'eq', 'upsert'].map(method => [method, (...args) => { calls.push([method, ...args]); return query; }]));
  query.maybeSingle = query.single = async () => result;
  return { calls, from(table) { calls.push(['from', table]); return query; } };
}

test('plantio começa desativado sem cidade ou sem configuração', async () => {
  assert.deepEqual(await loadTreeAdoptionSettings(null, null), { plantingEnabled: false, seedlingsEnabled: false });
  assert.deepEqual(await loadTreeAdoptionSettings(fixture({ data: null }), 64), { plantingEnabled: false, seedlingsEnabled: true });
});
test('habilita somente com valor booleano explícito e na cidade consultada', async () => {
  for (const [city_id, planting_enabled, expected] of [[64, true, true], [64, false, false], [65, true, false], [64, 'true', false]]) {
    const client = fixture({ data: { city_id, planting_enabled, seedlings_enabled: true } });
    assert.deepEqual(await loadTreeAdoptionSettings(client, 64), { plantingEnabled: expected, seedlingsEnabled: city_id === 64 });
    assert.ok(client.calls.some(call => call[0] === 'eq' && call[1] === 'city_id' && call[2] === 64));
  }
});

test('as modalidades são independentes e exigem booleanos válidos', async () => {
  for (const planting of [true, false]) for (const seedlings of [true, false]) {
    assert.deepEqual(await loadTreeAdoptionSettings(fixture({ data: { city_id: 64, planting_enabled: planting, seedlings_enabled: seedlings } }), 64), { plantingEnabled: planting, seedlingsEnabled: seedlings });
  }
  assert.equal((await loadTreeAdoptionSettings(fixture({ data: { city_id: 64, seedlings_enabled: 'true' } }), 64)).seedlingsEnabled, false);
});
test('falha de consulta não se transforma em permissão para plantio', async () => {
  await assert.rejects(loadTreeAdoptionSettings(fixture({ error: new Error('offline') }), 64), /offline/);
});
test('salva ativação e desativação por cidade e confirma a resposta', async () => {
  for (const enabled of [true, false]) {
    const client = fixture({ data: { city_id: 64, planting_enabled: enabled, seedlings_enabled: false } });
    assert.deepEqual(await saveTreeAdoptionSettings(client, 64, { plantingEnabled: enabled }), { plantingEnabled: enabled, seedlingsEnabled: false });
    assert.deepEqual(client.calls.find(call => call[0] === 'upsert'), ['upsert', { city_id: 64, planting_enabled: enabled }, { onConflict: 'city_id' }]);
  }
  await assert.rejects(saveTreeAdoptionSettings(fixture({ error: new Error('Sem permissão') }), 64, { plantingEnabled: true }), /Sem permissão/);
  await assert.rejects(saveTreeAdoptionSettings(fixture({ data: { city_id: 65, planting_enabled: true } }), 64, { plantingEnabled: true }), /confirmar/);
});

test('alterar mudas não regrava a configuração de plantio', async () => {
  for (const seedlingsEnabled of [false, true]) {
    const client = fixture({ data: { city_id: 64, planting_enabled: true, seedlings_enabled: seedlingsEnabled } });
    assert.deepEqual(await saveTreeAdoptionSettings(client, 64, { seedlingsEnabled }), { plantingEnabled: true, seedlingsEnabled });
    assert.deepEqual(client.calls.find(call => call[0] === 'upsert'), ['upsert', { city_id: 64, seedlings_enabled: seedlingsEnabled }, { onConflict: 'city_id' }]);
  }
  await assert.rejects(saveTreeAdoptionSettings(fixture({ data: { city_id: 64, seedlings_enabled: true } }), 64, { seedlingsEnabled: false }), /confirmar/);
  await assert.rejects(saveTreeAdoptionSettings(null, null, { seedlingsEnabled: false }), /cidade/);
  await assert.rejects(saveTreeAdoptionSettings(null, 64, { seedlingsEnabled: 'false' }), /configuração/);
});
