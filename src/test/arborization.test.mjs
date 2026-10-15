import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_TREE, filterTrees, loadCityTrees, treePayload, treesCsv, treeStats } from '../lib/arborization.js';

const form = { ...EMPTY_TREE, common_name: '  Ipê-amarelo  ', latitude: '-8,6', longitude: '-38.57' };
const trees = [
  { id: '1', city_id: 64, common_name: 'Ipê-amarelo', scientific_name: 'Handroanthus albus', address: 'Praça São José', neighborhood: 'Centro', status: 'saudavel', origin: 'nativa', maintenance_action: 'nenhuma' },
  { id: '2', city_id: 64, common_name: 'Nim', neighborhood: 'Centro', status: 'risco', origin: 'exotica', maintenance_action: 'vistoria' },
  { id: '3', city_id: 65, common_name: 'Ipê removido', neighborhood: 'Norte', status: 'removida', origin: 'nativa', maintenance_action: 'plantio' },
];

test('valida localização obrigatória e medidas, sem converter vazio em zero', () => {
  const payload = treePayload(form, 64);
  assert.equal(payload.common_name, 'Ipê-amarelo');
  assert.equal(payload.latitude, -8.6);
  assert.equal(payload.height_m, null);
  assert.equal(payload.planted_at, null);
  for (const changes of [{ latitude: '' }, { longitude: ' ' }, { latitude: 'NaN' }, { latitude: '91' }, { longitude: '-181' }, { height_m: '-1' }, { crown_diameter_m: '0' }, { common_name: ' ' }, { status: 'invalido' }, { planted_at: '2026-02-30' }]) {
    assert.throws(() => treePayload({ ...form, ...changes }, 64));
  }
  assert.throws(() => treePayload(form, null));
  assert.equal(treePayload({ ...form, latitude: '0', longitude: '0' }, 64).latitude, 0);
  assert.equal(treePayload({ ...form, maintenance_due_at: '2026-10-20' }, 64).maintenance_due_at, null);
});

test('busca sem acentos e filtros de manejo, origem, situação e bairro se combinam', () => {
  assert.deepEqual(filterTrees(trees, { search: 'sao jose' }).map(tree => tree.id), ['1']);
  assert.deepEqual(filterTrees(trees, { search: 'handroanthus' }).map(tree => tree.id), ['1']);
  assert.deepEqual(filterTrees(trees, { neighborhood: 'Centro', action: 'pending', origin: 'exotica', status: 'risco' }).map(tree => tree.id), ['2']);
  assert.equal(filterTrees(trees, { search: 'ausente' }).length, 0);
  assert.equal(filterTrees(trees).length, 3);
});

test('indicadores excluem removidas das árvores nativas vivas, mantendo reposições pendentes', () => {
  assert.deepEqual(treeStats(trees), { total: 3, living: 2, native: 1, risk: 1, pending: 2 });
});

test('CSV preserva acentos, aspas e quebras, identifica cidades e neutraliza fórmulas', () => {
  const csv = treesCsv([{ ...trees[0], common_name: ' =HYPERLINK("x")', notes: 'Linha 1\nLinha 2;teste' }], [{ id: 64, name: 'Floresta' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"Floresta"'));
  assert.ok(csv.includes('"\' =HYPERLINK(""x"")"'));
  assert.ok(csv.includes('"Linha 1\nLinha 2;teste"'));
});

test('carrega mais de mil árvores com filtro de cidade em todas as páginas', async () => {
  const calls = [];
  const client = { from(table) {
    const call = { table }; calls.push(call);
    const query = { select: () => query, order: () => query, range: (start, end) => { call.range = [start, end]; return query; },
      eq: (key, value) => { call.filter = [key, value]; return query; },
      then: resolve => Promise.resolve({ data: Array.from({ length: call.range[0] === 0 ? 1000 : 7 }, (_, index) => ({ id: call.range[0] + index })), error: null }).then(resolve) };
    return query;
  } };
  const result = await loadCityTrees(client, 64);
  assert.equal(result.length, 1007);
  assert.deepEqual(calls.map(call => call.range), [[0, 999], [1000, 1999]]);
  assert.ok(calls.every(call => call.table === 'city_trees' && call.filter[1] === 64));
});

test('erro de consulta não é convertido em inventário vazio', async () => {
  const query = { select: () => query, order: () => query, range: () => query, then: resolve => Promise.resolve({ error: new Error('offline') }).then(resolve) };
  await assert.rejects(loadCityTrees({ from: () => query }, null), /offline/);
});
