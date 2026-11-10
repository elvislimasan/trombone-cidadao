import test from 'node:test';
import assert from 'node:assert/strict';
import { pipaWaterLevels, pipaWaterPriority } from '../lib/pipaWaterLevel.js';
const now = new Date('2026-11-10T12:00:00Z'), tank = { id: 'tank', name: 'Caixa', active: true, capacity_liters: 10000, emptying_days: 10 };
const delivery = (liters, at, extra = {}) => ({ tank_id: 'tank', liters, delivered_at: at, ...extra });
const level = (deliveries = [], requests = [], changes = {}) => pipaWaterLevels([{ ...tank, ...changes }], deliveries, requests, now).get('tank');
test('estima consumo e as três faixas sem tratar carga parcial como caixa cheia', () => {
  assert.equal(level([delivery(10000, '2026-11-10T12:00:00Z')]).state, 'full');
  assert.equal(level([delivery(5000, '2026-11-10T12:00:00Z')]).percent, 50);
  assert.equal(level([delivery(5000, '2026-11-10T12:00:00Z')]).state, 'moderate');
  assert.equal(level([delivery(10000, '2026-11-02T12:00:00Z')]).state, 'empty');
  assert.equal(level([delivery(10000, '2026-11-02T12:00:00Z')]).percent, 20);
  assert.equal(level([delivery(10000, '2026-10-01T12:00:00Z')]).percent, 0);
});
test('acumula cargas parciais e limita saldo à capacidade', () => {
  const deliveries = [delivery(5000, '2026-11-10T12:00:00Z'), delivery(5000, '2026-11-09T12:00:00Z')];
  assert.equal(level(deliveries).percent, 90);
  assert.equal(level([...deliveries, delivery(9000, '2026-11-10T12:00:00Z')]).percent, 100);
  assert.equal(level(deliveries).emptyAt, '2026-11-19T12:00:00.000Z');
});
test('pipa pode completar caixa já pela metade e registrar caixa cheia', () => {
  const filled = level([delivery(5000, '2026-11-10T12:00:00Z', { level_after_percent:100 })]);
  assert.equal(filled.percent,100);
  assert.equal(filled.emptyAt,'2026-11-20T12:00:00.000Z');
  assert.equal(level([delivery(5000,'2026-11-09T12:00:00Z',{level_after_percent:100})]).percent,90);
  assert.equal(level([delivery(2000,'2026-11-10T12:00:00Z',{level_after_percent:75})]).percent,75);
  assert.equal(level([delivery(5000,'2026-11-10T12:00:00Z',{level_after_percent:null})]).percent,50);
});
test('caixa seca informada zera o saldo e nova entrega reinicia o consumo', () => {
  const request = { tank_id: 'tank', kind: 'urgent', status: 'assigned', created_at: '2026-11-09T12:00:00Z' };
  assert.equal(level([delivery(10000, '2026-11-08T12:00:00Z')], [request]).reportedDry, true);
  assert.equal(level([], [request], { emptying_days: null }).percent, 0);
  assert.equal(level([delivery(5000, '2026-11-10T12:00:00Z')], [request]).percent, 50);
  assert.equal(level([], [{ ...request, status: 'cancelled' }]).state, 'unknown');
});
test('sem média ou histórico não inventa nível e ignora entregas de outra caixa ou futuras', () => {
  assert.equal(level().state, 'unknown');
  assert.equal(level([delivery(10000, now)], [], { emptying_days: null }).percent, null);
  assert.equal(level([delivery(10000, '2026-11-11T12:00:00Z'), delivery(10000, now, { tank_id: 'other' })]).state, 'unknown');
  assert.equal(level([], [], { active: false }).state, 'inactive');
});
test('prioridade coloca urgências e caixas baixas antes das demais sem confundir vínculo', () => {
  const tanks = [tank, { ...tank, id: 'other', name: 'Outra' }];
  const levels = pipaWaterLevels(tanks, [delivery(10000, now)], [{ tank_id: 'other', kind: 'urgent', status: 'pending', created_at: now }], now);
  assert.equal(tanks.slice().sort((a,b) => pipaWaterPriority(a,b,levels))[0].id, 'other');
});
