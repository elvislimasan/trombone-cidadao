import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';

const require = createRequire(import.meta.url), win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
let query, snapshot;
const source = readFileSync(new URL('../hooks/useCommunityTrees.js', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => name === '@/lib/customSupabaseClient' ? { supabase: {} } : name === '@/lib/communityTrees' ? { communityApiError: e => e.message, communityRpc: (...args) => query(...args), hydrateCommunityPhotos: async (_, rows) => rows } : require(name), module, module.exports);
const { useCommunityTree, useCommunityTreeList } = module.exports;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 10)); flushSync(() => {}); };

async function renderHook(Component, task) {
  const node = document.createElement('div'); document.body.appendChild(node); const root = createRoot(node);
  const render = identity => flushSync(() => root.render(React.createElement(Component, { identity })));
  try { await task(render); } finally { flushSync(() => root.unmount()); node.remove(); }
}

test('perfil retira dados privados imediatamente ao trocar de conta e ignora resposta da conta anterior', async () => {
  let resolveOld;
  query = async (_, name) => name === 'get_community_tree' ? { id: 'tree', name: 'Árvore privada', care_count: 1 } : [{ notes: 'Cuidado privado' }];
  function Probe({ identity }) { snapshot = useCommunityTree('tree', identity); return null; }
  await renderHook(Probe, async render => {
    render('owner'); await settle(); assert.equal(snapshot.tree.name, 'Árvore privada');
    query = () => new Promise(resolve => { resolveOld = resolve; });
    render('second-account'); assert.equal(snapshot.tree, null); assert.deepEqual(snapshot.care, []);
    query = async () => null;
    render('anonymous'); await settle(); resolveOld({ id: 'tree', name: 'Resposta antiga', care_count: 0 }); await settle();
    assert.equal(snapshot.tree, null); assert.equal(snapshot.loading, false); assert.deepEqual(snapshot.care, []);
  });
});

test('minhas árvores refaz consulta por identidade e não conserva cards privados enquanto carrega', async () => {
  query = async () => [{ id: 'tree', name: 'Cadastro privado' }];
  function Probe({ identity }) { snapshot = useCommunityTreeList({ cityId: 64, mode: 'mine', identity }); return null; }
  await renderHook(Probe, async render => {
    render('owner'); await settle(); assert.equal(snapshot.rows.length, 1);
    query = async () => [];
    render('other'); assert.deepEqual(snapshot.rows, []); assert.equal(snapshot.loading, true);
    await settle(); assert.deepEqual(snapshot.rows, []); assert.equal(snapshot.loading, false);
  });
});
