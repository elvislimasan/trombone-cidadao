import test from 'node:test';
import assert from 'node:assert/strict';
import { availableStaffModules, enabledStaffModules, initialStaffAccess, toggleStaffModule } from '../lib/municipalStaffModules.js';
const agriculture = { municipal_modules: ['arborization', 'water_supply'], categorias: [{ category_id: 'poda' }] };

test('herda os módulos existentes e futuros da secretaria sem liberar outras áreas', () => {
  assert.deepEqual(enabledStaffModules(agriculture, {}).map(row => row.id), ['arborization', 'water_supply']);
  assert.deepEqual(availableStaffModules({ municipal_modules: ['water_supply', 'desconhecido'] }).map(row => row.id), ['water_supply']);
  assert.deepEqual(availableStaffModules(null), []);
});
test('desativação individual preserva o cargo e pode bloquear um ou todos os módulos', () => {
  const access = { cargos: ['gestor'], disabled_modules: [] };
  const restricted = toggleStaffModule(access, 'water_supply', false);
  assert.deepEqual(enabledStaffModules(agriculture, restricted).map(row => row.id), ['arborization']);
  assert.deepEqual(access.disabled_modules, []);
  assert.deepEqual(restricted.cargos, ['gestor']);
  assert.deepEqual(enabledStaffModules(agriculture, toggleStaffModule(restricted, 'arborization', false)), []);
  assert.equal(toggleStaffModule(restricted, 'water_supply', false).disabled_modules.length, 1);
  assert.deepEqual(enabledStaffModules(agriculture, toggleStaffModule(restricted, 'water_supply', true)).map(row => row.id), ['arborization', 'water_supply']);
});
test('uma nova área da secretaria é herdada sem remover bloqueios individuais', () => {
  const access = { disabled_modules: ['water_supply'] };
  const expanded = { ...agriculture, municipal_modules: [...agriculture.municipal_modules, 'lighting'] };
  assert.deepEqual(enabledStaffModules(expanded, access).map(row => row.id), ['arborization', 'lighting']);
});
test('trocar secretaria inicia herança nova e pipa sem categorias permite escolher cargo', () => {
  assert.deepEqual(initialStaffAccess(agriculture), { cargos: [], disabled_modules: [] });
  assert.deepEqual(initialStaffAccess({ municipal_modules: ['water_supply'], categorias: [] }).cargos, []);
  assert.deepEqual(initialStaffAccess({ municipal_modules: ['arborization'], categorias: [] }).cargos, ['inventario']);
});
