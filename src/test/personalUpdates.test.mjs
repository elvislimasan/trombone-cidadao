import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';

const require = createRequire(import.meta.url), win = new Window({ url: 'https://example.test/seguindo' });
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom'), { MemoryRouter } = require('react-router-dom');
let user, requests;
const client = { from(table) {
  let resolve, reject;
  const task = { table, filters: [], promise: new Promise((yes, no) => { resolve = yes; reject = no; }) };
  task.resolve = resolve; task.reject = reject;
  requests.push(task);
  const query = { select() { return this; }, eq(key, value) { task.filters.push([key, value]); return this; }, not() { return this; }, neq() { return this; }, order() { return this; }, limit() { return this; }, update(value) { task.update = value; return this; }, then(...args) { return task.promise.then(...args); } };
  return query;
} };
function load(file, mocks = {}) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => name in mocks ? mocks[name] : require(name), module, module.exports);
  return module.exports.default || module.exports;
}
const Updates = load('../components/PersonalUpdates.jsx', {
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user }) },
  '@/lib/customSupabaseClient': { supabase: client },
  '@/components/TimeAgo': { __esModule: true, default: () => React.createElement('span', null, 'agora') },
});
const Journeys = load('../components/journeys/ProfileJourneys.jsx', { '@/hooks/useProfileJourneySummary': { useProfileJourneySummary: () => ({ reports: 31, following: 2, trees: 3, requests: 1 }) } });
const countRequests = [];
const { useProfileJourneySummary } = load('../hooks/useProfileJourneySummary.js', {
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user }) },
  '@/lib/customSupabaseClient': { supabase: {} },
  '@/lib/profileJourneySummary': { fetchProfileJourneySummary: (client, userId, cityId) => new Promise(resolve => countRequests.push({ userId, cityId, resolve })) },
});
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 5)); flushSync(() => {}); };
async function render(Component, task) {
  user = { id: 'account-a' }; requests = [];
  const node = document.createElement('div'); document.body.append(node); const root = createRoot(node);
  const draw = () => flushSync(() => root.render(React.createElement(MemoryRouter, null, React.createElement(Component))));
  draw();
  try { await settle(); await task({ node, draw }); } finally { flushSync(() => root.unmount()); node.remove(); }
}

test('novidades consultam a conta atual sem depender de permissão de push', async () => {
  await render(Updates, async ({ node }) => {
    assert.ok(node.textContent.includes('Buscando novidades'));
    assert.deepEqual(requests[0].filters, [['user_id', 'account-a'], ['is_read', false]]);
    requests[0].resolve({ data: [{ id: 'n1', report_id: 'r1', message: 'Seu relato recebeu uma resposta' }] }); await settle();
    assert.equal(node.querySelector('a').getAttribute('href'), '/bronca/r1');
    flushSync(() => node.querySelector('a').click()); await settle();
    assert.deepEqual(requests[1].filters, [['id', 'n1'], ['user_id', 'account-a']]);
    requests[1].resolve({ error: null });
  });
});

test('erro tem nova tentativa e resultado vazio tem orientação própria', async () => {
  await render(Updates, async ({ node }) => {
    requests[0].reject(new Error('offline')); await settle();
    assert.ok(node.querySelector('[role=alert]'));
    assert.ok(!node.textContent.includes('Tudo em dia'));
    flushSync(() => [...node.querySelectorAll('button')].find(button => button.textContent === 'Tentar novamente').click()); await settle();
    requests.at(-1).resolve({ data: [] }); await settle();
    assert.ok(node.textContent.includes('Tudo em dia'));
    assert.equal(node.querySelector('a').getAttribute('href'), '/seguindo?aba=broncas');
  });
});

test('trocar de conta oculta itens antigos e descarta resposta atrasada', async () => {
  await render(Updates, async ({ node, draw }) => {
    const oldRequest = requests[0];
    user = { id: 'account-b' }; draw(); await settle();
    requests[1].resolve({ data: [{ id: 'b', report_id: 'b', message: 'Conteúdo da conta B' }] }); await settle();
    oldRequest.resolve({ data: [{ id: 'a', report_id: 'a', message: 'Conteúdo privado da conta A' }] }); await settle();
    assert.ok(node.textContent.includes('Conteúdo da conta B'));
    assert.ok(!node.textContent.includes('conta A'));
    user = { id: 'account-c' }; draw();
    assert.ok(!node.textContent.includes('conta B'));
  });
});

test('resposta de atualização antiga não substitui a mais recente', async () => {
  await render(Updates, async ({ node }) => {
    requests[0].resolve({ data: [] }); await settle();
    window.dispatchEvent(new Event('focus')); await settle();
    window.dispatchEvent(new Event('new-notification')); await settle();
    requests[2].resolve({ data: [{ id: 'new', report_id: 'new', message: 'Atualização nova' }] }); await settle();
    requests[1].resolve({ data: [{ id: 'old', report_id: 'old', message: 'Atualização antiga' }] }); await settle();
    assert.ok(node.textContent.includes('Atualização nova'));
    assert.ok(!node.textContent.includes('Atualização antiga'));
  });
});

test('atalhos pessoais abrem árvores e pedidos no contexto da cidade', async () => {
  await render(() => React.createElement(Journeys, { cityId: 64 }), async ({ node }) => {
    const links = [...node.querySelectorAll('a')].map(link => link.getAttribute('href'));
    assert.ok(links.includes('/arvores-da-comunidade?aba=minhas&cidade=64'));
    assert.ok(links.includes('/adoteumaarvore?aba=minhas&cidade=64'));
    assert.ok(links.includes('/seguindo?aba=novidades'));
  });
});

test('quantidades descartam resposta da conta ou cidade anterior', async () => {
  countRequests.length = 0;
  let city = 64;
  function Probe() { return React.createElement('p', null, JSON.stringify(useProfileJourneySummary(city))); }
  await render(Probe, async ({ node, draw }) => {
    const old = countRequests[0];
    user = { id: 'account-b' }; city = 65; draw(); await settle();
    assert.equal(node.textContent, '{}');
    countRequests[1].resolve({ reports: 2, trees: 1 }); await settle();
    old.resolve({ reports: 1205, trees: 99 }); await settle();
    assert.equal(node.textContent, '{"reports":2,"trees":1}');
    assert.equal(countRequests[1].userId, 'account-b');
    assert.equal(countRequests[1].cityId, 65);
  });
});
