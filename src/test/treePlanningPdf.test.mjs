import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTreePlanningPdf } from '../lib/treePlanningPdf.js';
import { allTreeRows } from '../lib/treeInventory.js';
import { loadCityTrees } from '../lib/arborization.js';

test('paginação não trunca registros quando o servidor devolve menos linhas do que o limite solicitado', async () => {
  const data = Array.from({ length: 1201 }, (_, id) => ({ id, city_id: 64 }));
  const client = { from() { let start, end; const query = { select() { return query; }, order() { return query; }, eq() { return query; }, range(a, b) { start = a; end = b; return query; }, then(ok, fail) { return Promise.resolve({ data: data.slice(start, Math.min(end + 1, start + 250)), error: null }).then(ok, fail); } }; return query; } };
  assert.equal((await loadCityTrees(client, 64)).length, 1201);
  assert.equal((await allTreeRows(client, 'bairros')).length, 1201);
});

test('PDF gera tabelas multipágina e gráficos a partir do planejamento sem exigir canvas', async () => {
  const trees = Array.from({ length: 90 }, (_, id) => ({ id, city_id: 64, planting_year: 2027 + id % 2, status: id % 2 ? 'saudavel' : 'planejada', planted_at: id % 2 ? '2028-02-01' : null, neighborhood: 'Centro', bairro_id: 'b1', street_name: `Rua ${id}` }));
  const doc = await buildTreePlanningPdf({ trees, cities: [{ id: 64, name: 'Floresta' }], cityName: 'Floresta · PE', scope: 'Anos 2027 e 2028', now: new Date('2026-11-04T12:00:00Z') });
  assert.ok(doc.getNumberOfPages() >= 3);
  assert.ok(doc.lastAutoTable.finalY < 195);
  assert.match(doc.output().slice(0, 8), /^%PDF-/);
  assert.equal(doc.lastAutoTable.body.length, 90);
  await assert.rejects(buildTreePlanningPdf({ trees: [] }), /Nenhum plantio/);
});
