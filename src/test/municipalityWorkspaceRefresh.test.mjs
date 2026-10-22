/* global globalThis */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as municipalCategories from '../lib/municipalCategories.js';
import * as municipalAccess from '../lib/municipalAccess.js';
import * as permissionUpdates from '../lib/permissionUpdates.js';

const win = new Window({ url: 'https://local.test' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'CustomEvent']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
let user, search, delayed, queue, revoked, failure, membershipRole, enabledCategoryIds;
const municipality = city => ({ id: 'pref-' + city, city_id: city, status: 'ativa', categorias_habilitadas: enabledCategoryIds });
const supabase = {
  rpc() {
    const response = { data: {
      actor_user_id: user.id, access_contract: 2, execution_contract: 1,
      memberships: revoked ? [] : [64, 65].map(city => ({ papel: membershipRole, prefeitura: municipality(city) })),
      channels: [{ id: 'lighting', city_id: 64 }, { id: 'agriculture', city_id: 64 }],
      category_channels: [{ city_id: 64, canal_id: 'lighting', category_id: 'iluminacao' }, { city_id: 64, canal_id: 'agriculture', category_id: 'poda' }],
      accesses: [{ city_id: 64, canal_id: 'lighting', atendimento: 'gestor', especialidades_execucao: [] }],
    }, error: failure ? { message: 'Conexão indisponível' } : null };
    return delayed ? new Promise(resolve => queue.push(() => resolve(response))) : Promise.resolve(response);
  },
  from(table) {
    const query = {
      select() { return query; }, order() { return query; }, eq() { return query; }, in() { return query; },
      then(resolve, reject) { return Promise.resolve({ data: table === 'categories' ? [{ id: 'iluminacao', name: 'Iluminação' }, { id: 'poda', name: 'Poda de Árvore' }] : [] }).then(resolve, reject); },
    };
    return query;
  },
};
const mocks = {
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user }) },
  'react-router-dom': { useLocation: () => ({ search }) },
  '@/lib/customSupabaseClient': { supabase },
  '@/lib/municipalCategories': municipalCategories,
  '@/lib/municipalAccess': municipalAccess,
  '@/lib/permissionUpdates': permissionUpdates,
};
const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL('../hooks/useMunicipalityWorkspace.js', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
// Executa o provider real com as dependências de sessão e banco do teste.
// eslint-disable-next-line no-new-func
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const pause = () => new Promise(resolve => setTimeout(resolve, 5));
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 100; attempt++) { if (predicate()) return; await pause(); }
  assert.ok(predicate(), 'O contexto municipal não atualizou');
}
const pendingResponse = () => queue.length === 1;
function fixture({ role = 'administrador', query = '?cidade=64', savedChannel = '', categories = ['iluminacao', 'poda'] } = {}) {
  user = { id: 'municipal-admin' }; search = query; delayed = false; queue = []; revoked = false; failure = false;
  membershipRole = role; enabledCategoryIds = categories;
  window.localStorage.clear();
  if (savedChannel) window.localStorage.setItem('municipality-channel:' + user.id + ':pref-64', savedChannel);
  const node = document.createElement('div'); document.body.appendChild(node);
  const root = createRoot(node);
  let workspace, mounts = 0;
  function Draft() {
    const [photos, setPhotos] = React.useState(0);
    React.useEffect(() => { mounts++; }, []);
    return React.createElement('form', null,
      React.createElement('input', { name: 'title', defaultValue: 'Trocar luminária' }),
      React.createElement('input', { type: 'file', onChange: () => setPhotos(value => value + 1) }),
      React.createElement('output', null, photos));
  }
  function Screen() {
    workspace = module.exports.default();
    if (workspace.loading) return React.createElement('p', null, 'Abrindo painel…');
    return workspace.canEdit ? React.createElement(Draft) : React.createElement('p', null, 'Sem acesso');
  }
  const render = () => flushSync(() => root.render(React.createElement(module.exports.MunicipalityWorkspaceProvider, null, React.createElement(Screen))));
  render();
  return { node, render, get workspace() { return workspace; }, get mounts() { return mounts; }, close() { flushSync(() => root.unmount()); node.remove(); } };
}

test('voltar do seletor de foto preserva o formulário, seus campos e o input que receberá o arquivo', async () => {
  const view = fixture();
  try {
    await waitFor(() => view.workspace.canEdit);
    const title = view.node.querySelector('[name=title]'); title.value = 'LED da praça';
    const fileInput = view.node.querySelector('[type=file]');
    delayed = true;
    flushSync(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => queue.length === 1);
    await pause();
    assert.equal(view.node.querySelector('[type=file]'), fileInput, 'O seletor de arquivo não pode ser desmontado ao devolver o foco');
    flushSync(() => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    queue.splice(0).forEach(resolve => resolve());
    await waitFor(() => view.workspace.refreshing === false);
    assert.equal(view.node.querySelector('[name=title]'), title);
    assert.equal(title.value, 'LED da praça');
    assert.equal(view.node.querySelector('output').textContent, '1');
    // Cancelar a próxima seleção também devolve o foco, sem evento change.
    flushSync(() => window.dispatchEvent(new Event('focus')));
    await waitFor(() => queue.length === 1);
    queue.splice(0).forEach(resolve => resolve());
    await waitFor(() => view.workspace.refreshing === false);
    assert.equal(view.mounts, 1);
    assert.equal(view.node.querySelector('output').textContent, '1');
  } finally { view.close(); }
});

test('revalidar ao voltar à janela continua removendo acesso revogado ou inválido', async () => {
  for (const reason of ['revoked', 'failure']) {
    const view = fixture();
    try {
      await waitFor(() => view.workspace.canEdit);
      revoked = reason === 'revoked'; failure = reason === 'failure';
      window.dispatchEvent(new Event('focus'));
      await waitFor(() => !view.workspace.canEdit);
      assert.equal(view.workspace.municipality, null);
      assert.equal(view.node.querySelector('form'), null);
    } finally { view.close(); }
  }
});

test('trocar de conta descarta o contexto e ignora respostas antigas pendentes', async () => {
  const view = fixture();
  try {
    await waitFor(() => view.workspace.canEdit);
    delayed = true; window.dispatchEvent(new Event('focus'));
    await waitFor(() => queue.length === 1);
    const oldResponse = queue.shift();
    user = { id: 'another-account' }; view.render();
    assert.equal(view.workspace.canEdit, false);
    assert.equal(view.node.querySelector('form'), null);
    await waitFor(() => queue.length === 1);
    oldResponse(); await pause();
    assert.equal(view.workspace.canEdit, false);
    queue.shift()();
    await waitFor(() => view.workspace.userId === user.id && !view.workspace.loading);
  } finally { view.close(); }
});

test('trocar a cidade ou a secretaria não reaproveita o formulário do contexto anterior', async () => {
  for (const nextSearch of ['?cidade=65', '?cidade=64&secretaria=lighting']) {
    const view = fixture();
    try {
      await waitFor(() => view.workspace.canEdit);
      delayed = true; search = nextSearch; view.render();
      assert.equal(view.workspace.canEdit, false);
      assert.equal(view.node.querySelector('form'), null);
      await waitFor(pendingResponse);
      queue.shift()();
      await waitFor(() => !view.workspace.loading);
    } finally { view.close(); }
  }
});

test('administrador cadastra Poda mesmo com a listagem filtrada pela secretaria de Iluminação na URL', async () => {
  const view = fixture({ query: '?cidade=64&secretaria=lighting' });
  try {
    await waitFor(() => view.workspace.canEdit);
    assert.equal(view.workspace.activeChannelId, 'lighting');
    assert.deepEqual(view.workspace.enabledCategoryIds, ['iluminacao']);
    assert.deepEqual(view.workspace.reportCreationCategoryIds, ['iluminacao', 'poda']);
  } finally { view.close(); }
});

test('preferência salva da secretaria não restringe categorias de cadastro do administrador', async () => {
  const view = fixture({ savedChannel: 'lighting' });
  try {
    await waitFor(() => view.workspace.canEdit);
    assert.equal(view.workspace.activeChannelId, 'lighting');
    assert.deepEqual(view.workspace.enabledCategoryIds, ['iluminacao']);
    assert.deepEqual(view.workspace.reportCreationCategoryIds, ['iluminacao', 'poda']);
  } finally { view.close(); }
});

test('cadastro por funcionário da secretaria continua respeitando seu escopo', async () => {
  const view = fixture({ role: 'colaborador', query: '?cidade=64&secretaria=lighting' });
  try {
    await waitFor(() => view.workspace.canEdit);
    assert.equal(view.workspace.isAdministrator, false);
    assert.deepEqual(view.workspace.reportCreationCategoryIds, ['iluminacao']);
  } finally { view.close(); }
});

test('administrador não recebe categoria desabilitada pela prefeitura no cadastro', async () => {
  const view = fixture({ categories: ['iluminacao'], query: '?cidade=64&secretaria=lighting' });
  try {
    await waitFor(() => view.workspace.canEdit);
    assert.deepEqual(view.workspace.reportCreationCategoryIds, ['iluminacao']);
  } finally { view.close(); }
});
