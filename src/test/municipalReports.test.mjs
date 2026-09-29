import test from 'node:test';
import assert from 'node:assert/strict';
import { loadMunicipalReportFacets, loadMunicipalReportPage, loadPendingMapReports, reportAge, reportAgeBounds, reportPageNumbers } from '../lib/municipalReports.js';

function fakeClient(rows, links = [], linkError = null, catalog = []) {
  rows = rows.map((item) => ({ status: 'pending', ...item }));
  const batches = [];
  const client = {
    batches,
    from(table) {
      let selected = table === 'bairros' ? catalog : rows;
      let start = 0;
      let end = Infinity;
      let signal;
      const orders = [];
      const query = {
        select() { return query; },
        eq(key, value) { selected = selected.filter((item) => item[key] === value); return query; },
        or() { return query; },
        gte(key, value) { selected = selected.filter((item) => item[key] >= value); return query; },
        lt(key, value) { selected = selected.filter((item) => item[key] < value); return query; },
        in(key, values) { selected = selected.filter((item) => values.includes(item[key])); return query; },
        order(key, { ascending = true } = {}) { orders.push([key, ascending]); return query; },
        range(from, to) { start = from; end = to; return query; },
        abortSignal(value) { signal = value; return query; },
        then(resolve, reject) {
          selected = [...selected].sort((a, b) => {
            for (const [key, ascending] of orders) {
              if (a[key] !== b[key]) return (a[key] < b[key] ? -1 : 1) * (ascending ? 1 : -1);
            }
            return 0;
          });
          return Promise.resolve(signal?.aborted ? { error: new Error('Aborted') } : { data: selected.slice(start, end + 1), count: selected.length }).then(resolve, reject);
        },
      };
      return query;
    },
    rpc(_name, { p_reports }) {
      batches.push(p_reports);
      const result = { data: links.filter((item) => p_reports.includes(item.report_id)), error: linkError };
      const request = { abortSignal() { return request; }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
      return request;
    },
  };
  return client;
}

test('idade e filtros usam dias de calendário e não deixam lacunas nas faixas', () => {
  const now = new Date(2026, 8, 28, 10, 30);
  const choices = ['7', '15', '30', 'older'];
  for (const days of [0, 1, 7, 8, 15, 16, 30, 31, 60]) {
    const created = new Date(2026, 8, 28 - days, 23, 59);
    assert.equal(reportAge(created.toISOString(), now), days);
    const matching = choices.filter((age) => {
      const { from, before } = reportAgeBounds(age, now);
      return (!from || created >= new Date(from)) && (!before || created < new Date(before));
    });
    assert.deepEqual(matching, [days <= 7 ? '7' : days <= 15 ? '15' : days <= 30 ? '30' : 'older']);
  }
  assert.equal(reportAge('invalid', now), null);
  assert.equal(reportAge(null, now), null);
});

test('sem ordem filtra vínculos de outras secretarias antes de contar e paginar', async () => {
  const rows = Array.from({ length: 1105 }, (_, index) => ({ id: String(index).padStart(4, '0'), city_id: 1, created_at: '2026-09-28T10:00:00Z' }));
  rows.push({ id: 'outra-cidade', city_id: 2, created_at: '2026-09-28T10:00:00Z' });
  const links = rows.filter((_, index) => index % 3 === 0).map((item) => ({ report_id: item.id, demanda_id: null }));
  const client = fakeClient(rows, links);
  const result = await loadMunicipalReportPage(client, { cityId: 1, municipalityId: 'prefeitura', withoutOrder: true }, 26, 20);
  const unlinked = rows.filter((item) => item.city_id === 1 && !links.some((link) => link.report_id === item.id));
  assert.equal(result.total, unlinked.length);
  assert.deepEqual(result.reports.map((item) => item.id), unlinked.slice(500, 520).map((item) => item.id));
  assert.equal(result.reports.length, 20);
  assert.deepEqual(client.batches.map((ids) => ids.length), [500, 500, 105]);
});

test('falha ao consultar vínculos não apresenta broncas como sem ordem', async () => {
  const client = fakeClient([{ id: '1', city_id: 1, created_at: '2026-09-28' }], [], new Error('Falha nos vínculos'));
  await assert.rejects(loadMunicipalReportPage(client, { cityId: 1, withoutOrder: true }, 1, 20), /Falha nos vínculos/);
});

test('paginação normal omite broncas já vinculadas antes de contar', async () => {
  const rows = Array.from({ length: 42 }, (_, index) => ({ id: String(index).padStart(2, '0'), city_id: 1, created_at: '2026-09-28', category_id: 'iluminacao' }));
  const client = fakeClient(rows, [{ report_id: '25', demanda_id: 'ordem' }]);
  const result = await loadMunicipalReportPage(client, { cityId: 1, municipalityId: 'prefeitura', category: 'iluminacao' }, 2, 20);
  assert.equal(result.total, 41);
  assert.deepEqual(result.reports.map((item) => item.id), rows.filter((item) => item.id !== '25').slice(20, 40).map((item) => item.id));
  assert.deepEqual(result.links, []);
});

test('contadores e bairros cobrem todos os lotes e somente a cidade ativa', async () => {
  const rows = Array.from({ length: 1005 }, (_, index) => ({ id: index, city_id: 1, category_id: index % 2 ? 'buracos' : 'iluminacao', neighborhood: index % 2 ? 'Três Marias' : 'Centro', created_at: '2026-09-28' }));
  rows.push({ id: 'fora', city_id: 2, category_id: 'poda', neighborhood: 'Outro bairro' });
  const catalog = [{ name: 'AABB', city_id: 1 }, { name: 'Cohab', city_id: 1 }, { name: 'Outro bairro', city_id: 2 }];
  const result = await loadMunicipalReportFacets(fakeClient(rows, [], null, catalog), { cityId: 1, municipalityId: 'prefeitura' });
  assert.deepEqual(result.counts, { all: 1005, iluminacao: 503, buracos: 502 });
  assert.deepEqual(result.neighborhoods, ['AABB', 'Centro', 'Cohab', 'Três Marias']);
  assert.deepEqual(result.neighborhoodCounts, { Centro: 503, 'Três Marias': 502 });
});

test('bairro cadastrado sem bronca classificada aparece com zero, sem criar resultado falso', async () => {
  const rows = [{ id: '1', city_id: 1, category_id: 'iluminacao', neighborhood: null, address: 'Rua A - AABB', created_at: '2026-09-28' }];
  const catalog = [{ name: 'AABB', city_id: 1 }, { name: 'Cohab', city_id: 1 }];
  const client = fakeClient(rows, [], null, catalog);
  const facets = await loadMunicipalReportFacets(client, { cityId: 1, municipalityId: 'prefeitura' });
  assert.deepEqual(facets.neighborhoods, ['AABB', 'Cohab']);
  assert.deepEqual(facets.neighborhoodCounts, {});
  const filtered = await loadMunicipalReportPage(client, { cityId: 1, municipalityId: 'prefeitura', neighborhood: 'AABB' }, 1, 20);
  assert.equal(filtered.total, 0);
});

test('paginação numérica preserva primeira e última páginas sem duplicar botões', () => {
  assert.deepEqual(reportPageNumbers(1, 1), [1]);
  assert.deepEqual(reportPageNumbers(1, 27), [1, 2, 'gap-27', 27]);
  assert.deepEqual(reportPageNumbers(14, 27), [1, 'gap-13', 13, 14, 15, 'gap-27', 27]);
  assert.deepEqual(reportPageNumbers(27, 27), [1, 'gap-26', 26, 27]);
});

test('lista, mapa e contadores consultam somente broncas pendentes sem ordem', async () => {
  const statuses = ['pending', 'in-progress', 'pending_resolution', 'resolved', 'duplicate', 'pending_approval', 'rejected', null];
  const rows = statuses.map((status, index) => ({ id: String(index), status, city_id: 1, category_id: 'iluminacao', neighborhood: status, created_at: '2026-09-28' }));
  const filters = { cityId: 1, municipalityId: 'prefeitura' };
  const client = fakeClient(rows);
  const page = await loadMunicipalReportPage(client, filters, 1, 20);
  const map = await loadPendingMapReports(client, filters);
  const facets = await loadMunicipalReportFacets(client, filters);
  assert.deepEqual(page.reports.map((item) => item.status), ['pending']);
  assert.equal(page.total, 1);
  assert.equal(map.length, 1);
  assert.deepEqual(facets.counts, { all: 1, iluminacao: 1 });
  assert.equal(facets.neighborhoods.includes('resolved'), false);
  const closedFilter = await loadMunicipalReportPage(client, { ...filters, status: 'resolved' }, 1, 20);
  assert.equal(closedFilter.total, 0);
});

test('abas acompanham idade, bairro e vínculos, independentemente da categoria escolhida', async () => {
  const rows = [
    { id: '1', city_id: 1, category_id: 'iluminacao', neighborhood: 'Centro', created_at: '2026-09-28T12:00:00Z' },
    { id: '2', city_id: 1, category_id: 'buracos', neighborhood: 'Centro', created_at: '2026-09-28T12:00:00Z' },
    { id: '3', city_id: 1, category_id: 'poda', neighborhood: 'Centro', created_at: '2026-09-28T12:00:00Z' },
    { id: '4', city_id: 1, category_id: 'buracos', neighborhood: 'Outro', created_at: '2026-09-28T12:00:00Z' },
  ];
  const client = fakeClient(rows, [{ report_id: '2', demanda_id: null }]);
  const facets = await loadMunicipalReportFacets(client, { cityId: 1, municipalityId: 'prefeitura', category: 'iluminacao', neighborhood: 'Centro', age: '7', now: new Date(2026, 8, 29) });
  assert.deepEqual(facets.counts, { all: 2, iluminacao: 1, poda: 1 });
  assert.deepEqual(facets.neighborhoodCounts, { Centro: 2 });
  assert.deepEqual((await loadMunicipalReportPage(client, { cityId: 1, municipalityId: 'prefeitura', category: 'iluminacao', neighborhood: 'Centro' }, 1, 20)).reports.map((item) => item.id), ['1']);
});
