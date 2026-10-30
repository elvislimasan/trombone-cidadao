import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPickupMapCenter, pickupDetails, pickupPayload, pickupInstructions, validatePickup } from '../lib/treePickup.js';

function mapClient(tables) {
  const calls = [];
  return { calls, from(table) {
    const filters = [], call = { table, filters }; calls.push(call);
    const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; },
      not() { return query; }, limit(count) { call.limit = count; return query; },
      async maybeSingle() {
        if (tables[table] instanceof Error) throw tables[table];
        return { data: tables[table]?.find(row => filters.every(([key, value]) => String(row[key]) === String(value))) || null };
      } };
    return query;
  } };
}

test('mapa de retirada usa somente pontos do city_id da prefeitura', async () => {
  const client = mapClient({ city_trees: [{ city_id: 65, latitude: -8.05, longitude: -34.9 }, { city_id: 64, latitude: '-8.61', longitude: '-38.59' }] });
  assert.deepEqual(await loadPickupMapCenter(client, 64), { lat: -8.61, lng: -38.59 });
  assert.deepEqual(client.calls, [{ table: 'city_trees', filters: [['city_id', 64]], limit: 1 }]);
  assert.equal(await loadPickupMapCenter(client, null), null);
  assert.equal(client.calls.length, 1);
});

test('mapa tenta postes da mesma cidade se árvores falham e permite alternativa sem dados', async () => {
  const client = mapClient({ city_trees: new Error('Sem acesso'), poles: [{ city_id: 64, latitude: -8.6, longitude: -38.57 }] });
  assert.deepEqual(await loadPickupMapCenter(client, 64), { lat: -8.6, lng: -38.57 });
  assert.ok(client.calls.every(call => call.filters[0][1] === 64));
  assert.equal(await loadPickupMapCenter(client, 65), null);
  assert.equal(await loadPickupMapCenter(mapClient({ city_trees: [{ city_id: 64, latitude: 91, longitude: 0 }] }), 64), null);
});

test('retirada mantém texto antigo e recupera campos salvos separadamente', () => {
  assert.equal(pickupDetails({ instructions: 'Leve uma caixa para a muda.' }).notes, 'Leve uma caixa para a muda.');
  const legacy = pickupDetails({ instructions: 'Endereço de retirada: Rua Um, 20\nDias e horários: Segunda a sexta\nOrientações adicionais: Leve documento.\nUse uma caixa.' });
  assert.equal(legacy.address, 'Rua Um, 20'); assert.equal(legacy.legacy_hours, 'Segunda a sexta');
  assert.equal(legacy.notes, 'Leve documento.\nUse uma caixa.');
  const details = { ...legacy, latitude: -8.6, longitude: -38.57, schedule: [{ days: [1, 2, 3, 4, 5], from: '08:00', to: '12:00' }, { days: [1, 2, 3, 4, 5], from: '14:00', to: '17:00' }] };
  assert.equal(validatePickup(details), '');
  assert.equal(pickupPayload(details).legacy_hours, '');
  assert.deepEqual(pickupDetails({ pickup_details: pickupPayload(details) }), pickupPayload(details));
  assert.match(pickupInstructions(details), /Seg, Ter, Qua, Qui, Sex · 08:00 às 12:00/);
  assert.match(pickupInstructions(details), /query=-8.6,-38.57/);
});

test('horários recusam dias ausentes, intervalos inválidos, sobreposição e coordenada incompleta', () => {
  const base = pickupDetails();
  for (const schedule of [[{ days: [], from: '08:00', to: '12:00' }], [{ days: [1], from: '12:00', to: '08:00' }], [{ days: [1], from: '08:00', to: '12:00' }, { days: [1], from: '11:00', to: '13:00' }], [{ days: [7], from: '08:00', to: '12:00' }]]) assert.ok(validatePickup({ ...base, schedule }));
  assert.ok(validatePickup({ ...base, latitude: -8.6 }));
  assert.equal(validatePickup({ ...base, latitude: 0, longitude: 0 }), '');
  assert.equal(validatePickup({ ...base, schedule: [{ days: [1], from: '08:00', to: '12:00' }, { days: [2], from: '08:00', to: '12:00' }] }), '');
});

test('espécies herdam o local e os horários atuais do viveiro, mesmo com cópia antiga na oferta', () => {
  const nursery = { id: 'n1', pickup_details: { ...pickupDetails(), address: 'Rua do Viveiro, 50', schedule: [{ days: [1, 3, 5], from: '08:00', to: '12:00' }] } };
  const rows = ['ipe', 'oiti'].map(species_id => ({ species_id, nursery, pickup_details: { address: 'Endereço antigo' } }));
  for (const row of rows) assert.deepEqual(pickupDetails(row), nursery.pickup_details);
  nursery.pickup_details = { ...nursery.pickup_details, address: 'Novo endereço do viveiro', schedule: [{ days: [2, 4], from: '13:00', to: '17:00' }] };
  for (const row of rows) {
    assert.equal(pickupDetails(row).address, 'Novo endereço do viveiro');
    assert.match(pickupInstructions(pickupDetails(row)), /Ter, Qui · 13:00 às 17:00/);
  }
});
