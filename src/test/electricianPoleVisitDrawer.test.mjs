import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as categoryFields from '../lib/reportCategoryFields.js';
import * as poleDisplay from '../lib/poleDisplay.js';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const require = createRequire(import.meta.url);
const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');

test('a visita mostra o problema de cada solicitação sem mudar a elegibilidade para atendimento', async () => {
  const pole = { id: 123, identifier: 'X100342', lighting_status: 'apagado' };
  const reports = [
    { report_id: 'r1', title: 'Solicitação na rua A', issue_type: 'lamp_blinking' },
    { report_id: 'r2', title: 'Solicitação na rua B', issue_type: 'exposed_wiring', ordem_id: 'o2', atribuida_a_mim: false },
    { report_id: 'r3', title: 'Solicitação antiga', issue_type: null },
  ];
  const calls = [];
  const supabase = {
    async rpc(name, params) { calls.push({ name, params }); return { data: reports }; },
    from(table) {
      const query = {
        select() { return query; }, eq() { return query; }, single() { return query; },
        order() { return query; }, limit() { return query; },
        then(resolve) { return Promise.resolve({ data: table === 'poles' ? pole : [] }).then(resolve); },
      };
      return query;
    },
  };
  const wrapper = ({ children }) => React.createElement('div', null, children);
  const mocks = {
    'react-router-dom': { Link: ({ to, children }) => React.createElement('a', { href: to }, children) },
    'lucide-react': { X: () => null },
    '@/components/municipality/MunicipalLightingMap': { lightingStatus: (value) => value.lighting_status },
    '@/components/ui/drawer': Object.fromEntries(['Drawer', 'BottomSheetContent', 'DrawerHeader', 'DrawerTitle', 'DrawerDescription', 'DrawerClose'].map((name) => [name, wrapper])),
    '@/components/ui/button': { Button: (props) => React.createElement('button', props) },
    '@/components/ui/input': { Input: (props) => React.createElement('input', props) },
    '@/lib/customSupabaseClient': { supabase },
    '@/lib/poleDisplay': poleDisplay,
    '@/lib/lightingCatalog': { LAMP_TYPES: [] },
    '@/lib/reportCategoryFields': categoryFields,
    '@/lib/appError': { showAppNotice() {} },
  };
  const code = ts.transpileModule(read('src/components/municipality/ElectricianPoleVisitDrawer.jsx'), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), module, module.exports);
  const node = document.createElement('div');
  document.body.appendChild(node);
  const root = createRoot(node);
  try {
    flushSync(() => root.render(React.createElement(module.exports.default, {
      pole, municipality: { id: 'pref1', city_id: 1 }, onClose() {},
    })));
    await new Promise((resolve) => setTimeout(resolve, 30));
    const cards = [...node.querySelectorAll('input[name="active-report"]')].map((input) => input.closest('label'));
    assert.equal(cards.length, 3);
    assert.match(cards[0].textContent, /Tipo do problema: piscando/);
    assert.match(cards[1].textContent, /Tipo do problema: fiação exposta/);
    assert.match(cards[2].textContent, /Tipo do problema: Não informado/);
    assert.equal(cards[0].querySelector('input').checked, true);
    assert.equal(cards[1].querySelector('input').disabled, true);
    assert.equal(cards[2].querySelector('input').disabled, false);
    assert.deepEqual(calls, [{ name: 'solicitacoes_ativas_poste_eletricista', params: { p_prefeitura: 'pref1', p_poste_id: 123 } }]);
  } finally {
    flushSync(() => root.unmount());
    node.remove();
  }
});

test('a migração acrescenta a subcategoria mantendo o escopo e as permissões da consulta original', () => {
  const previous = read('supabase/migrations/335_visita_poste_resolve_solicitacao.sql').split('create or replace function public.registrar_visita_poste_eletricista_v2')[0];
  const migration = read('supabase/migrations/352_subcategoria_solicitacoes_poste_eletricista.sql');
  const body = (sql) => sql.match(/language plpgsql[\s\S]*?grant execute[^;]+;/)[0].replace(/\s+/g, ' ').trim();
  assert.equal(body(migration).replace(',r.issue_type::text', ''), body(previous));
  assert.match(migration, /returns table\([^\n]+,issue_type text\)/);
  assert.match(migration, /begin;[\s\S]+drop function[^;]+;[\s\S]+commit;/);
  assert.doesNotMatch(migration, /drop function[^;]*cascade/i);
});
