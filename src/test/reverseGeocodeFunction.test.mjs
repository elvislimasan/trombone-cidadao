import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../supabase/functions/reverse-geocode/index.ts', import.meta.url), 'utf8')
  .replace(/^import \{ serve \} from .+\r?\n/, '');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const makeHandler = (fetcher) => {
  let handler;
  new Function('serve', 'Deno', 'fetch', code)(
    (fn) => { handler = fn; },
    { env: { get: () => null } },
    fetcher,
  );
  return handler;
};

const request = (lat = -8.602, lng = -38.568) => new Request('https://example.test/reverse-geocode', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ lat, lng, zoom: 18 }),
});

test('resposta de acesso negado do Nominatim usa Photon no contrato do app antigo', async () => {
  const calls = [];
  const handler = makeHandler(async (url) => {
    calls.push(String(url));
    if (String(url).includes('nominatim')) return new Response('Access denied', { status: 403 });
    return Response.json({ features: [{ geometry: { coordinates: [-38.568, -8.602] }, properties: {
      street: 'Rua Capitão Emílio Novaes', district: 'Centro', city: 'Floresta',
      state: 'Pernambuco', countrycode: 'BR',
    } }] });
  });

  const response = await handler(request());
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.match(data.address, /Rua Capitão Emílio Novaes/);
  assert.equal(data.city, 'Floresta');
  assert.equal(data.state_uf, 'PE');
  assert.equal(data.suburb, 'Centro');
  assert.equal(data.raw.address.road, 'Rua Capitão Emílio Novaes');
  assert.equal(calls.length, 2);

  await handler(request());
  assert.equal(calls.length, 2, 'a segunda consulta usa o cache');
});

test('resposta válida do Nominatim continua sendo usada', async () => {
  const calls = [];
  const handler = makeHandler(async (url) => {
    calls.push(String(url));
    return Response.json({ address: {
      road: 'Rua A', suburb: 'Centro', city: 'Floresta', county: 'Floresta',
      state: 'Pernambuco', 'ISO3166-2-lvl4': 'BR-PE',
    } });
  });

  const response = await handler(request(-8.603, -38.569));
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.address, 'Rua A - Centro - Floresta - Pernambuco');
  assert.equal(data.city, 'Floresta');
  assert.equal(calls.length, 1);
});

test('campo suburb vazio não oculta bairro em neighbourhood', async () => {
  const handler = makeHandler(async () => Response.json({ address: {
    road: 'Rua A', suburb: ' ', neighbourhood: 'Três Marias', city: 'Floresta',
    county: 'Floresta', state: 'Pernambuco',
  } }));
  const response = await handler(request());
  assert.equal((await response.json()).suburb, 'Três Marias');
});

test('bairro retornado como city continua associado ao município de county', async () => {
  const handler = makeHandler(async (url) => Response.json({ address: {
    road: 'Rua A', city: new URL(url).searchParams.get('zoom') === '10' ? 'Floresta' : 'Três Marias',
    county: 'Floresta', state: 'Pernambuco',
  } }));
  const response = await handler(request());
  const data = await response.json();
  assert.equal(data.city, 'Floresta');
  assert.equal(data.suburb, 'Três Marias');
});

test('Photon escolhe a rua mais próxima e ignora uma rua distante que veio primeiro', async () => {
  const handler = makeHandler(async (url) => {
    if (String(url).includes('nominatim')) return new Response('Access denied', { status: 403 });
    return Response.json({ features: [
      { geometry: { coordinates: [-38.575, -8.61] }, properties: {
        street: 'Rua distante', city: 'Floresta', state: 'Pernambuco', countrycode: 'BR',
      } },
      { geometry: { coordinates: [-38.571, -8.605] }, properties: {
        street: 'Rua do poste', city: 'Floresta', state: 'Pernambuco', countrycode: 'BR',
      } },
    ] });
  });

  const response = await handler(request(-8.605, -38.571));
  assert.equal(response.status, 200);
  assert.match((await response.json()).address, /^Rua do poste/);
});

test('Photon não atribui ao poste uma rua distante ou um nome de prédio', async () => {
  const handler = makeHandler(async (url) => {
    if (String(url).includes('nominatim')) return new Response('Access denied', { status: 403 });
    return Response.json({ features: [
      { geometry: { coordinates: [-38.581, -8.615] }, properties: {
        street: 'Rua distante', city: 'Floresta', state: 'Pernambuco', countrycode: 'BR',
      } },
      { geometry: { coordinates: [-38.581, -8.616] }, properties: {
        name: 'Prédio vizinho', type: 'building', city: 'Floresta', state: 'Pernambuco', countrycode: 'BR',
      } },
    ] });
  });

  const response = await handler(request(-8.615, -38.580));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'reverse_geocode_unavailable' });
});

test('retorna erro explícito quando os dois provedores falham', async () => {
  const handler = makeHandler(async () => new Response('Access denied', { status: 403 }));
  const response = await handler(request(-8.604, -38.570));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'reverse_geocode_unavailable' });
});
