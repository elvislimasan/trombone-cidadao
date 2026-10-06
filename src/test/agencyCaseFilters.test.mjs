import test from 'node:test';
import assert from 'node:assert/strict';
import { applyAgencyFilters, agencyAttentionAreas, agencyCasePoint, loadAgencyMapCases } from '../lib/agencyCaseFilters.js';

test('filtros de categoria, antiguidade, responsável e atraso precedem paginação', () => {
  const calls = [];
  const query = new Proxy({}, { get: (_, method) => (...args) => { calls.push([method, ...args]); return query; } });
  applyAgencyFilters(query, { category: 'iluminacao', priority: 'alta', assignment: 'minhas', userId: 'u', age: '30', overdue: true, sort: 'antigas' }, new Date('2026-09-24T00:00:00Z')).range(0, 24);
  assert.deepEqual(calls, [
    ['eq', 'report.category_id', 'iluminacao'], ['eq', 'prioridade', 'alta'], ['eq', 'atribuido_a', 'u'],
    ['lt', 'prazo_em', '2026-09-24T00:00:00.000Z'], ['not', 'status', 'in', '(encerrada,recusada)'],
    ['lte', 'report.created_at', '2026-08-25T00:00:00.000Z'],
    ['order', 'report(created_at)', { ascending: true, nullsFirst: false }],
    ['order', 'report_id', { ascending: true }], ['range', 0, 24],
  ]);
});

test('mapa percorre todos os lotes e não retorna dados parciais após erro', async () => {
  const rows = Array.from({ length: 1123 }, (_, report_id) => ({ report_id }));
  const result = await loadAgencyMapCases(() => ({ range: async (from, to) => ({ data: rows.slice(from, to + 1) }) }));
  assert.equal(result.length, 1123);
  await assert.rejects(loadAgencyMapCases(() => ({ range: async (from) => from ? { error: new Error('falha no segundo lote') } : { data: rows.slice(0, 500) } })), /segundo lote/);
  assert.equal(await loadAgencyMapCases(() => { throw Error('não deve consultar'); }, () => false), null);
});

test('concentração considera somente abertas com coordenadas válidas e separa cidades', () => {
  const item = { status: 'nova', prazo_em: '2026-09-01', canal: { city_id: 64 }, report: { location: { type: 'Point', coordinates: [-38.57, -8.6] }, created_at: '2026-08-01', neighborhood: 'Centro' } };
  const areas = agencyAttentionAreas([item, item, { ...item, status: 'encerrada' }, { ...item, report: { location: null } }, { ...item, canal: { city_id: 65 } }], Date.parse('2026-09-24'));
  assert.equal(areas.length, 2);
  assert.equal(areas[0].count, 2);
  assert.equal(areas[0].overdue, 2);
  assert.equal(areas[0].oldestDays, 54);
  assert.equal(agencyCasePoint({ report: { location: { type: 'Point', coordinates: [null, 0] } } }), null);
  assert.equal(agencyCasePoint({ report: { location: { type: 'Point', coordinates: [0, 100] } } }), null);
});
