import test from 'node:test';
import assert from 'node:assert/strict';
import { createPipaTestData, PIPA_TEST_MARKER, PIPA_TEST_TABLES, pipaTestRowKey } from '../../scripts/lib/pipaTestData.mjs';
import { parsePipaSeedOptions } from '../../scripts/seed-pipa.mjs';
import { pipaCoordinates, pipaDay, pipaStatistics, pipaValidCpf, pipaValidPhone } from '../lib/pipa.js';

const channelId = '10000000-0000-4000-8000-000000000001', actorId = '20000000-0000-4000-8000-000000000001';
const asOf = new Date('2026-11-10T12:00:00Z');
const fixture = extra => createPipaTestData({ channelId, actorId, asOf, ...extra });

test('seed cobre os fluxos do abastecimento com dados fictícios identificados', () => {
  const data = fixture();
  assert.deepEqual(PIPA_TEST_TABLES.map(table => data[table].length), [8, 4, 48, 10, 74]);
  assert.equal(data.pipa_tanks.filter(t => !t.active).length, 1);
  assert.equal(data.pipa_drivers.filter(d => !d.active).length, 1);
  assert.ok(data.pipa_drivers.every(d => d.user_id === null), 'Não cria ou associa logins reais');
  for (const row of data.pipa_tanks) {
    assert.ok(row.name.startsWith('Caixa ')); assert.ok(row.notes.startsWith(PIPA_TEST_MARKER));
    assert.ok(pipaValidCpf(row.responsible_document)); assert.ok(pipaValidPhone(row.responsible_phone));
    assert.ok(pipaCoordinates(row.latitude, row.longitude));
  }
  assert.ok(data.pipa_requests.some(r => r.kind === 'urgent' && r.status === 'pending'));
  assert.ok(data.pipa_requests.some(r => r.kind === 'one_off' && r.tank_id === null));
  assert.ok(data.pipa_requests.some(r => r.status === 'in_transit'));
  assert.ok(data.pipa_requests.some(r => r.status === 'cancelled'));
  assert.ok(!JSON.stringify(data).includes('[TESTE'), 'Exemplos não exibem tags de teste em nomes, localidades ou histórico');
});
test('IDs estáveis evitam duplicação e são isolados por secretaria', () => {
  const a = fixture(), b = fixture({ asOf: new Date('2026-11-20T12:00:00Z') }), c = fixture({ channelId: '10000000-0000-4000-8000-000000000002' });
  for (const table of PIPA_TEST_TABLES) {
    const keys = a[table].map(row => pipaTestRowKey(table, row));
    assert.equal(new Set(keys).size, keys.length);
    assert.deepEqual(keys, b[table].map(row => pipaTestRowKey(table, row)));
    assert.ok(c[table].every(row => !keys.includes(pipaTestRowKey(table, row))));
  }
});
test('histórico de 12 meses gera métricas, apoio municipal ao Exército e cota excedida', () => {
  const data = fixture(), deliveries = data.pipa_deliveries;
  assert.equal(new Set(deliveries.map(d => pipaDay(d.delivered_at).slice(0, 7))).size, 12);
  assert.ok(deliveries.every(d => new Date(d.delivered_at) <= asOf && d.liters <= d.loads * d.capacity_liters));
  assert.ok(deliveries.some(d => d.provider === 'prefeitura' && data.pipa_tanks.find(t => t.id === d.tank_id)?.provider === 'exercito'));
  for (const request of data.pipa_requests) {
    assert.equal(deliveries.filter(d => d.request_id === request.id).length, request.status === 'completed' ? 1 : 0);
  }
  const stats = pipaStatistics({ tanks: data.pipa_tanks, drivers: data.pipa_drivers, quotas: data.pipa_quotas, requests: data.pipa_requests, deliveries }, { from: '2026-11-01', to: '2026-11-10' }, asOf);
  assert.equal(stats.prefeituraTanks, 4); assert.equal(stats.exercitoTanks, 3); assert.equal(stats.annualLoads, 86);
  assert.ok(stats.deliveredLastMonth > 0); assert.ok(stats.byDriver.some(d => d.monthLoads > d.quota));
});
test('datas de demonstração respeitam a virada de mês e nunca ficam no futuro', () => {
  for (const date of ['2026-11-01T00:10:00-03:00', '2026-01-01T00:01:00-03:00', '2026-11-01T02:00:00Z']) {
    const current = new Date(date), data = fixture({ asOf: current });
    assert.ok(data.pipa_deliveries.every(d => new Date(d.delivered_at) <= current));
    assert.ok(data.pipa_requests.every(r => new Date(r.created_at) <= current));
  }
});
test('script exige cidade explícita e usa simulação por padrão', () => {
  assert.equal(parsePipaSeedOptions(['--city-id', '64']).apply, false);
  assert.equal(parsePipaSeedOptions(['--city-id', '64', '--apply']).apply, true);
  assert.throws(() => parsePipaSeedOptions([]), /city-id/);
  assert.throws(() => parsePipaSeedOptions(['--city-id', '-1']), /válido/);
  assert.throws(() => parsePipaSeedOptions(['--city-id', '64', '--channel-id', 'inválido']), /válido/);
});
