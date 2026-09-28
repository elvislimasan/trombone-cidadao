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
    return Response.json({ features: [{ properties: {
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

test('retorna erro explícito quando os dois provedores falham', async () => {
  const handler = makeHandler(async () => new Response('Access denied', { status: 403 }));
  const response = await handler(request(-8.604, -38.570));
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'reverse_geocode_unavailable' });
});
