import test from 'node:test';
import assert from 'node:assert/strict';
import { cityStateUf } from '../lib/cityLocation.js';
import { matchingCityPoint } from '../lib/geocodeCity.js';

const result = (name, state, lat = '-8.597031', lon = '-38.574217') => ({ lat, lon, name,
  address: { city: name, state, country_code: 'br' } });
let version = 0;
const fresh = () => import(`../lib/geocodeCity.js?test=${++version}`);
const storage = t => {
  const values = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) } });
  t.after(() => original ? Object.defineProperty(globalThis, 'localStorage', original) : delete globalThis.localStorage);
  return values;
};

test('UF considera tanto state do catálogo público quanto states do workspace municipal', () => {
  for (const city of [{ state: { uf: 'PE' } }, { states: { uf: 'PE' } }, { state_uf: 'pe' }, { state: { name: 'Pernambuco' } }]) assert.equal(cityStateUf(city), 'PE');
});
test('municípios homônimos de outra UF, bairros de outra cidade e coordenadas vazias são descartados', () => {
  assert.equal(matchingCityPoint(result('Floresta', 'Paraná'), 'Floresta', 'PE'), null);
  assert.equal(matchingCityPoint(result('Recife', 'Pernambuco'), 'Floresta', 'PE'), null);
  assert.equal(matchingCityPoint(result('Floresta', 'Pernambuco', ''), 'Floresta', 'PE'), null);
  assert.equal(matchingCityPoint(result('Floresta', 'Pernambuco'), 'Floresta', 'PE').uf, 'PE');
  const withRegion = result('Recife', 'Pernambuco');
  withRegion.address.municipality = 'Região Geográfica Imediata do Recife';
  assert.equal(matchingCityPoint(withRegion, 'Recife', 'PE').city, 'recife');
});
test('Floresta–PE usa o centro correto, mesmo offline e com cache antigo de outro estado', async t => {
  const values = storage(t);
  values.set('tc_citygeo_floresta|', JSON.stringify({ lat: -23.6, lng: -52.08 }));
  values.set('tc_citygeo_floresta|pe', JSON.stringify({ lat: -23.6, lng: -52.08 }));
  t.mock.method(globalThis, 'fetch', async () => { throw Error('offline'); });
  const { geocodeCity } = await fresh();
  assert.deepEqual(await geocodeCity('Floresta', 'PE'), { lat: -8.597031, lng: -38.574217 });
});
test('consulta informa o estado por extenso e confere a UF antes de aceitar o resultado', async t => {
  const values = storage(t);
  let requested;
  t.mock.method(globalThis, 'fetch', async url => {
    requested = new URL(url);
    return Response.json([result('Santa Maria', 'Rio Grande do Norte', '-5.8', '-35.7'), result('Santa Maria', 'Rio Grande do Sul', '-29.68', '-53.8')]);
  });
  const { geocodeCity } = await fresh();
  assert.deepEqual(await geocodeCity('Santa Maria', 'RS'), { lat: -29.68, lng: -53.8 });
  assert.equal(requested.searchParams.get('state'), 'Rio Grande do Sul');
  assert.equal(requested.searchParams.get('addressdetails'), '1');
  assert.ok(values.has('tc_citygeo_v2_santa maria|RS'));
});
test('sem UF não escolhe entre duas cidades homônimas de estados diferentes', async t => {
  storage(t);
  t.mock.method(globalThis, 'fetch', async () => Response.json([result('Santa Maria', 'Rio Grande do Norte'), result('Santa Maria', 'Rio Grande do Sul')]));
  const { geocodeCity } = await fresh();
  assert.equal(await geocodeCity('Santa Maria'), null);
});
test('cache novo de outra UF não é reaproveitado e resultados incompatíveis não são gravados', async t => {
  const values = storage(t);
  values.set('tc_citygeo_v2_santa maria|RS', JSON.stringify({ lat: -5.8, lng: -35.7, city: 'santa maria', uf: 'RN' }));
  t.mock.method(globalThis, 'fetch', async () => Response.json([result('Santa Maria', 'Rio Grande do Norte')]));
  const { geocodeCity } = await fresh();
  assert.equal(await geocodeCity('Santa Maria', 'RS'), null);
});
