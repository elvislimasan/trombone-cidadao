import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../../supabase/functions/create-municipal-account/index.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function fixture({ authenticated = true, allowed = true, duplicate = false, provisionFailure = false, transportFailure = false } = {}) {
  const calls = []; let handler;
  const client = {
    auth: { async getUser() { return { data: { user: authenticated ? { id: 'actor' } : null } }; } },
    async rpc(name, args) {
      calls.push({ name, args });
      if (name === 'validate_municipal_provisioning') return { data: 64, error: allowed ? null : { message: 'Sem permissão' } };
      if (transportFailure) throw new Error('Network interrupted');
      return { data: { user_id: 'new-user', password_expires_at: '2026-10-27T15:00:00Z' }, error: provisionFailure ? { message: 'Secretaria indisponível' } : null };
    },
  };
  const admin = { auth: { admin: {
    async createUser(args) { calls.push({ name: 'createUser', args }); return duplicate ? { data: {}, error: { code: 'email_exists', status: 422 } } : { data: { user: { id: 'new-user' } } }; },
    async deleteUser(id) { calls.push({ name: 'deleteUser', id }); return { error: null }; },
  } } };
  const mocks = { 'https://deno.land/std@0.177.0/http/server.ts': { serve: fn => { handler = fn; } },
    'jsr:@supabase/supabase-js@2': { createClient: (_url, key) => key === 'service' ? admin : client } };
  const env = { SUPABASE_URL: 'https://example.test', SUPABASE_ANON_KEY: 'anon', SUPABASE_SERVICE_ROLE_KEY: 'service' };
  // Executa a função real com Auth e banco fictícios, sem rede nem credenciais.
  // eslint-disable-next-line no-new-func
  new Function('require', 'exports', 'Deno', source)(name => mocks[name], {}, { env: { get: name => env[name] } });
  const invoke = (body = { kind: 'staff', prefeitura_id: 'pref', channel_id: 'channel', roles: ['inventario'], email: ' Novo@Prefeitura.test ' }) => handler(new Request('https://example.test', {
    method: 'POST', headers: { Authorization: 'Bearer session', 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  }));
  return { calls, invoke, handler };
}

test('provisionamento exige sessão e autorização antes de criar uma conta', async () => {
  for (const options of [{ authenticated: false }, { allowed: false }]) {
    const f = fixture(options); const response = await f.invoke();
    assert.ok([401, 403].includes(response.status));
    assert.ok(!f.calls.some(call => call.name === 'createUser'));
  }
});

test('gera acesso imediato sem convite, com senha aleatória e resposta sem cache', async () => {
  const f = fixture(); const response = await f.invoke(); const credentials = await response.json();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal(credentials.email, 'novo@prefeitura.test');
  const created = f.calls.find(call => call.name === 'createUser').args;
  assert.match(created.password, /^[a-f0-9]{36}aA1!$/);
  assert.equal(created.email_confirm, true);
  assert.deepEqual(created.app_metadata, { municipal_provisioned: true, municipal_created_by: 'actor' });
  assert.equal(credentials.temporary_password, created.password);
  const another = fixture(); await another.invoke();
  assert.notEqual(another.calls.find(call => call.name === 'createUser').args.password, created.password);
  assert.ok(!f.calls.some(call => call.name === 'deleteUser'));
});

test('e-mail existente não é redefinido, vinculado ou excluído', async () => {
  const f = fixture({ duplicate: true }); const response = await f.invoke();
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /conta existente/);
  assert.ok(!f.calls.some(call => ['provision_municipal_account', 'deleteUser'].includes(call.name)));
});

test('remove a conta recém-criada se o vínculo falhar ou a conexão for interrompida', async () => {
  for (const options of [{ provisionFailure: true }, { transportFailure: true }]) {
    const f = fixture(options); const response = await f.invoke(); const body = await response.json();
    assert.ok(response.status >= 400);
    assert.deepEqual(f.calls.filter(call => call.name === 'deleteUser').map(call => call.id), ['new-user']);
    assert.equal(body.temporary_password, undefined);
  }
});
