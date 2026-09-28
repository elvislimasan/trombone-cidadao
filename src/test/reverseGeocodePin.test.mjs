import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeReverseGeocode, reverseGeocodePin } from '../lib/reverseGeocodePin.js';

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
