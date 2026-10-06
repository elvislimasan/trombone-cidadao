import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { neighborhoodFromAddress, parseOptions, reportPosition, resolveReportNeighborhood, saveReportNeighborhood } from '../../scripts/backfill-report-neighborhoods.mjs';

const report = { id: 'report-id', city_id: 64, address: 'Rua A', neighborhood: null, location: { type: 'Point', coordinates: [-38.58, -8.6] } };
const neighborhoods = [{ name: 'Centro' }, { name: 'Três Marias' }, { name: 'Santa Rosa' }];

test('comando exige cidade e simula por padrão; geocode e aplicação são explícitos', () => {
  assert.deepEqual(parseOptions(['--city-id', '64']), { cityId: 64, limit: null, geocode: false, apply: false, help: false });
  assert.deepEqual(parseOptions(['--city-id', '64', '--limit', '10', '--geocode', '--apply']), { cityId: 64, limit: 10, geocode: true, apply: true, help: false });
  assert.throws(() => parseOptions(['--apply']), /--city-id/);
  assert.throws(() => parseOptions(['--city-id', '0']), /inteiro positivo/);
});

test('extrai apenas bairros explícitos e únicos; nomes de ruas não viram bairros', () => {
  assert.equal(neighborhoodFromAddress('Rua A - Três Marias - Floresta - Pernambuco', neighborhoods), 'Três Marias');
  assert.equal(neighborhoodFromAddress('Rua A, bairro: tres marias', neighborhoods), 'Três Marias');
  assert.equal(neighborhoodFromAddress('Rua Centro - Floresta - Pernambuco', neighborhoods), null);
  assert.equal(neighborhoodFromAddress('Rua Santa Rosa - Centro - Floresta - Pernambuco', neighborhoods), 'Centro');
  assert.equal(neighborhoodFromAddress('Rua A, perto do Centro', neighborhoods), null);
  assert.equal(neighborhoodFromAddress('Rua A - Centro - Santa Rosa', neighborhoods), null);
  assert.equal(neighborhoodFromAddress('Bairro Cohab no Distrito de Nazaré do Pico', [{ name: 'Cohab' }, { name: 'Distrito Nazaré do Pico' }]), 'Cohab');
  assert.equal(neighborhoodFromAddress('Rua Doutor Horácio Falcão no bairro Caetano 2', [{ name: 'Caetano 2' }]), 'Caetano 2');
  assert.equal(neighborhoodFromAddress(null, neighborhoods), null);
});

test('Bomba explícita e DNER abreviado usam o bairro cadastrado da cidade', () => {
  const local = [{ name: 'Bomba' }, { name: 'São Francisco de Assis (DNER)' }, { name: 'Centro' }];
  assert.equal(neighborhoodFromAddress('Rua Antônio Alves de Barros - Bomba - Floresta - Pernambuco', local), 'Bomba');
  assert.equal(neighborhoodFromAddress('São Francisco de Assis - DNER - Floresta - Pernambuco', local), 'São Francisco de Assis (DNER)');
  assert.equal(neighborhoodFromAddress('Rua Paulo Fernandes Nunes, DNER', local), 'São Francisco de Assis (DNER)');
  assert.equal(neighborhoodFromAddress('Rua Juraci de Souza Gomes, bairro DNER', local), 'São Francisco de Assis (DNER)');
  assert.equal(neighborhoodFromAddress('Calçadão do DNER na Avenida Manoel Alves de Carvalho', local), 'São Francisco de Assis (DNER)');
  assert.equal(neighborhoodFromAddress('Bairro Centro, no DNER', local), null);
  assert.equal(neighborhoodFromAddress('Rua DNER - Centro - Floresta', local), 'Centro');
  assert.equal(neighborhoodFromAddress('Rua Paulo Fernandes Nunes, DNER', [{ name: 'Centro' }]), null);
});

test('bairro explícito mais outro segmento cadastrado exige revisão, sem escolher o primeiro', async () => {
  const local = [{ name: 'Centro' }, { name: 'AABB' }, { name: 'São Francisco de Assis (DNER)' }];
  for (const address of ['Rua A, Bairro Centro, AABB', 'Rua A - Bairro: Centro - AABB', 'Rua A, bairro DNER, Centro']) {
    assert.equal(neighborhoodFromAddress(address, local), null);
    assert.deepEqual(await resolveReportNeighborhood(null, { ...report, address }, local),
      { neighborhood: null, reason: 'needs_geocode' });
  }
  assert.equal(neighborhoodFromAddress('Rua A, Bairro Centro, Centro', local), 'Centro');
});

test('coordenadas GeoJSON respeitam a ordem longitude, latitude e rejeitam valores inválidos', () => {
  assert.deepEqual(reportPosition(report), { lat: -8.6, lng: -38.58 });
  assert.deepEqual(reportPosition({ location: { lat: 0, lng: 0 } }), { lat: 0, lng: 0 });
  for (const location of [null, {}, { type: 'LineString', coordinates: [[1, 2]] }, { type: 'Point', coordinates: [181, 0] }, { type: 'Point', coordinates: [0, ''] }]) {
    assert.equal(reportPosition({ location }), null);
  }
});

test('bairro explícito no endereço dispensa geocode; prévia sem geocode não inventa bairro', async () => {
  assert.deepEqual(await resolveReportNeighborhood(null, { ...report, address: 'Rua A - Centro' }, neighborhoods), { neighborhood: 'Centro', source: 'address' });
  assert.deepEqual(await resolveReportNeighborhood(null, report, neighborhoods), { neighborhood: null, reason: 'needs_geocode' });
});

test('geocode só preenche bairro quando confirma o mesmo município', async () => {
  const lookup = async () => ({ city: 'Floresta', state_uf: 'PE', suburb: 'Três Marias' });
  const sameCity = { rpc: async () => ({ data: '64' }) };
  const otherCity = { rpc: async () => ({ data: 99 }) };
  assert.deepEqual(await resolveReportNeighborhood(sameCity, report, neighborhoods, { geocode: true, lookup }), { neighborhood: 'Três Marias', source: 'coordinates' });
  assert.deepEqual(await resolveReportNeighborhood(otherCity, report, neighborhoods, { geocode: true, lookup }), { neighborhood: null, reason: 'city_mismatch' });
  for (const suburb of [null, '', 'Floresta']) {
    const result = await resolveReportNeighborhood(sameCity, report, neighborhoods, { geocode: true, lookup: async () => ({ city: 'Floresta', suburb }) });
    assert.equal(result.neighborhood, null);
  }
});

test('geocode composto não grava Né Maniçoba e AABB como um bairro só', async () => {
  const db = { rpc: async () => ({ data: 64 }) };
  const result = await resolveReportNeighborhood(db, {
    ...report, address: 'Avenida Dom Hélder Câmara - Né Maniçoba - AABB - Floresta - Pernambuco',
  }, [{ name: 'Né Maniçoba' }, { name: 'AABB' }], {
    geocode: true, lookup: async () => ({ city: 'Floresta', state_uf: 'PE', suburb: 'Né Maniçoba - AABB' }),
  });
  assert.deepEqual(result, { neighborhood: null, reason: 'neighborhood_not_registered', candidate: 'Né Maniçoba - AABB' });
});

function fakeClient({ changed = false, error = false } = {}) {
  const calls = [];
  const db = createClient('https://example.supabase.co', 'test-service-key', {
    auth: { persistSession: false },
    global: { fetch: async (input, init) => {
      calls.push({ url: new URL(input), method: init.method, body: JSON.parse(init.body) });
      if (error) return Response.json({ message: 'Falha na gravação' }, { status: 500 });
      if (changed) return Response.json({ code: 'PGRST116', message: 'No rows', details: 'The result contains 0 rows' }, { status: 406 });
      return Response.json({ ...report, neighborhood: 'Centro' });
    } },
  });
  return { db, calls };
}

test('grava somente bairro e protege endereço, marcador, cidade e bairro contra alterações concorrentes', async () => {
  const { db, calls } = fakeClient();
  const result = await saveReportNeighborhood(db, report, ' Centro ');
  assert.equal(result.saved.neighborhood, 'Centro');
  assert.equal(calls.length, 1);
  const { url, method, body } = calls[0];
  assert.equal(method, 'PATCH');
  assert.deepEqual(body, { neighborhood: 'Centro' });
  assert.equal(url.searchParams.get('city_id'), 'eq.64');
  assert.equal(url.searchParams.get('address'), 'eq.Rua A');
  assert.equal(url.searchParams.get('location'), 'eq.SRID=4326;POINT(-38.58 -8.6)');
  assert.equal(url.searchParams.get('neighborhood'), 'is.null');
  const changed = fakeClient({ changed: true });
  assert.deepEqual(await saveReportNeighborhood(changed.db, report, 'Centro'), { skipped: true });
});

test('não sobrescreve bairro existente nem grava resposta vazia; falhas de gravação são propagadas', async () => {
  const { db, calls } = fakeClient();
  assert.deepEqual(await saveReportNeighborhood(db, { ...report, neighborhood: 'Santa Rosa' }, 'Centro'), { skipped: true });
  assert.deepEqual(await saveReportNeighborhood(db, report, ' '), { skipped: true });
  assert.equal(calls.length, 0);
  await assert.rejects(saveReportNeighborhood(fakeClient({ error: true }).db, report, 'Centro'), /Falha na gravação/);
});
