import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';

const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
const require = createRequire(import.meta.url), React = require('react');
const { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
let user, lookup, reset, calls, sends;
const driver = { id: 'driver-1', user_id: 'account-1', name: 'Nome operacional' };
const account = { user_id: 'account-1', name: 'Nome da conta', email: 'login@example.test', phone: '87999998888' };
const mocks = {
  '@/components/ui/button': { Button: ({ children, variant, size, ...props }) => React.createElement('button', props, children) },
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user, resetPassword: async email => { sends.push(email); return reset(email); } }) },
  '@/lib/pipaApi': { async pipaRpc(name, args) { calls.push({ name, args }); return lookup(); } },
  './MunicipalDrawer': { __esModule: true, default: ({ children, footer, title }) => React.createElement('section', { role: 'dialog' }, React.createElement('h1', {}, title), children, footer) },
};
const code = ts.transpileModule(readFileSync(new URL('../components/municipality/PipaLoginDetails.jsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const Component = module.exports.default;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 12)); flushSync(() => {}); };
async function mount(run) {
  user = { id: 'manager' }; lookup = async () => account; reset = async () => ({ error: null }); calls = []; sends = [];
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const render = () => flushSync(() => root.render(React.createElement(Component, { driver, onClose() {} })));
  const button = label => [...host.querySelectorAll('button')].find(node => node.textContent === label);
  const click = label => flushSync(() => button(label).click());
  try { render(); await settle(); await run({ host, render, click, button }); }
  finally { flushSync(() => root.unmount()); host.remove(); }
}

test('consulta nome, e-mail e telefone da conta vinculada sem usar o nome operacional', async () => {
  await mount(async ({ host }) => {
    assert.match(host.textContent, /Nome da conta/); assert.match(host.textContent, /login@example.test/); assert.match(host.textContent, /87999998888/);
    assert.deepEqual(calls, [{ name: 'pipa_driver_login_details', args: { p_driver: driver.id } }]);
    assert.equal(sends.length, 0, 'Consultar dados não envia recuperação');
  });
});

test('revalida o vínculo e solicita recuperação uma vez, mesmo com cliques seguidos', async () => {
  await mount(async ({ host, click }) => {
    click('Redefinir senha'); click('Redefinir senha'); await settle();
    assert.deepEqual(sends, ['login@example.test']); assert.equal(calls.length, 2);
    assert.match(host.querySelector('[role=status]').textContent, /Redefinição solicitada/);
    assert.ok([...host.querySelectorAll('button')].find(node => node.textContent === 'Redefinição solicitada').disabled);
  });
});

test('erro de envio mantém dados e permite tentar de novo; limite de envio é explicado', async () => {
  await mount(async ({ host, click, button }) => {
    reset = async () => ({ error: { status: 429, message: 'rate limit' } });
    click('Redefinir senha'); await settle(); assert.match(host.querySelector('[role=alert]').textContent, /Aguarde alguns minutos/);
    assert.equal(button('Redefinir senha').disabled, false);
    reset = async () => ({ error: null }); click('Redefinir senha'); await settle();
    assert.match(host.textContent, /Redefinição solicitada/);
  });
});

test('revogação de permissão e troca de e-mail impedem o envio', async () => {
  await mount(async ({ host, click }) => {
    lookup = async () => { throw new Error('Sem permissão'); };
    click('Redefinir senha'); await settle(); assert.equal(sends.length, 0); assert.match(host.querySelector('[role=alert]').textContent, /Sem permissão/);
    lookup = async () => ({ ...account, email: 'outro@example.test' });
    click('Redefinir senha'); await settle(); assert.equal(sends.length, 0); assert.match(host.querySelector('[role=alert]').textContent, /dados do login mudaram/);
    assert.equal(host.textContent.includes('login@example.test'), false);
  });
});

test('falha de consulta tem retry e campos ausentes não inventam dados nem permitem envio sem e-mail', async () => {
  await mount(async ({ host, render, click, button }) => {
    lookup = async () => { throw new Error('Falha de rede'); };
    user = { id: 'manager-2' }; render(); await settle(); assert.match(host.textContent, /Falha de rede/);
    lookup = async () => ({ user_id: account.user_id, name: null, email: null, phone: null });
    click('Tentar novamente'); await settle(); assert.equal((host.textContent.match(/Não informado/g) || []).length, 3);
    assert.ok(button('Redefinir senha').disabled); assert.equal(sends.length, 0);
  });
});

test('resultado atrasado após troca de conta não revela dados nem dispara recuperação', async () => {
  await mount(async ({ host, render, click }) => {
    let finish;
    lookup = () => new Promise(resolve => { finish = resolve; });
    click('Redefinir senha'); user = null; render(); await settle();
    assert.equal(host.textContent.includes(account.email), false);
    finish(account); await settle(); assert.equal(sends.length, 0);
    assert.equal(host.textContent.includes(account.email), false);
  });
});
