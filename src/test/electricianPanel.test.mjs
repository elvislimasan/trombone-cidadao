import assert from 'node:assert/strict';
import test from 'node:test';
import { canResumeElectricianOrder, distanceBetweenPoints, formatDistance, offerKey, orderStage, sortElectricianOffers } from '@/lib/electricianPanel';

test('urgent service stays ahead of orders and requests even in nearby mode', () => {
  const items = [
    { tipo: 'solicitacao', id: 'r', prioridade: 'normal', distancia_m: 30, created_at: '2026-10-01T10:00:00Z' },
    { tipo: 'ordem', id: 'o', prioridade: 'alta', distancia_m: 80, created_at: '2026-10-01T10:00:00Z' },
    { tipo: 'ordem', id: 'u', prioridade: 'urgente', distancia_m: 5000, created_at: '2026-10-01T10:00:00Z' },
  ];
  assert.deepEqual(sortElectricianOffers(items, true).map(offerKey), ['ordem:u', 'ordem:o', 'solicitacao:r']);
});

test('nearby mode orders services inside the same priority group', () => {
  const items = [
    { tipo: 'ordem', id: 'far', prioridade: 'normal', distancia_m: 2000, created_at: '2026-10-01T10:00:00Z' },
    { tipo: 'ordem', id: 'near', prioridade: 'normal', distancia_m: 200, created_at: '2026-10-01T11:00:00Z' },
  ];
  assert.deepEqual(sortElectricianOffers(items, true).map(offerKey), ['ordem:near', 'ordem:far']);
  assert.equal(formatDistance(1200), '1,2 km');
});

test('assigned orders appear in the correct work stage', () => {
  assert.equal(orderStage({ status: 'programada' }), 'fazer');
  assert.equal(orderStage({ status: 'em_andamento' }), 'execucao');
  assert.equal(orderStage({ status: 'aguardando_confirmacao' }), 'conferencia');
  assert.equal(orderStage({ status: 'concluida' }), 'historico');
  assert.equal(orderStage({ status: 'aguardando_informacao' }), 'conferencia');
  assert.equal(orderStage({ status: 'aguardando_recurso' }), 'conferencia');
  assert.equal(orderStage({ status: 'concluida', revisao_pendente: true }), 'conferencia');
});

test('retomada não permite reabrir uma ordem encerrada ou em conferência sem a gestão', () => {
  for (const status of ['aberta', 'triagem', 'programada', 'aguardando_informacao', 'aguardando_recurso']) assert.equal(canResumeElectricianOrder({ status }), true);
  for (const status of ['concluida', 'cancelada', 'recusada', 'aguardando_confirmacao', 'em_andamento']) assert.equal(canResumeElectricianOrder({ status }), false);
});

test('distance from the order pin is available only for valid coordinates', () => {
  const pin = { latitude: -8, longitude: -38 };
  assert.equal(distanceBetweenPoints(pin, pin), 0);
  assert.ok(distanceBetweenPoints(pin, { latitude: -7.999, longitude: -38 }) > 100);
  assert.equal(distanceBetweenPoints(pin, { latitude: null, longitude: -38 }), null);
});
