import assert from 'node:assert/strict';
import test from 'node:test';
import { loadElectricianOfferPole } from '@/lib/electricianOfferPole';

function fakeClient({ reports = [], poles = [], nearby = [] } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      let rows = table === 'reports' ? reports : poles;
      const result = () => Promise.resolve({ data: rows, error: null });
      const query = {
        select() { return query; },
        eq(field, value) { rows = rows.filter((row) => String(row[field]) === String(value)); return query; },
        in(field, values) { rows = rows.filter((row) => values.some((value) => String(value) === String(row[field]))); return query; },
        maybeSingle() { return Promise.resolve({ data: rows[0] || null, error: null }); },
        then(resolve, reject) { return result().then(resolve, reject); },
      };
      return query;
    },
    async rpc(name, args) { calls.push({ name, args }); return { data: nearby, error: null }; },
  };
}

const offer = { tipo: 'solicitacao', id: 'r1', latitude: -8, longitude: -38 };

test('shows the identifier recorded on a request without a pole link', async () => {
  const client = fakeClient({ reports: [{ id: 'r1', city_id: 1, reported_post_identifier: '123 - S227002' }] });
  assert.deepEqual(await loadElectricianOfferPole(client, offer, 1), { code: 'S227002', nearby: false });
  assert.equal(client.calls.length, 0);
});

test('uses the current linked pole identifier ahead of the recorded snapshot', async () => {
  const client = fakeClient({
    reports: [{ id: 'r1', city_id: 1, pole_id: 20, reported_post_identifier: 'OLD20' }],
    poles: [{ id: 20, city_id: 1, identifier: 'S227002' }],
  });
  assert.deepEqual(await loadElectricianOfferPole(client, offer, 1), { code: 'S227002', nearby: false });
  assert.equal(client.calls.length, 0);
});

test('preserves a recorded plate when the linked pole cannot be read', async () => {
  const client = fakeClient({ reports: [{ id: 'r1', city_id: 1, pole_id: 20, pole_number: 'S227002' }] });
  assert.deepEqual(await loadElectricianOfferPole(client, offer, 1), { code: 'S227002', nearby: false });
});

test('marks a proximity reference and excludes poles belonging to another city', async () => {
  const client = fakeClient({
    nearby: [{ pole_id: 10 }, { pole_id: 20 }],
    poles: [{ id: 10, city_id: 2, identifier: 'OTHER10' }, { id: 20, city_id: 1, plate: 'S227002' }],
  });
  assert.deepEqual(await loadElectricianOfferPole(client, offer, 1), { code: 'S227002', nearby: true });
  assert.deepEqual(client.calls, [{ name: 'nearest_poles', args: { lat: -8, lng: -38, radius_m: 80, max_results: 5 } }]);
});

test('leaves the identifier absent when no pole is nearby or the coordinates are invalid', async () => {
  const client = fakeClient();
  assert.equal(await loadElectricianOfferPole(client, offer, 1), null);
  client.calls.length = 0;
  for (const latitude of [null, NaN, 91]) {
    assert.equal(await loadElectricianOfferPole(client, { ...offer, latitude }, 1), null);
  }
  assert.equal(client.calls.length, 0);
});
