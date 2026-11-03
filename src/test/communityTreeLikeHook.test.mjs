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
const source = readFileSync(new URL('../hooks/useCommunityTreeLike.js', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => name === '@/lib/customSupabaseClient' ? { supabase: {} } : name === '@/lib/communityTreeLikes' ? { setCommunityTreeLike: (...args) => query(...args) } : require(name), module, module.exports);
const useLike = module.exports.default;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 10)); flushSync(() => {}); };
const tree = { id: 'tree', status: 'approved', public_profile: true, liked: false, like_count: 5 };
async function probe(task) {
  const node = document.createElement('div'); document.body.appendChild(node); const root = createRoot(node);
  function Probe({ identity, value }) { snapshot = useLike(value, identity); return null; }
  const render = (identity = 'person', value = tree) => flushSync(() => root.render(React.createElement(Probe, { identity, value })));
  try { await task(render); } finally { flushSync(() => root.unmount()); node.remove(); }
}

test('cliques rápidos aguardam uma única gravação; desfazer usa o estado confirmado', async () => {
  let resolve, calls = [];
  query = (_, id, liked) => { calls.push({ id, liked }); return new Promise(done => { resolve = done; }); };
  await probe(async render => {
    render(); await settle();
    snapshot.toggle(); snapshot.toggle(); await settle();
    assert.equal(calls.length, 1); assert.equal(snapshot.busy, true); assert.equal(snapshot.count, 5);
    resolve({ liked: true, count: 9 }); await settle();
    assert.equal(snapshot.liked, true); assert.equal(snapshot.count, 9); assert.equal(snapshot.busy, false);
    snapshot.toggle(); assert.deepEqual(calls[1], { id: 'tree', liked: false });
    resolve({ liked: false, count: 8 }); await settle(); assert.equal(snapshot.count, 8); assert.equal(snapshot.liked, false);
  });
});

test('falha conserva contador anterior e permite tentar novamente', async () => {
  query = async () => { throw Error('Falha de conexão'); };
  await probe(async render => {
    render(); await settle(); await snapshot.toggle(); await settle();
    assert.equal(snapshot.count, 5); assert.equal(snapshot.liked, false); assert.equal(snapshot.error, 'Falha de conexão'); assert.equal(snapshot.busy, false);
    query = async () => ({ liked: true, count: 6 });
    await snapshot.toggle(); await settle(); assert.equal(snapshot.error, ''); assert.equal(snapshot.count, 6);
  });
});

test('resposta de uma conta anterior é descartada e árvores privadas não recebem curtidas', async () => {
  let resolve;
  query = () => new Promise(done => { resolve = done; });
  await probe(async render => {
    render(); await settle(); snapshot.toggle(); await settle();
    render('another'); await settle(); resolve({ liked: true, count: 99 }); await settle();
    assert.equal(snapshot.liked, false); assert.equal(snapshot.count, 5); assert.equal(snapshot.busy, false);
    query = () => assert.fail('Não deveria gravar');
    render(null); await settle(); await snapshot.toggle();
    render('person', { ...tree, public_profile: false }); await settle(); await snapshot.toggle();
    render('person', { ...tree, status: 'pending' }); await settle(); await snapshot.toggle();
  });
});
