import test from 'node:test';
import assert from 'node:assert/strict';
import { canonicalReportNeighborhood, normalizeReverseGeocode, reverseGeocodePin } from '../lib/reverseGeocodePin.js';

test('extrai endereço e município do resultado direto do Nominatim', () => {
  assert.deepEqual(normalizeReverseGeocode({
    address: {
      road: 'Rua da Matriz', house_number: '12', suburb: 'Centro',
      county: 'Floresta', state: 'Pernambuco', 'ISO3166-2-lvl4': 'BR-PE',
    },
  }), {
    address: 'Rua da Matriz, 12 - Centro - Floresta - Pernambuco',
    city: 'Floresta', state_uf: 'PE', suburb: 'Centro',
  });
});

test('usa o município quando o detalhe chama um bairro de cidade', () => {
  const result = normalizeReverseGeocode({
    address: { city: 'Boa Vista', county: 'Recife', state: 'Pernambuco' },
  });
  assert.equal(result.city, 'Recife');
});

test('consulta direta também reconhece city_district como bairro', () => {
  const result = normalizeReverseGeocode({ address: {
    road: 'Rua A', suburb: ' ', city_district: 'Três Marias', city: 'Floresta', state: 'Pernambuco',
  } });
  assert.equal(result.suburb, 'Três Marias');
  assert.equal(result.address, 'Rua A - Três Marias - Floresta - Pernambuco');
  assert.equal(normalizeReverseGeocode({ address: { city_district: ' floresta ', city: 'Floresta' } }).suburb, null);
});

test('DNER usa o nome cadastrado em Floresta sem alterar o endereço', () => {
  assert.equal(canonicalReportNeighborhood('DNER', 'Floresta', 'PE'), 'São Francisco de Assis (DNER)');
  assert.equal(canonicalReportNeighborhood('São Francisco de Assis - DNER', 'Floresta', 'PE'), 'São Francisco de Assis (DNER)');
  assert.equal(canonicalReportNeighborhood('DNER', 'Outra cidade', 'PE'), 'DNER');
  const result = normalizeReverseGeocode({
    address: 'Rua A - São Francisco de Assis - DNER - Floresta - Pernambuco',
    city: 'Floresta', state_uf: 'PE', suburb: 'São Francisco de Assis - DNER',
  });
  assert.equal(result.suburb, 'São Francisco de Assis (DNER)');
  assert.equal(result.address, 'Rua A - São Francisco de Assis - DNER - Floresta - Pernambuco');
});

test('consulta direta recupera endereço quando a função falha', async () => {
  let calls = 0;
  const result = await reverseGeocodePin({ lat: -8.60301, lng: -38.56801 }, {
    invoke: async () => ({ data: null, error: new Error('function unavailable') }),
    fetcher: async (url) => {
      calls += 1;
      assert.equal(new URL(url).searchParams.get('lat'), '-8.60301');
      return { ok: true, json: async () => ({
        address: { road: 'Rua A', city: 'Floresta', state: 'Pernambuco' },
      }) };
    },
  });
  assert.equal(result.address, 'Rua A - Floresta - Pernambuco');
  assert.equal(result.city, 'Floresta');
  assert.equal(result.state_uf, 'PE');
  assert.equal(calls, 1);
});

test('compartilha a consulta do mesmo pin entre endereço e cidade', async () => {
  let calls = 0;
  const options = {
    invoke: async () => {
      calls += 1;
      return { data: { address: 'Rua B', city: 'Floresta', state_uf: 'PE' }, error: null };
    },
    fetcher: () => { throw new Error('não deveria consultar diretamente'); },
  };
  const [first, second] = await Promise.all([
    reverseGeocodePin({ lat: -8.60401, lng: -38.56901 }, options),
    reverseGeocodePin({ lat: -8.60401, lng: -38.56901 }, options),
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls, 1);
});

test('consulta a rua do poste em zoom 17 sem reutilizar endereço de prédio do zoom 18', async () => {
  const calls = [];
  const location = { lat: -8.12345, lng: -38.12345 };
  const options = {
    invoke: async (_name, { body }) => {
      calls.push(body.zoom);
      return { data: {
        address: body.zoom === 17 ? 'Rua do Poste' : 'Rua de Outro Prédio',
        city: 'Floresta', state_uf: 'PE',
      }, error: null };
    },
    fetcher: () => { throw new Error('A resposta já está completa'); },
  };

  const building = await reverseGeocodePin(location, options);
  const street = await reverseGeocodePin(location, { ...options, zoom: 17 });
  assert.deepEqual(calls, [18, 17]);
  assert.equal(building.address, 'Rua de Outro Prédio');
  assert.equal(street.address, 'Rua do Poste');
});
