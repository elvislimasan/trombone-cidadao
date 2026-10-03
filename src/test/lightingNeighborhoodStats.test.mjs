import test from 'node:test';
import assert from 'node:assert/strict';
import { problemPolesByNeighborhood } from '../lib/lightingNeighborhoodStats.js';

test('agrupa cada poste com problema uma vez pelo bairro conhecido mais recente', () => {
  const poles = [
    { id: 1, lighting_status: 'apagado', raw_properties: { Bairro: 'Centro' } },
    { id: 2, is_broken: true, lighting_status: 'aceso' },
    { id: 3, lighting_status: 'manutencao' },
    { id: 4, lighting_status: 'aceso' },
    { id: 5, lighting_status: 'apagado' },
    { id: 6, lighting_status: 'apagado' },
  ];
  const orders = [
    { pole_id: 2, bairro: 'Centro', created_at: '2026-01-01' },
    { pole_id: 2, bairro: 'centro', created_at: '2026-02-01' },
    { pole_id: 3, bairro: 'Vila Nova', created_at: '2026-01-01' },
    { pole_id: 4, bairro: 'Vila Nova', created_at: '2026-01-01' },
  ];
  const reports = [
    { pole_id: 2, neighborhood: 'Outro bairro', created_at: '2026-03-01' },
    { pole_id: 5, neighborhood: 'Vila Nova', created_at: '2026-02-01' },
  ];
  assert.deepEqual(problemPolesByNeighborhood(poles, orders, reports), [
    { name: 'Centro', count: 2 },
    { name: 'Vila Nova', count: 2 },
    { name: 'Bairro não informado', count: 1 },
  ]);
});
