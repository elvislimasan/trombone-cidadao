import test from 'node:test';
import assert from 'node:assert/strict';
import { treeMaintenancePayload, treeMaintenanceSelection } from '../lib/treeMaintenance.js';

test('programação valida ação e data sem alterar outros campos da árvore', () => {
  assert.deepEqual(treeMaintenancePayload('poda', '2026-12-20'), { maintenance_action: 'poda', maintenance_due_at: '2026-12-20' });
  assert.deepEqual(treeMaintenancePayload('vistoria'), { maintenance_action: 'vistoria', maintenance_due_at: null });
  for (const action of ['', 'nenhuma', 'concluida', '__proto__']) assert.throws(() => treeMaintenancePayload(action), /manejo/);
  for (const dueAt of ['2026-02-30', '2026-13-01', '20/12/2026', '0000-01-01', 'infinity']) assert.throws(() => treeMaintenancePayload('poda', dueAt), /prazo/);
});

test('seleção deduplica IDs e rejeita árvore removida, ausente ou de outra cidade', () => {
  const trees = [{ id: 'a', city_id: 64, status: 'saudavel' }, { id: 'b', city_id: 64, status: 'risco' }, { id: 'c', city_id: 65, status: 'saudavel' }, { id: 'd', city_id: 64, status: 'removida' }];
  assert.deepEqual(treeMaintenanceSelection(trees, ['a', 'b', 'a'], '64'), ['a', 'b']);
  assert.throws(() => treeMaintenanceSelection(trees, [], 64), /Selecione/);
  for (const id of ['c', 'd', 'missing']) assert.throws(() => treeMaintenanceSelection(trees, ['a', id], 64), /indisponíveis/);
  assert.throws(() => treeMaintenanceSelection(trees, ['a'], null), /cidade/);
});
