import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = ts.transpileModule(readFileSync(new URL('../lib/municipalAccount.js', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;

function client(result) {
  const exports = {};
  const calls = [];
  const supabase = { functions: { async invoke(name, args) { calls.push({ name, ...args }); return result; } } };
  // Executa o cliente real sem rede nem credenciais.
  // eslint-disable-next-line no-new-func
  new Function('require', 'exports', source)(() => ({ supabase }), exports);
  return { ...exports, calls };
}

test('informa quando a função de criação de acessos não foi publicada', async () => {
  for (const context of [
    new Response(JSON.stringify({ code: 'NOT_FOUND', message: 'Requested function was not found' }), { status: 404 }),
    new Response('Not Found', { status: 404 }),
  ]) {
    const api = client({ error: { context } });
    await assert.rejects(api.createMunicipalAccount({}), /criação de acessos está indisponível.*administração da plataforma/);
    assert.equal(api.calls.length, 1);
  }
});

test('distingue sessão expirada, falha de conexão e erro de permissão do servidor', async () => {
  const cases = [
    [{ context: new Response(JSON.stringify({ message: 'Invalid JWT' }), { status: 401 }) }, /Sua sessão expirou/],
    [{ name: 'FunctionsFetchError' }, /Confira sua conexão/],
    [{ context: new Response(JSON.stringify({ error: 'Somente o administrador da prefeitura pode criar funcionários.' }), { status: 403 }) }, /Somente o administrador/],
  ];
  for (const [error, expected] of cases) {
    await assert.rejects(client({ error }).createMunicipalAccount({}), expected);
  }
});

test('entrega as credenciais e impede tratar respostas incompletas como sucesso', async () => {
  const body = { kind: 'staff', email: 'novo@prefeitura.test', roles: ['inventario'] };
  const credentials = { email: body.email, temporary_password: 'senha-ficticia', password_expires_at: '2026-10-28T15:00:00Z' };
  const api = client({ data: credentials });
  assert.deepEqual(await api.createMunicipalAccount(body), credentials);
  assert.deepEqual(api.calls, [{ name: 'create-municipal-account', body }]);
  await assert.rejects(client({ data: { email: body.email } }).createMunicipalAccount(body), /não retornou as credenciais/);
});
