import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';

const win = new Window({ url: 'https://local.test' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
const require = createRequire(import.meta.url);
const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
let failure = false;
const mocks = {
  '@/lib/customSupabaseClient': { supabase: { rpc: async (name, args) => {
    assert.equal(name, 'tree_management_channels'); assert.equal(args.p_user_id, 'employee');
    return failure ? { error: new Error('offline') } : { data: [{ city_id: 64, canal_id: 'channel', nome: 'Produção Rural e Meio Ambiente' }] };
  } } },
  '@/components/ui/button': { Button: ({ variant, size, ...props }) => React.createElement('button', props) },
  'react-router-dom': { Link: ({ to, ...props }) => React.createElement('a', { href: to, ...props }) },
};
const module = { exports: {} };
const code = ts.transpileModule(readFileSync(new URL('../components/admin/TreeResponsibilitiesFields.jsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, jsx: ts.JsxEmit.React },
}).outputText;
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const pause = () => new Promise(resolve => setTimeout(resolve, 10));
async function waitFor(predicate) { for (let i = 0; i < 100; i++) { if (predicate()) return; await pause(); } assert.ok(predicate()); }
function fixture(initial = []) {
  let assignments, status;
  const node = document.createElement('div'); document.body.appendChild(node);
  const root = createRoot(node);
  function Screen() {
    const [rows, setRows] = React.useState(initial), [state, setState] = React.useState({ loading: true });
    assignments = rows; status = state;
    return React.createElement(module.exports.default, { userId: 'employee', userType: 'public_official', cities: [{ id: 64, name: 'Floresta' }], assignments: rows, onChange: setRows, onStatus: setState });
  }
  flushSync(() => root.render(React.createElement(Screen)));
  return { node, get assignments() { return assignments; }, get status() { return status; }, close() { flushSync(() => root.unmount()); node.remove(); } };
}

test('seleciona cidade e secretaria sem criar cargo de ruas e permite remover a concessão', async () => {
  failure = false; const screen = fixture();
  try {
    await waitFor(() => !screen.status.loading);
    const add = screen.node.querySelector('[aria-label="Adicionar cidade e secretaria de arborização"]');
    assert.ok(add.textContent.includes('Floresta · Produção Rural e Meio Ambiente'));
    flushSync(() => { add.value = 'channel'; add.dispatchEvent(new Event('change', { bubbles: true })); });
    assert.deepEqual(screen.assignments, [{ city_id: 64, canal_id: 'channel' }]);
    flushSync(() => screen.node.querySelector('button').click());
    assert.deepEqual(screen.assignments, []);
  } finally { screen.close(); }
});

test('erro de vínculos preserva concessões e sinaliza bloqueio de salvamento até nova consulta', async () => {
  failure = true; const screen = fixture([{ city_id: 64, canal_id: 'channel' }]);
  try {
    await waitFor(() => screen.status.error);
    assert.ok(screen.node.querySelector('[role="alert"]'));
    assert.equal(screen.assignments.length, 1);
    failure = false; flushSync(() => screen.node.querySelector('[role="alert"] button').click());
    await waitFor(() => !screen.status.loading && !screen.status.error);
    assert.equal(screen.assignments.length, 1);
  } finally { screen.close(); }
});
