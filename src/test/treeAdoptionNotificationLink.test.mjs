import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as adoption from '../lib/treeAdoption.js';
import * as adoptionClient from '../lib/treeAdoptionClient.js';

const require = createRequire(import.meta.url), win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
const row = { ...adoption.EMPTY_ADOPTION, id: 'a0000000-0000-0000-0000-000000000001', city_id: 64, author_id: 'citizen', status: 'concluida', request_type: 'muda', species_id: 'ipe', provider: 'viveiro_municipal', requester_name: 'Maria da Silva', address: 'Rua das Flores, 20', created_at: '2026-10-30T10:00:00Z' };
let result, queries, user;
const api = { from() {
  const filters = [];
  const query = { select() { return query; }, eq(key, value) { filters.push([key, value]); return query; }, order() { return query; }, range() { return query; }, not() { return query; },
    maybeSingle() { queries.push(filters); return Promise.resolve(result); },
    then(resolve) { return Promise.resolve({ data: [], count: 0 }).then(resolve); },
  }; return query;
} };
const panel = ({ children, className }) => React.createElement('div', { className }, children);
const mocks = {
  'lucide-react': new Proxy({}, { get: () => () => null }),
  'react-router-dom': { Link: ({ to, state, children, ...props }) => React.createElement('a', { href: to, 'data-return': JSON.stringify(state?.from), ...props }, children) },
  '@/components/ui/button': { Button: ({ variant, size, asChild, children, ...props }) => asChild ? React.cloneElement(children, props) : React.createElement('button', props, children) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/components/ui/dialog': { Dialog: ({ children, onOpenChange }) => React.createElement('section', {}, React.createElement('button', { onClick: () => onOpenChange(false) }, 'Fechar pedido'), children), DialogContent: panel, DialogHeader: panel, DialogDescription: panel, DialogTitle: panel },
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user }) },
  '@/lib/customSupabaseClient': { supabase: api },
  '@/hooks/useTreeAdoptionCatalog': { __esModule: true, default: () => ({ loading: false, error: '', species: [{ id: 'ipe', common_name: 'Ipê' }], availability: [], nurseries: [], refresh() {} }) },
  '@/lib/treeAdoption': adoption,
  '@/lib/treeAdoptionClient': adoptionClient,
  './TreeAdoptionRequestCard': { __esModule: true, default: () => null, AdoptionStatus: () => null },
  './treeAdoptionManagement.css': {},
};
const source = readFileSync(new URL('../components/arborization/TreeAdoptionRequests.jsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const Requests = module.exports.default;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 20)); flushSync(() => {}); };
async function withRequests(run) {
  result = { data: row }; queries = []; user = { id: 'citizen' };
  const node = document.createElement('div'); document.body.appendChild(node); const root = createRoot(node);
  const render = props => flushSync(() => root.render(React.createElement(Requests, { cityId: 64, requestId: row.id, ...props })));
  try { render(); await settle(); await run(node, render); } finally { flushSync(() => root.unmount()); node.remove(); }
}

test('push abre resumo de pedido encerrado fora dos resultados e fechar não reabre o diálogo', async () => {
  await withRequests(async (node, render) => {
    assert.match(node.textContent, /Nenhuma solicitação neste filtro/);
    assert.match(node.querySelector('.adoption-request-dialog').textContent, /Maria da Silva/);
    assert.match(node.querySelector('.adoption-request-dialog').textContent, /Atendimento encerrado/);
    assert.deepEqual(queries[0], [['id', row.id], ['city_id', 64], ['author_id', 'citizen']]);
    let closed = 0; render({ onRequestClose: () => closed++ });
    flushSync(() => [...node.querySelectorAll('button')].find(button => button.textContent === 'Fechar pedido').click());
    assert.equal(closed, 1); render({ revision: 1 }); await settle();
    assert.equal(node.querySelector('.adoption-request-dialog'), null);
  });
});

test('falha ao abrir notificação permite tentar novamente sem perder o pedido de destino', async () => {
  await withRequests(async (node, render) => {
    result = { error: { message: 'offline' } }; render({ requestId: 'a0000000-0000-0000-0000-000000000002' }); await settle();
    assert.equal(node.querySelector('.adoption-request-dialog'), null);
    assert.match(node.querySelector('[role="alert"]').textContent, /Não foi possível abrir/);
    result = { data: { ...row, id: 'a0000000-0000-0000-0000-000000000002' } };
    flushSync(() => [...node.querySelectorAll('button')].find(button => button.textContent === 'Tentar novamente').click()); await settle();
    assert.match(node.querySelector('.adoption-request-dialog').textContent, /Maria da Silva/);
  });
});

test('troca de conta remove dados do pedido e login preserva o link recebido', async () => {
  await withRequests(async (node, render) => {
    user = null; render(); await settle();
    assert.equal(node.querySelector('.adoption-request-dialog'), null);
    const login = node.querySelector('a[href="/login"]'); assert.ok(login);
    const destination = JSON.parse(login.getAttribute('data-return'));
    assert.equal(destination.pathname, '/adote-uma-arvore');
    assert.equal(new URLSearchParams(destination.search).get('pedido'), row.id);
    assert.equal(new URLSearchParams(destination.search).get('cidade'), '64');
  });
});
