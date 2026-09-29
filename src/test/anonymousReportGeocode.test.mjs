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
  const inserts = [];
  const client = {
    functions: { invoke: async (name, options) => {
      calls.push(name);
      const data = typeof geo === 'function' ? geo(options.body.zoom) : geo;
      return { data, error: data ? null : new Error('geo unavailable') };
    } },
    rpc: async () => ({ data: cityId }),
    from(table) {
      const query = {
        insert(value) { if (table === 'reports') inserts.push(value); return query; },
        select() { return query; },
        single: async () => ({ data: { id: 'created-report' }, error: null }),
        then(resolve, reject) { return Promise.resolve({ error: null }).then(resolve, reject); },
      };
      return query;
    },
    storage: { from: () => ({
      getPublicUrl: () => ({ data: { publicUrl: 'https://example.test/photo.jpg' } }),
      createSignedUploadUrl: async () => ({ data: { signedUrl: 'https://example.test/upload' } }),
    }) },
  };
  new Function('serve', 'createClient', 'Deno', 'fetch', code)(
    (fn) => { handler = fn; },
    () => client,
    { env: { get: () => 'configured' } },
    async () => Response.json({ tokenProperties: { valid: true }, riskAnalysis: { score: 0.9 } }),
  );
  return { handler, calls, inserts };
};

const request = (city_id, { neighborhood, withMedia = false } = {}) => new Request('https://example.test/create-anonymous-report', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token: 'valid-token', siteKey: 'site-key',
    report: {
      title: 'Buraco', category: 'buracos', address: 'Rua A',
      location: { lat: -8.602, lng: -38.568 }, city_id, neighborhood,
    },
    media: withMedia ? [{ clientId: 'photo-1', type: 'photo', name: 'photo.jpg' }] : [],
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

test('envio anônimo grava o bairro do marcador, inclusive quando o app antigo não o envia', async () => {
  for (const neighborhood of [undefined, 'Outro bairro']) {
    const { handler, inserts } = makeHandler({ geo: { city: 'Floresta', state_uf: 'PE', suburb: ' Três Marias ' }, cityId: 64 });
    const response = await handler(request(64, { neighborhood, withMedia: true }));
    assert.equal(response.status, 200);
    assert.equal(inserts[0].neighborhood, 'Três Marias');
    assert.equal(inserts[0].address, 'Rua A');
  }
});

test('envio anônimo padroniza DNER em Floresta', async () => {
  const { handler, inserts } = makeHandler({ geo: { city: 'Floresta', state_uf: 'PE', suburb: 'São Francisco de Assis - DNER' }, cityId: 64 });
  const response = await handler(request(64, { withMedia: true }));
  assert.equal(response.status, 200);
  assert.equal(inserts[0].neighborhood, 'São Francisco de Assis (DNER)');
});

test('preserva o bairro resolvido pelo app quando a consulta do servidor falha', async () => {
  const { handler, inserts } = makeHandler({ geo: null, cityId: null });
  const response = await handler(request(64, { neighborhood: ' Centro ', withMedia: true }));
  assert.equal(response.status, 200);
  assert.equal(inserts[0].neighborhood, 'Centro');
});

test('consulta do município em zoom 10 não substitui o bairro da resposta detalhada', async () => {
  const geo = (zoom) => zoom === 18 ? { suburb: 'Três Marias' } : { city: 'Floresta', state_uf: 'PE', suburb: 'Centro' };
  const { handler, inserts } = makeHandler({ geo, cityId: 64 });
  const response = await handler(request(null, { withMedia: true }));
  assert.equal(response.status, 200);
  assert.equal(inserts[0].neighborhood, 'Três Marias');
});

test('bairro ausente continua nulo quando só o município foi identificado', async () => {
  const { handler, inserts } = makeHandler({ geo: { city: 'Floresta', state_uf: 'PE' }, cityId: 64 });
  const response = await handler(request(64, { neighborhood: ' ', withMedia: true }));
  assert.equal(response.status, 200);
  assert.equal(inserts[0].neighborhood, null);
});
