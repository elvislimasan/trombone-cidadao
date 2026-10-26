import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../../supabase/functions/generate-tree-species-summary/index.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace(/^import .*;\r?\n/gm, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

function endpoint({ allowed = true, quota = true, authenticated = true, finishReason = 'STOP', output = { summary: 'Resumo educativo.', sidewalk_suitability: 'com_restricoes', planting_guidance: 'Avaliar o espaço disponível.' } } = {}) {
  let handler;
  const calls = [];
  const client = { auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'user' } : null } }) }, rpc: async name => {
    calls.push(name); return { data: name === 'pode_gerenciar_arborizacao' ? allowed : quota };
  } };
  const env = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', GEMINI_API_KEY: 'server-key' };
  new Function('serve', 'createClient', 'Deno', 'fetch', compiled)(fn => { handler = fn; }, () => client, { env: { get: key => env[key] } }, async (url, options) => {
    calls.push({ url, options });
    return Response.json({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(output) }] } }] });
  });
  const invoke = (body = { city_id: 64, common_name: 'Ipê', scientific_name: 'Handroanthus albus' }, headers = { Authorization: 'Bearer user-jwt' }) => handler(new Request('https://example.test/function', { method: 'POST', headers, body: JSON.stringify(body) }));
  return { invoke, calls };
}

test('IA exige sessão e permissão na cidade antes de consultar o provedor', async () => {
  const anonymous = endpoint();
  assert.equal((await anonymous.invoke(undefined, {})).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const expired = endpoint({ authenticated: false });
  assert.equal((await expired.invoke()).status, 401);
  const denied = endpoint({ allowed: false });
  assert.equal((await denied.invoke()).status, 403);
  assert.deepEqual(denied.calls, ['pode_gerenciar_arborizacao']);
});

test('IA valida nomes e respeita a cota sem chamar o provedor', async () => {
  const invalid = endpoint();
  assert.equal((await invalid.invoke({ city_id: 64, common_name: 'x'.repeat(161) })).status, 400);
  assert.equal(invalid.calls.length, 0);
  const exhausted = endpoint({ quota: false });
  assert.equal((await exhausted.invoke()).status, 429);
  assert.deepEqual(exhausted.calls, ['pode_gerenciar_arborizacao', 'consume_tree_species_ai_quota']);
});

test('IA retorna sugestão estruturada sem persistir, recusa resposta truncada ou inválida', async () => {
  const valid = endpoint();
  const response = await valid.invoke();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).sidewalk_suitability, 'com_restricoes');
  const request = JSON.parse(valid.calls[2].options.body);
  assert.equal(request.generationConfig.responseMimeType, 'application/json');
  assert.equal(JSON.parse(request.contents[0].parts[0].text).nome_popular, 'Ipê');
  assert.equal((await endpoint({ finishReason: 'MAX_TOKENS' }).invoke()).status, 502);
  assert.equal((await endpoint({ output: { summary: 'Texto', sidewalk_suitability: 'sempre' } }).invoke()).status, 502);
});
