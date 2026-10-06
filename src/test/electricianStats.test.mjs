import assert from 'node:assert/strict';
import test from 'node:test';
import { summarizeElectricianWork } from '@/lib/electricianStats';

test('electrician statistics count completed orders and distinct serviced poles', () => {
  const orders = [
    { id: '1', status: 'concluida', pole_id: 10, service_type: 'lamp_replacement', bairro: 'Centro', concluida_em: '2026-10-01T12:00:00Z' },
    { id: '2', status: 'concluida', pole_id: 10, service_type: 'arm_installation', bairro: 'Centro', concluida_em: '2026-09-10T12:00:00Z' },
    { id: '3', status: 'concluida', pole_id: null, service_type: null, bairro: 'São José', concluida_em: '2026-10-02T12:00:00Z' },
    { id: '4', status: 'em_andamento', pole_id: 11, service_type: 'other', bairro: 'Centro' },
  ];
  const result = summarizeElectricianWork(orders, new Date('2026-10-03T12:00:00Z'));
  assert.equal(result.poles, 1);
  assert.equal(result.completed, 3);
  assert.equal(result.thisMonth, 2);
  assert.equal(result.neighborhoods, 2);
  assert.deepEqual(result.services.map(({ key, count }) => [key, count]), [['lamp_replacement', 1], ['arm_installation', 1], ['unknown', 1]]);
  assert.deepEqual(result.topNeighborhoods[0], { name: 'Centro', count: 2 });
  assert.deepEqual(result.recent.map(({ id }) => id), ['3', '1', '2']);
});

test('one completed visit counts each selected service once', () => {
  const result = summarizeElectricianWork([{
    id: 'visit', status: 'concluida', pole_id: 12, service_type: 'lamp_replacement',
    service_types: ['lamp_replacement', 'relay_replacement'],
  }]);
  assert.equal(result.completed, 1);
  assert.deepEqual(result.services.map(({ key, count }) => [key, count]),
    [['lamp_replacement', 1], ['relay_replacement', 1]]);
});
