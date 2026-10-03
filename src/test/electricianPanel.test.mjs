import assert from 'node:assert/strict';
import test from 'node:test';
import { distanceBetweenPoints, formatDistance, offerKey, orderStage, sortElectricianOffers } from '@/lib/electricianPanel';

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
});

test('distance from the order pin is available only for valid coordinates', () => {
  const pin = { latitude: -8, longitude: -38 };
  assert.equal(distanceBetweenPoints(pin, pin), 0);
  assert.ok(distanceBetweenPoints(pin, { latitude: -7.999, longitude: -38 }) > 100);
  assert.equal(distanceBetweenPoints(pin, { latitude: null, longitude: -38 }), null);
});
