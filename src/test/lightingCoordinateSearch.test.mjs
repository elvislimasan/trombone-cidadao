import test from 'node:test';
import assert from 'node:assert/strict';
import { parseLightingCoordinates, lightingCoordinateBounds, loadLightingPolesNearCoordinates } from '../lib/lightingCoordinateSearch.js';

test('aceita coordenadas coladas com vírgula, espaço, tabulação e separador decimal local', () => {
  for (const input of ['-8.593246, -38.574775', '-8.593246 -38.574775', '-8.593246\t-38.574775', '(-8.593246, -38.574775)', '-8,593246; -38,574775', '-8,593246 -38,574775', '−8.593246, −38.574775']) {
    assert.deepEqual(parseLightingCoordinates(input), { lat: -8.593246, lng: -38.574775 }, input);
  }
  assert.deepEqual(parseLightingCoordinates('0, 0'), { lat: 0, lng: 0 });
  assert.deepEqual(parseLightingCoordinates('-90;180'), { lat: -90, lng: 180 });
});

test('não interpreta endereço, coordenada parcial ou valores fora do intervalo como um ponto válido', () => {
  for (const input of ['', 'Rua A', '-8.593246', '-8.6,', '91,-38', '-8,181', 'NaN,Infinity', '8 38 52', '-8.6x, -38.5', ',']) assert.equal(parseLightingCoordinates(input), null, input);
});

function fakeClient(rows, failure = null) {
  const calls = [];
  const evaluate = (row, condition) => {
    const [field, operator, ...parts] = condition.split('.');
    const raw = parts.join('.');
    const value = raw === 'true' ? true : raw === 'false' ? false : raw === 'null' ? null : operator === 'gte' || operator === 'lte' ? Number(raw) : raw;
    return operator === 'eq' ? row[field] === value : operator === 'is' ? row[field] == null : operator === 'gte' ? row[field] >= value : row[field] <= value;
  };
  return { calls, from(table) {
    assert.equal(table, 'poles');
    let result = [...rows], range = [0, 499];
    const query = {
      select() { return query; },
      eq(field, value) { calls.push(['eq', field, value]); result = result.filter((row) => row[field] === value); return query; },
      neq(field, value) { result = result.filter((row) => row[field] !== value); return query; },
      gte(field, value) { result = result.filter((row) => row[field] >= value && row[field] != null); return query; },
      lte(field, value) { result = result.filter((row) => row[field] <= value && row[field] != null); return query; },
      or(conditions) { result = result.filter((row) => conditions.split(',').some((condition) => evaluate(row, condition))); return query; },
      order() { result.sort((a, b) => a.id - b.id); return query; },
      range(from, to) { range = [from, to]; calls.push(['range', from, to]); return query; },
      abortSignal() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: result.slice(range[0], range[1] + 1), error: failure }).then(resolve, reject); },
    };
    return query;
  } };
}
const point = { lat: -8.6, lng: -38.58 };
const pole = (id, latitude = point.lat, longitude = point.lng, extra = {}) => ({ id, city_id: 64, latitude, longitude, lighting_status: 'aceso', is_broken: false, ...extra });

test('busca somente a cidade ativa, ordena pela distância e exclui o canto da caixa fora do raio', async () => {
  const client = fakeClient([pole(1, -8.6004), pole(2, -8.6001), pole(3, -8.5992, -38.5792), pole(4, point.lat, point.lng, { city_id: 65 }), pole(5, point.lat, point.lng, { lighting_status: 'removido' })]);
  const result = await loadLightingPolesNearCoordinates(client, { cityId: 64, point, radius: 100 });
  assert.deepEqual(result.data.map((p) => p.id), [2, 1]);
  assert.equal(result.count, 2);
  assert.ok(result.data[0].distance_m > 10 && result.data[0].distance_m < 12);
  assert.ok(client.calls.some((call) => call[0] === 'eq' && call[1] === 'city_id' && call[2] === 64));
});

test('respeita status, problema registrado e opção de incluir removidos', async () => {
  const rows = [pole(1), pole(2, point.lat, point.lng, { is_broken: true }), pole(3, point.lat, point.lng, { lighting_status: 'apagado' }), pole(4, point.lat, point.lng, { lighting_status: 'removido' })];
  const broken = await loadLightingPolesNearCoordinates(fakeClient(rows), { cityId: 64, point, filters: { status: 'apagado', removed: true } });
  assert.deepEqual(broken.data.map((p) => p.id), [2, 3]);
  const working = await loadLightingPolesNearCoordinates(fakeClient(rows), { cityId: 64, point, filters: { status: 'aceso', removed: false } });
  assert.deepEqual(working.data.map((p) => p.id), [1]);
  const all = await loadLightingPolesNearCoordinates(fakeClient(rows), { cityId: 64, point, filters: { status: 'all', removed: true } });
  assert.equal(all.count, 4);
});

test('pagina antes de limitar aos vinte mais próximos, preservando a contagem completa', async () => {
  const rows = Array.from({ length: 510 }, (_, i) => pole(i + 1, point.lat - (510 - i) / 1000000));
  const client = fakeClient(rows);
  const result = await loadLightingPolesNearCoordinates(client, { cityId: 64, point, radius: 500 });
  assert.equal(result.count, 510);
  assert.equal(result.data.length, 20);
  assert.equal(result.data[0].id, 510);
  assert.deepEqual(client.calls.filter((c) => c[0] === 'range'), [['range', 0, 499], ['range', 500, 999]]);
});

test('suporta busca através do antimeridiano e pontos próximos dos polos', async () => {
  const edge = { lat: 0, lng: 179.9999 };
  const result = await loadLightingPolesNearCoordinates(fakeClient([pole(1, 0, -179.9999)]), { cityId: 64, point: edge, radius: 100 });
  assert.equal(result.count, 1);
  assert.equal(lightingCoordinateBounds({ lat: 90, lng: 0 }, 100).west, -180);
});

test('retorna busca vazia e propaga falhas, cancelamento ou parâmetros inválidos', async () => {
  assert.equal((await loadLightingPolesNearCoordinates(fakeClient([]), { cityId: 64, point })).count, 0);
  await assert.rejects(loadLightingPolesNearCoordinates(fakeClient([]), { cityId: null, point }), /prefeitura/);
  await assert.rejects(loadLightingPolesNearCoordinates(fakeClient([]), { cityId: 64, point, radius: 1000 }), /500 m/);
  await assert.rejects(loadLightingPolesNearCoordinates(fakeClient([], new Error('Sem conexão')), { cityId: 64, point }), /Sem conexão/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(loadLightingPolesNearCoordinates(fakeClient([]), { cityId: 64, point, signal: controller.signal }), { name: 'AbortError' });
});
