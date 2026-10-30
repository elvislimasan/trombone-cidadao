import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as adoption from '../lib/treeAdoption.js';
import * as adoptionClient from '../lib/treeAdoptionClient.js';

const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const panel = ({ children, className }) => React.createElement('div', { className }, children);
const mocks = {
  'react-router-dom': { Link: ({ to, children, ...props }) => React.createElement('a', { href: to, ...props }, children) },
  '@/components/ui/button': { Button: ({ variant, size, ...props }) => React.createElement('button', props) },
  '@/components/ui/input': { Input: props => React.createElement('input', props) },
  '@/components/ui/dialog': Object.fromEntries(['Dialog', 'DialogContent', 'DialogDescription', 'DialogHeader', 'DialogTitle'].map(name => [name, panel])),
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user: { id: 'citizen' } }) },
  '@/lib/customSupabaseClient': { supabase: {} },
  '@/hooks/useTreeAdoptionCatalog': { __esModule: true, default: () => ({}) },
  './TreeAdoptionRequestCard': { __esModule: true, default: () => null, AdoptionStatus: ({ status }) => React.createElement('span', {}, adoption.ADOPTION_STATUSES[status]) },
  './treeAdoptionManagement.css': {},
  '@/lib/treeAdoption': adoption,
  '@/lib/treeAdoptionClient': adoptionClient,
};
// Exercise the private dialog with real icon imports, without changing its production API.
const source = readFileSync(new URL('../components/arborization/TreeAdoptionRequests.jsx', import.meta.url), 'utf8') + '\nexport { RequestDetails };';
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const { RequestDetails } = module.exports;
const request = { ...adoption.EMPTY_ADOPTION, id: 'request-1', status: 'solicitada', author_id: 'citizen', request_type: 'muda', requester_name: 'Maria da Silva', requester_phone: '(87) 99999-9999', species_id: 'ipe', quantity: 1, provider: 'viveiro_municipal', address: 'Rua das Flores, 20', latitude: -8.6, longitude: -38.57, created_at: '2026-10-30T10:00:00Z' };
const catalog = { species: [{ id: 'ipe', common_name: 'Ipê' }], availability: [], nurseries: [] };

for (const scenario of [
  { label: 'atendimento municipal', manager: true, status: 'solicitada', action: 'Atender solicitação' },
  { label: 'pedido encerrado', manager: true, status: 'concluida', action: 'Atendimento encerrado' },
  { label: 'acompanhamento do cidadão', manager: false, status: 'solicitada', action: 'Falar com a equipe' },
]) {
  test(`resumo do pedido renderiza ícones e dados no ${scenario.label}`, () => {
    const html = renderToStaticMarkup(React.createElement(RequestDetails, { request: { ...request, status: scenario.status }, catalog, manager: scenario.manager, dispatcher: true, onClose() {}, onUpdated() {} }));
    assert.match(html, /Resumo do pedido/);
    assert.match(html, /lucide-leaf/);
    assert.match(html, /Maria da Silva/);
    assert.match(html, /Ipê/);
    assert.ok(html.includes(scenario.action));
    if (scenario.status === 'concluida') assert.match(html, /lucide-clipboard-list/);
  });
}
