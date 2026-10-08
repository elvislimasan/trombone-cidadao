import test from 'node:test';
import assert from 'node:assert/strict';
import { buildNeighborhoodQuery, parseNeighborhoodCandidates, fetchNeighborhoodCandidates,
  neighborhoodSourceUrl, NEIGHBORHOOD_OVERPASS_URL } from '../lib/neighborhoodBoundaryImport.js';
import { saveNeighborhoodBoundary } from '../lib/neighborhoodBoundary.js';
import { criarPdfDoMapaDeRuas } from '../lib/pavementMapPdf.js';

const ring = [[-38.572, -8.603], [-38.567, -8.603], [-38.567, -8.598], [-38.572, -8.598], [-38.572, -8.603]];
const geometry = (points) => points.map(([lon, lat]) => ({ lon, lat }));
const tags = { name: 'Centro', place: 'suburb' };
const way = { type: 'way', id: 321, tags, timestamp: '2026-10-07T10:00:00Z', geometry: geometry(ring) };
const city = { id: 1, name: 'Floresta', state: { uf: 'PE' } };
const cityElement = { type: 'relation', id: 789, tags: { name: 'Floresta', boundary: 'administrative', admin_level: '8' } };
const dataset = (elements) => ({ osm3s: { timestamp_osm_base: '2026-10-08T10:00:00Z' }, elements: [cityElement, ...elements] });

test('consulta atual identifica o município dentro da UF e usa metadados de edição, sem interpolar comandos', () => {
  const query = buildNeighborhoodQuery(city);
  assert.match(query, /ISO3166-2.*BR-PE/);
  assert.match(query, /admin_level.*8/);
  assert.match(query, /out meta geom/);
  assert.ok(buildNeighborhoodQuery({ ...city, name: 'Cidade";out;' }).includes('Cidade\\";out;'));
  assert.throws(() => buildNeighborhoodQuery({ name: 'Floresta' }), /UF/);
});

test('importação conserva longitude, contorno e datas da fonte; contornos mais recentes vêm primeiro', () => {
  const old = { ...way, id: 320, timestamp: '2024-05-01T10:00:00Z' };
  const result = parseNeighborhoodCandidates(dataset([old, way]), 'Bairro Centro', '2026-10-08T10:10:00Z');
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates[0].points, ring.slice(0, -1));
  assert.equal(result.candidates[0].source.object_id, 321);
  assert.equal(result.candidates[0].source.source_name, 'Centro');
  assert.equal(result.candidates[0].source.base_updated_at, '2026-10-08T10:00:00Z');
  assert.equal(result.candidates[0].source.queried_at, '2026-10-08T10:10:00Z');
  assert.equal(neighborhoodSourceUrl(result.candidates[0].source), 'https://www.openstreetmap.org/way/321');
  assert.equal(neighborhoodSourceUrl({ provider: 'osm', object_type: 'javascript', object_id: 1 }), null);
});

test('relações juntam trechos invertidos, preservando exatamente os vértices de um contorno fechado', () => {
  const relation = { type: 'relation', id: 322, tags, members: [
    { type: 'way', role: 'outer', geometry: geometry(ring.slice(0, 3)) },
    { type: 'way', role: 'outer', geometry: geometry(ring.slice(2).reverse()) },
  ] };
  assert.deepEqual(parseNeighborhoodCandidates(dataset([relation]), 'Centro').candidates[0].points, ring.slice(0, -1));
});

test('aceita a representação histórica de limites externos com papel vazio usada nos dados reais de Floresta', () => {
  const relation = { type: 'relation', id: 20660512, tags: { ...tags, type: 'boundary' }, members: [
    { type: 'way', role: '', geometry: geometry(ring) },
  ] };
  assert.deepEqual(parseNeighborhoodCandidates(dataset([relation]), 'Centro').candidates[0].points, ring.slice(0, -1));
});

test('não inventa contornos a partir de pontos, ruas abertas, bairros parecidos ou geometrias incompletas', () => {
  const data = dataset([
    { type: 'node', id: 1, tags, lat: -8.6, lon: -38.57 },
    { ...way, geometry: geometry(ring.slice(0, 3)) },
    { ...way, tags: { ...tags, name: 'Centro II' } },
    { ...way, tags: { name: 'Centro', boundary: 'administrative', admin_level: '8' } },
    { type: 'relation', id: 322, tags, members: [{ type: 'way', role: 'outer' }] },
  ]);
  const result = parseNeighborhoodCandidates(data, 'Centro');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.found, 3);
  assert.equal(result.rejected.length, 3);
});

test('ilhas, furos e cruzamentos não são apagados silenciosamente para caber no editor', () => {
  const outer = { type: 'way', role: 'outer', geometry: geometry(ring) };
  const relations = [
    { type: 'relation', id: 1, tags, members: [outer, { ...outer, role: 'inner' }] },
    { type: 'relation', id: 2, tags, members: [outer, outer] },
    { ...way, geometry: geometry([ring[0], ring[2], ring[1], ring[3], ring[0]]) },
  ];
  const result = parseNeighborhoodCandidates(dataset(relations), 'Centro');
  assert.equal(result.candidates.length, 0);
  assert.equal(result.rejected.length, 3);
});

test('busca é nova a cada clique, distingue município não identificado de bairro sem área e informa falhas', async () => {
  let calls = 0;
  const fetchImpl = async (url, options) => {
    calls += 1;
    assert.equal(url, NEIGHBORHOOD_OVERPASS_URL);
    assert.equal(options.cache, 'no-store');
    assert.match(new URLSearchParams(options.body).get('data'), /Floresta/);
    return { ok: true, json: async () => dataset([way]) };
  };
  for (let i = 0; i < 2; i += 1) assert.equal((await fetchNeighborhoodCandidates({ city, bairroName: 'Centro', fetchImpl })).candidates.length, 1);
  assert.equal(calls, 2);
  const fail = (result) => fetchNeighborhoodCandidates({ city, bairroName: 'Centro', fetchImpl: async () => result });
  await assert.rejects(fail({ ok: true, json: async () => ({ elements: [] }) }), /município/);
  await assert.rejects(fail({ ok: true, json: async () => ({ remark: 'runtime timeout' }) }), /não foi concluída/);
  await assert.rejects(fail({ ok: false, status: 429 }), /limitando/);
  await assert.rejects(fail({ ok: false, status: 500 }), /indisponível/);
  assert.equal((await fail({ ok: true, json: async () => dataset([]) })).candidates.length, 0);
});

test('fonte acompanha a geometria no salvamento e a atribuição aparece no PDF', async () => {
  const candidate = parseNeighborhoodCandidates(dataset([way]), 'Centro').candidates[0];
  let saved;
  const query = { insert(values) { saved = values; return query; }, select() { return query; }, single: async () => ({ data: saved }) };
  await saveNeighborhoodBoundary({ supabase: { from: () => query }, bairro: { id: 'b1', city_id: 1 }, points: candidate.points, source: candidate.source });
  assert.deepEqual(saved.source, candidate.source);
  const doc = criarPdfDoMapaDeRuas({ ruas: [{ bairro_id: 'b1', bairro: { name: 'Centro' }, linhas: [[[-8.60, -38.57], [-8.601, -38.568]]] }], contornosBairros: [{ bairro_id: 'b1', source: candidate.source, boundary: { type: 'Polygon', coordinates: [ring] } }] });
  assert.match(doc.internal.pages[1].join('\n'), /OpenStreetMap contributors/);
  assert.match(doc.internal.pages[1].join('\n'), /https:\/\/www.openstreetmap.org\/copyright/);
});
