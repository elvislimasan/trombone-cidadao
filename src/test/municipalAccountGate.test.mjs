/* global globalThis */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';

const win = new Window({ url: 'https://example.test/prefeitura/visao-geral' });
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, key, { configurable: true, value: win[key] });
const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
let user, status, failed, calls, pathname, passwordError;
const supabase = {
  async rpc(name, args) {
    calls.push({ name, args });
    if (failed) return { error: { message: 'Conexão indisponível' } };
    if (name === 'complete_municipal_account') status = { ...status, profile_required: false };
    return { data: status };
  },
  auth: { async updateUser(args) {
    calls.push({ name: 'updateUser', args });
    if (passwordError) return { error: { message: 'Senha recusada' } };
    status = { ...status, password_required: false, password_expires_at: null };
    return { error: null };
  } },
};
const mocks = {
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user, loading: false, refreshUserProfile: async () => user, signOut: async () => {} }) },
  'react-router-dom': { useLocation: () => ({ pathname }), Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
  '@/lib/customSupabaseClient': { supabase },
  '@/components/ui/button': { Button: ({ children, variant: _variant, ...props }) => React.createElement('button', props, children) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/components/ui/label': { Label: props => React.createElement('label', props) },
};
function load(relative) {
  const module = { exports: {} };
  const code = ts.transpileModule(readFileSync(new URL(relative, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.React, esModuleInterop: true } }).outputText;
  // eslint-disable-next-line no-new-func
  new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
  return module.exports;
}
mocks['@/lib/municipalAccount'] = load('../lib/municipalAccount.js');
const Gate = load('../components/municipality/MunicipalAccountGate.jsx').default;
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function wait(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) { if (predicate()) return; await pause(); }
  assert.ok(predicate(), document.body.textContent);
}
function mount({ provisioned = true, profile = true, expired = false, failure = false } = {}) {
  user = { id: 'user', app_metadata: { municipal_provisioned: provisioned } };
  status = { profile_required: profile, password_required: expired, password_expires_at: new Date(Date.now() + 86400000).toISOString() };
  failed = failure; passwordError = false; calls = []; pathname = '/prefeitura/visao-geral';
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  flushSync(() => root.render(React.createElement(Gate, null, React.createElement('div', { id: 'app-content' }, 'Painel municipal'))));
  return () => { flushSync(() => root.unmount()); host.remove(); };
}
function input(id, value) {
  const el = document.getElementById(id);
  Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set.call(el, value);
  el.dispatchEvent(new win.Event('input', { bubbles: true }));
}
function submit() { document.querySelector('form').dispatchEvent(new win.Event('submit', { bubbles: true, cancelable: true })); }

test('cadastro inicial bloqueia o painel e salva nome, telefone e aceite antes de continuar', async () => {
  const close = mount();
  try {
    await wait(() => document.getElementById('setup-name'));
    assert.equal(document.getElementById('app-content'), null);
    input('setup-name', 'Servidor Municipal'); input('setup-phone', '81999999999');
    document.querySelector('input[type=checkbox]').click(); await pause(); submit();
    await wait(() => document.getElementById('app-content'));
    assert.deepEqual(calls.find(call => call.name === 'complete_municipal_account').args, { p_name: 'Servidor Municipal', p_phone: '81999999999', p_terms: true });
    assert.ok(!calls.some(call => call.name === 'updateUser'));
  } finally { close(); }
});

test('sessão aberta passa a exigir senha ao atingir o prazo e só libera após sucesso do Auth', async () => {
  const close = mount({ profile: false });
  try {
    await wait(() => document.getElementById('app-content'));
    status = { ...status, password_required: true };
    window.dispatchEvent(new win.Event('focus'));
    await wait(() => document.getElementById('setup-password'));
    assert.equal(document.getElementById('app-content'), null);
    input('setup-password', 'SenhaPessoal123'); input('setup-confirmation', 'Diferente123'); await pause(); submit();
    await wait(() => document.querySelector('[role=alert]'));
    assert.ok(!calls.some(call => call.name === 'updateUser'));
    input('setup-confirmation', 'SenhaPessoal123'); await pause(); passwordError = true; submit();
    await wait(() => document.querySelector('[role=alert]')?.textContent.includes('Senha recusada'));
    assert.equal(document.getElementById('app-content'), null);
    passwordError = false; submit(); await wait(() => document.getElementById('app-content'));
  } finally { close(); }
});

test('falha de consulta não libera a conta provisionada e permite tentar novamente', async () => {
  const close = mount({ profile: false, failure: true });
  try {
    await wait(() => document.querySelector('[role=alert]'));
    assert.equal(document.getElementById('app-content'), null);
    failed = false;
    [...document.querySelectorAll('button')].find(button => button.textContent === 'Verificar novamente').click();
    await wait(() => document.getElementById('app-content'));
  } finally { close(); }
});

test('contas anteriores continuam sem etapa adicional e não consultam o novo cadastro', async () => {
  const close = mount({ provisioned: false });
  try {
    await wait(() => document.getElementById('app-content'));
    assert.equal(calls.length, 0);
  } finally { close(); }
});
