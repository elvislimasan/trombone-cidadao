import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as adoption from '../lib/treeAdoption.js';
import * as adoptionClient from '../lib/treeAdoptionClient.js';
import * as utils from '../lib/utils.js';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const panel = ({ children, className }) => React.createElement('div', { className }, children);
const mocks = {
  'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
  '@/components/ui/button': { Button: ({ variant, size, asChild, children, ...props }) => asChild ? React.cloneElement(children, props) : React.createElement('button', props, children) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/components/ui/tabs': { Tabs: panel, TabsList: panel, TabsContent: panel, TabsTrigger: ({ children }) => React.createElement('button', {}, children) },
  '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle'].map(name => [name, panel])),
  '@/components/ui/task-dialog': { TaskDialogContent: panel, TaskDialogBody: panel, TaskDialogFooter: panel },
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user: { id: 'citizen' } }) },
  '@/lib/customSupabaseClient': { supabase: {} },
  '@/hooks/useTreeAdoptionCatalog': { __esModule: true, default: () => ({}) },
  './TreeAdoptionRequestCard': { __esModule: true, default: () => null, AdoptionStatus: ({ status }) => React.createElement('span', {}, adoption.ADOPTION_STATUSES[status]) },
  './TreeAdoptionReceiptButton': { __esModule: true, default: () => null },
  './TreeAdoptionEditDialog': { __esModule: true, default: () => null },
  './TreeAdoptionPickup': { __esModule: true, default: () => null },
  './treeAdoptionManagement.css': {},
  './TreeProgramPhoto': { __esModule: true, default: () => null },
  '@/lib/treeAdoption': adoption,
  '@/lib/treeAdoptionClient': adoptionClient,
  '@/lib/utils': utils,
};
const journeyCode = ts.transpileModule(readFileSync(new URL('../components/arborization/TreeJourney.jsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const journey = { exports: {} };
new Function('require', 'module', 'exports', journeyCode)(name => name.endsWith('.css') ? {} : mocks[name] || require(name), journey, journey.exports);
mocks['./TreeJourney'] = journey.exports;
// Exercise the private dialog with real icon imports, without changing its production API.
const source = readFileSync(new URL('../components/arborization/TreeAdoptionRequests.jsx', import.meta.url), 'utf8') + '\nexport { RequestDetails };';
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => name.endsWith('.css') ? {} : mocks[name] || require(name), module, module.exports);
const { RequestDetails } = module.exports;
const request = { ...adoption.EMPTY_ADOPTION, id: 'request-1', status: 'solicitada', author_id: 'citizen', request_type: 'muda', requester_name: 'Maria da Silva', requester_phone: '(87) 99999-9999', species_id: 'ipe', quantity: 1, provider: 'viveiro_municipal', address: 'Rua das Flores, 20', latitude: -8.6, longitude: -38.57, created_at: '2026-10-30T10:00:00Z' };
const catalog = { species: [{ id: 'ipe', common_name: 'Ipê' }], availability: [], nurseries: [] };

for (const scenario of [
  { label: 'atendimento municipal', manager: true, status: 'solicitada', action: 'Atender solicitação' },
  { label: 'pedido encerrado', manager: true, status: 'concluida', action: 'Atendimento encerrado' },
  { label: 'acompanhamento do cidadão', manager: false, status: 'solicitada', action: 'Falar com a equipe' },
  { label: 'pedido concluído do cidadão', manager: false, status: 'concluida', action: 'Comece o diário' },
]) {
  test(`resumo do pedido renderiza ícones e dados no ${scenario.label}`, () => {
    const html = renderToStaticMarkup(React.createElement(RequestDetails, { request: { ...request, status: scenario.status }, catalog, manager: scenario.manager, dispatcher: true, onClose() {}, onUpdated() {} }));
    assert.match(html, /Resumo do pedido/);
    assert.match(html, /lucide-leaf/);
    assert.match(html, /Maria da Silva/);
    if (scenario.manager) {
      assert.match(html, /href="https:\/\/wa\.me\/5587999999999"/);
      assert.match(html, /Abrir WhatsApp de Maria da Silva/);
    } else assert.doesNotMatch(html, /wa\.me/);
    assert.match(html, /Ipê/);
    assert.ok(html.toLocaleLowerCase('pt-BR').includes(scenario.action.toLocaleLowerCase('pt-BR')));
    if (!scenario.manager && scenario.status === 'concluida') assert.match(html, /arvores-da-comunidade\/nova/);
    if (scenario.status === 'concluida') assert.match(html, /lucide-clipboard-list/);
  });
}

test('contato antigo sem telefone válido não oferece link de WhatsApp', () => {
  for (const phone of ['', null, '1234']) {
    const html = renderToStaticMarkup(React.createElement(RequestDetails, { request: { ...request, requester_phone: phone }, catalog, manager: true, dispatcher: true, onClose() {}, onUpdated() {} }));
    assert.doesNotMatch(html, /wa\.me/);
  }
});

test('ponto de referência e edição aparecem para o autor e o gestor em pedido ativo', () => {
  for (const manager of [false, true]) {
    const html = renderToStaticMarkup(React.createElement(RequestDetails, { request: { ...request, reference_point: 'Em frente à escola' }, catalog, manager, dispatcher: manager, onClose() {}, onUpdated() {} }));
    assert.match(html, /Ponto de referência/);
    assert.match(html, /Em frente à escola/);
    assert.match(html, /Alterar pedido/);
  }
  const closed = renderToStaticMarkup(React.createElement(RequestDetails, { request: { ...request, status: 'concluida' }, catalog, manager: false, dispatcher: false, onClose() {}, onUpdated() {} }));
  assert.doesNotMatch(closed, /Alterar pedido/);
});
