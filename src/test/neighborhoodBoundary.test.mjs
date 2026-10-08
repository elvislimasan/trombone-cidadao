import test from 'node:test';
import assert from 'node:assert/strict';
import { boundaryPoints, boundaryValidationError, boundaryWkt, boundaryLabelPoint, pointInBoundary,
  loadNeighborhoodBoundaries, saveNeighborhoodBoundary, removeNeighborhoodBoundary } from '../lib/neighborhoodBoundary.js';
import { criarPdfDoMapaDeRuas } from '../lib/pavementMapPdf.js';

const points = [[-38.572, -8.603], [-38.567, -8.603], [-38.567, -8.598], [-38.572, -8.598]];
const geometry = { type: 'Polygon', coordinates: [[...points, points[0]]] };
const record = { bairro_id: 'b1', bairro: { id: 'b1', name: 'Centro', city_id: 1 }, boundary: geometry, color: '#ffcc99', updated_at: '2026-10-07T12:00:00Z' };

test('contorno fecha em WGS84 sem inverter longitude e latitude e reabre sem vértice duplicado', () => {
  assert.deepEqual(boundaryPoints(geometry), points);
  assert.deepEqual(boundaryPoints({ type: 'Feature', geometry }), points);
  assert.equal(boundaryWkt(points), 'SRID=4326;POLYGON((-38.572 -8.603,-38.567 -8.603,-38.567 -8.598,-38.572 -8.598,-38.572 -8.603))');
  assert.equal(boundaryWkt([...points, points[0]]), boundaryWkt(points));
});

test('contornos inválidos não podem ser salvos ou usados no PDF', () => {
  const invalid = [points.slice(0, 2), [[0, 0], [1, 1], [2, 2]],
    [[0, 0], [2, 2], [0, 2], [2, 0]], [...points, points[1]],
    [[181, 0], [1, 0], [0, 1]], [[0, 0], [1, NaN], [0, 1]],
    [[0, 0], [2, 0], [1, 0], [1, 2]]];
  for (const ring of invalid) {
    assert.ok(boundaryValidationError(ring));
    assert.throws(() => boundaryWkt(ring));
    assert.deepEqual(boundaryPoints({ type: 'Polygon', coordinates: [ring] }), []);
  }
  assert.equal(boundaryValidationError(points), null);
  assert.equal(boundaryValidationError([...points].reverse()), null);
  assert.equal(boundaryValidationError([[0, 0], [1, 0], [2, 0], [2, 2], [0, 2]]), null);
});

test('rótulo de um bairro côncavo fica dentro de sua área', () => {
  const ring = [[0, 0], [6, 0], [6, 1], [1, 1], [1, 6], [0, 6]];
  assert.equal(pointInBoundary([3, 3], ring), false);
  assert.ok(pointInBoundary(boundaryLabelPoint(ring), ring));
  assert.ok(pointInBoundary([0, 3], ring));
});

function client(result) {
  const calls = [];
  const query = Object.fromEntries(['select', 'eq', 'order', 'insert', 'update', 'delete'].map((method) => [method, (...args) => { calls.push([method, ...args]); return query; }]));
  query.single = async () => result;
  query.then = (resolve, reject) => Promise.resolve(result).then(resolve, reject);
  return { calls, supabase: { from(table) { calls.push(['from', table]); return query; } } };
}

test('leitura limita contornos à cidade e edição preserva vínculos das ruas e detecta alterações concorrentes', async () => {
  const read = client({ data: [record] });
  assert.deepEqual(await loadNeighborhoodBoundaries(read.supabase, 1), [record]);
  assert.ok(read.calls.some((call) => call[0] === 'eq' && call[1] === 'bairro.city_id' && call[2] === 1));
  const save = client({ data: record });
  assert.equal(await saveNeighborhoodBoundary({ supabase: save.supabase, bairro: record.bairro, points, color: '#FFCC99', previous: record }), record);
  const update = save.calls.find((call) => call[0] === 'update');
  assert.deepEqual(Object.keys(update[1]).sort(), ['boundary', 'color']);
  assert.equal(update[1].color, '#ffcc99');
  assert.ok(save.calls.some((call) => call[0] === 'eq' && call[1] === 'updated_at' && call[2] === record.updated_at));
  const conflict = client({ error: { code: 'PGRST116' } });
  await assert.rejects(saveNeighborhoodBoundary({ supabase: conflict.supabase, bairro: record.bairro, points, previous: record }), /outra pessoa/);
  await assert.rejects(removeNeighborhoodBoundary({ supabase: conflict.supabase, previous: record }), /outra pessoa/);
});

test('criação e remoção confirmam a linha salva e não ignoram falhas de permissão', async () => {
  const create = client({ data: record });
  await saveNeighborhoodBoundary({ supabase: create.supabase, bairro: record.bairro, points });
  assert.equal(create.calls.find((call) => call[0] === 'insert')[1].bairro_id, 'b1');
  const denied = client({ error: { code: '42501', message: 'Sem permissão' } });
  await assert.rejects(saveNeighborhoodBoundary({ supabase: denied.supabase, bairro: record.bairro, points }), { code: '42501', message: 'Sem permissão' });
  await assert.rejects(removeNeighborhoodBoundary({ supabase: denied.supabase, previous: record }), { code: '42501', message: 'Sem permissão' });
  const remove = client({ data: { bairro_id: 'b1' } });
  await removeNeighborhoodBoundary({ supabase: remove.supabase, previous: record });
  assert.ok(remove.calls.some((call) => call[0] === 'eq' && call[1] === 'updated_at'));
});

test('PDF desenha contorno e cor manual mesmo sem quadra fechada, respeitando o recorte de bairros', () => {
  const ruas = [{ id: 'r1', name: 'Rua A', bairro_id: 'b1', bairro: record.bairro, linhas: [[[-8.60, -38.57], [-8.601, -38.568]]] }];
  const doc = criarPdfDoMapaDeRuas({ ruas, contornosBairros: [record, { ...record, bairro_id: 'fora' }] });
  assert.equal(doc.tromboneMapStats.quadras, 0);
  assert.deepEqual(doc.tromboneMapStats.contornosBairros, [{ bairro_id: 'b1', nome: 'Centro', cor: '#ffcc99', pontos: 4 }]);
  assert.match(doc.internal.pages[1].join('\n'), /1\. 0\.8 0\.6 rg/); // preenchimento RGB realmente emitido no PDF
  assert.match(doc.output(), /^%PDF-/);
  const invalid = criarPdfDoMapaDeRuas({ ruas, contornosBairros: [{ ...record, boundary: { type: 'Polygon', coordinates: [[]] } }] });
  assert.equal(invalid.tromboneMapStats.contornosBairros.length, 0);
});

test('PDF identifica todos os bairros na área com ruas densas, preservando os nomes das ruas', () => {
  const bairros = ['Centro', 'Parque das Acácias', 'São Francisco de Assis (DNER)'];
  const contornos = bairros.map((name, i) => {
    const ring = points.map(([lng, lat]) => [lng + i * 0.005, lat]);
    return { ...record, bairro_id: `b${i}`, bairro: { id: `b${i}`, name },
      boundary: { type: 'Polygon', coordinates: [[...ring, ring[0]]] } };
  });
  const ruas = contornos.flatMap((contorno, i) => Array.from({ length: 14 }, (_, j) => ({
    id: `${i}-${j}`, name: `Rua ${j + 1}`, bairro_id: contorno.bairro_id, bairro: contorno.bairro,
    linhas: [[[-8.6028 + j * 0.00033, -38.5718 + i * 0.005],
      [-8.6028 + j * 0.00033, -38.5672 + i * 0.005]]],
  })));
  const doc = criarPdfDoMapaDeRuas({ ruas, contornosBairros: contornos });
  const stats = doc.tromboneMapStats;
  assert.deepEqual(new Set(stats.bairrosComNomeNoMapa), new Set(bairros));
  assert.deepEqual(stats.bairrosSemNomeNoMapa, []);
  assert.equal(stats.ruasComNomeNoMapa, ruas.length);
  assert.equal(doc.getNumberOfPages(), 1);
  for (const rotulo of stats.rotulosDeBairros) {
    assert.equal(rotulo.texto.join(' '), rotulo.nome.toUpperCase());
    assert.ok(doc.internal.pages[1].join('\n').includes(rotulo.texto[0].replace(/[\\()]/g, '\\$&')));
  }
});

test('PDF reutiliza o contorno pelo nome de origem e complemento de loteamento sem alterar o cadastro', () => {
  for (const [nomeFonte, nomeCadastro, nomeSalvo] of [
    ['Né Maniçoba - AABB', 'Né Maniçoba - AABB', 'AABB'],
    ['Bela Floresta', 'Bela Floresta - Loteamento Rocha', 'Bela Floresta'],
  ]) {
    const contorno = { ...record, bairro: { ...record.bairro, name: nomeSalvo },
      source: { provider: 'osm', source_name: nomeFonte } };
    const ruas = [{ id: 'r1', name: 'Rua A', bairro_id: 'cadastro-antigo',
      bairro: { id: 'cadastro-antigo', name: nomeCadastro }, linhas: [[[-8.6, -38.57], [-8.601, -38.568]]] }];
    const original = structuredClone(ruas);
    const doc = criarPdfDoMapaDeRuas({ ruas, contornosBairros: [contorno] });
    assert.deepEqual(doc.tromboneMapStats.bairrosComNomeNoMapa, [nomeSalvo]);
    assert.equal(doc.tromboneMapStats.contornosBairros.length, 1);
    assert.deepEqual(ruas, original);
    const ambiguo = criarPdfDoMapaDeRuas({ ruas,
      contornosBairros: [contorno, { ...contorno, bairro_id: 'outro' }] });
    assert.equal(ambiguo.tromboneMapStats.contornosBairros.length, 0);
  }
});
