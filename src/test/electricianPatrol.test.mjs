import test from 'node:test';
import assert from 'node:assert/strict';
import { brokenPole, closestPatrolPole, patrolPoleBounds, patrolPositionIsPrecise } from '@/lib/electricianPatrol';

const position = { lat: -8.6, lng: -38.57, accuracy: 5 };
const pole = (id, meters, changes = {}) => ({ id, latitude: position.lat + meters / 111195,
  longitude: position.lng, lighting_status: 'apagado', ...changes });

test('alerta o poste quebrado mais próximo dentro dos mesmos 15 metros do cidadão', () => {
  assert.equal(closestPatrolPole(position, [pole(1, 20), pole(2, 14), pole(3, 6)]).pole.id, 3);
  assert.equal(closestPatrolPole(position, [pole(1, 16)]), null);
  assert.equal(closestPatrolPole(position, [pole(1, 0)]).distance, 0);
});
test('GPS impreciso, ausente e coordenadas inválidas não pedem atualização', () => {
  for (const current of [null, { ...position, accuracy: 30 }, { ...position, accuracy: undefined },
    { ...position, lat: 91 }, { ...position, lng: NaN }]) {
    assert.equal(patrolPositionIsPrecise(current), false);
    assert.equal(closestPatrolPole(current, [pole(1, 0)]), null);
  }
});
test('postergação não repete o mesmo poste e postes resolvidos ou removidos ficam fora', () => {
  const poles = [pole(1, 0), pole(2, 3, { lighting_status: 'aceso' }),
    pole(3, 5, { lighting_status: 'removido', is_broken: true }), pole(4, 8, { latitude: null })];
  assert.equal(closestPatrolPole(position, poles, new Set(['1'])), null);
  assert.equal(brokenPole(pole(5, 4, { lighting_status: 'manutencao' })), true);
  assert.equal(closestPatrolPole(position, [pole(6, 7, { lighting_status: 'aceso', is_broken: true })]).pole.id, 6);
});
test('a consulta local cobre o raio de alerta sem depender dos filtros do mapa', () => {
  const bounds = patrolPoleBounds(position);
  assert.ok(bounds.south < position.lat && bounds.north > pole(1, 100).latitude);
  assert.ok(bounds.west < position.lng && bounds.east > position.lng);
});
