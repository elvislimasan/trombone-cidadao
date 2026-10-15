import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import { canWriteModule, MODULES, MODULE_KEYS } from '../lib/modulePermissions.js';
import { notifyPermissionsChanged, PERMISSIONS_STORAGE_KEY } from '../lib/permissionUpdates.js';

const win = new Window({ url: 'https://local.test' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'CustomEvent']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
let user, allowed, calls, delayed, queue, userType, isMaster, ruleError;
const supabase = { from(table) {
  let userId;
  const query = {
    select() { return query; },
    eq(column, value) { userId = value; return query; },
    maybeSingle() { return query; },
    then(ok, fail) {
      calls += 1;
      const result = { data: table === 'permission_rules'
        ? [{ scope: 'role', role_name: 'urban_planner', module: 'urban_planning', allowed }]
        : table === 'profiles' ? { user_type: userType, is_master: isMaster } : userId === 'planner' ? [{ city_id: 64 }] : [], error: table === 'permission_rules' ? ruleError : null };
      return (delayed ? new Promise(resolve => queue.push(() => resolve(result))) : Promise.resolve(result)).then(ok, fail);
    },
  };
  return query;
} };
const mocks = {
  '@/lib/customSupabaseClient': { supabase },
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user }) },
  '@/lib/modulePermissions': { canWriteModule, MODULES, MODULE_KEYS },
  '@/lib/permissionUpdates': await import('../lib/permissionUpdates.js'),
};
const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL('../hooks/usePermissions.js', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);

const pause = () => new Promise(resolve => setTimeout(resolve, 10));
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt += 1) { if (predicate()) return; await pause(); }
  assert.ok(predicate(), 'A permissão não atualizou');
}
function fixture() {
  user = { id: 'planner' }; userType = 'public_official'; isMaster = false; ruleError = null; allowed = false; calls = 0; delayed = false; queue = [];
  let access;
  const node = document.createElement('div'); document.body.appendChild(node);
  const root = createRoot(node);
  function Screen() {
    access = module.exports.usePermissions();
    return React.createElement('input', { defaultValue: 'Traçado em edição' });
  }
  const render = () => flushSync(() => root.render(React.createElement(Screen)));
  render();
  return { root, node, render, get access() { return access; }, close() { flushSync(() => root.unmount()); node.remove(); } };
}

test('cargo e permissão atualizam sem remontar o mapa ao salvar, trocar de aba e voltar à janela', async () => {
  const screen = fixture();
  try {
    await waitFor(() => !screen.access.loading);
    assert.equal(screen.access.canWrite('urban_planning'), false);
    const draft = screen.node.querySelector('input'); draft.value = 'Rascunho preservado';
    allowed = true; notifyPermissionsChanged('planner');
    await waitFor(() => screen.access.canWrite('urban_planning'));
    allowed = false;
    window.dispatchEvent(new win.StorageEvent('storage', { key: PERMISSIONS_STORAGE_KEY, newValue: JSON.stringify({ userId: 'planner' }) }));
    await waitFor(() => !screen.access.canWrite('urban_planning'));
    allowed = true; window.dispatchEvent(new Event('focus'));
    await waitFor(() => screen.access.canWrite('urban_planning'));
    assert.equal(screen.node.querySelector('input'), draft);
    assert.equal(draft.value, 'Rascunho preservado');
  } finally { screen.close(); }
});

test('alteração de outro usuário não concede acesso nem consulta desnecessariamente', async () => {
  const screen = fixture();
  try {
    await waitFor(() => !screen.access.loading);
    const previousCalls = calls;
    allowed = true; notifyPermissionsChanged('other');
    await pause();
    assert.equal(calls, previousCalls);
    assert.equal(screen.access.canWrite('urban_planning'), false);
    notifyPermissionsChanged();
    await waitFor(() => screen.access.canWrite('urban_planning'));
  } finally { screen.close(); }
});

test('trocar de conta descarta concessões e respostas pendentes da conta anterior', async () => {
  const screen = fixture();
  try {
    await waitFor(() => !screen.access.loading);
    allowed = true; delayed = true; screen.access.refreshPermissions();
    await waitFor(() => queue.length === 3);
    const oldRequests = queue.splice(0);
    user = { id: 'other' }; screen.render();
    assert.equal(screen.access.canWrite('urban_planning'), false);
    await waitFor(() => queue.length === 3);
    oldRequests.forEach(resolve => resolve());
    await pause();
    assert.equal(screen.access.canWrite('urban_planning'), false);
    queue.splice(0).forEach(resolve => resolve());
    await waitFor(() => !screen.access.loading);
    assert.equal(screen.access.canWrite('urban_planning'), false);
    assert.deepEqual(screen.access.planningCityIds, []);
  } finally { screen.close(); }
});

test('revalida o tipo Órgão Público no banco ao alterar a conta e ao voltar ao mapa', async () => {
  const screen = fixture();
  try {
    await waitFor(() => !screen.access.loading);
    allowed = true; userType = 'citizen'; notifyPermissionsChanged('planner');
    await pause();
    assert.equal(screen.access.canWrite('urban_planning'), false);
    userType = 'public_official'; notifyPermissionsChanged('planner');
    await waitFor(() => screen.access.canWrite('urban_planning'));
    userType = 'citizen'; window.dispatchEvent(new Event('focus'));
    await waitFor(() => !screen.access.canWrite('urban_planning'));
  } finally { screen.close(); }
});

test('master sem cargo acessa o mapa com regras bloqueadas e perde a exceção ao ser removido', async () => {
  const screen = fixture();
  try {
    await waitFor(() => !screen.access.loading);
    user = { id: 'other' }; userType = 'citizen'; isMaster = true; ruleError = { message: 'indisponível' };
    screen.render();
    await waitFor(() => screen.access.isMaster);
    assert.deepEqual(screen.access.planningCityIds, []);
    assert.equal(screen.access.canWrite('urban_planning'), true);
    assert.equal(screen.access.canWrite('pavement'), true);
    // O perfil consultado prevalece mesmo se o contexto de autenticação estiver desatualizado.
    user = { id: 'other', is_master: true }; isMaster = false;
    window.dispatchEvent(new Event('focus'));
    await waitFor(() => !screen.access.isMaster);
    assert.equal(screen.access.canWrite('urban_planning'), false);
  } finally { screen.close(); }
});
