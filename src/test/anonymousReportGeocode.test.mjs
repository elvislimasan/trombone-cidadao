import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../../supabase/functions/create-anonymous-report/index.ts', import.meta.url), 'utf8')
  .replace(/^import .+\r?\n/gm, '');
const code = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const makeHandler = ({ geo, cityId }) => {
  let handler;
  const calls = [];
  const client = {
    functions: { invoke: async (name) => {
      calls.push(name);
      return { data: geo, error: geo ? null : new Error('geo unavailable') };
    } },
    rpc: async () => ({ data: cityId }),
  };
  new Function('serve', 'createClient', 'Deno', 'fetch', code)(
    (fn) => { handler = fn; },
    () => client,
    { env: { get: () => 'configured' } },
    async () => Response.json({ tokenProperties: { valid: true }, riskAnalysis: { score: 0.9 } }),
  );
  return { handler, calls };
};

const request = (city_id) => new Request('https://example.test/create-anonymous-report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'valid-token', siteKey: 'site-key',
    report: {
      title: 'Buraco', category: 'buracos', address: 'Rua A',
      location: { lat: -8.602, lng: -38.568 }, city_id,
    },
    media: [],
  }),
});

test('envio anônimo consulta a função de geo antes de criar a bronca', async () => {
  const { handler, calls } = makeHandler({ geo: { city: 'Floresta', state_uf: 'PE' }, cityId: 159 });
  const response = await handler(request(null));
  assert.deepEqual(calls, ['reverse-geocode']);
  assert.deepEqual(await response.json(), { error: 'missing_media' });
});

test('falha transitória da geo não impede usar a cidade já resolvida pelo app', async () => {
  const { handler, calls } = makeHandler({ geo: null, cityId: null });
  const response = await handler(request(159));
  assert.deepEqual(calls, ['reverse-geocode', 'reverse-geocode']);
  assert.deepEqual(await response.json(), { error: 'missing_media' });
});
