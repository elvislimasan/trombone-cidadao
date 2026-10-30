import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as poleDisplay from '../lib/poleDisplay.js';
import { normalizeLampType } from '../lib/lightingCatalog.js';

const require = createRequire(import.meta.url);
const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const mocks = {
  'lucide-react': new Proxy({}, { get: () => () => null }),
  'react-router-dom': { Link: ({ to, ...props }) => React.createElement('a', { href: to, ...props }) },
  '@/components/ui/button': { Button: ({ variant, size, asChild, children, ...props }) => asChild ? React.cloneElement(children, props) : React.createElement('button', props, children) },
  '@/components/ui/dialog': {
    Dialog: ({ open, children }) => open ? children : null,
    DialogContent: props => React.createElement('div', props),
    DialogTitle: props => React.createElement('h2', props),
    DialogDescription: props => React.createElement('p', props),
  },
  '@/components/municipality/MunicipalLightingMap': { lightingStatus: pole => pole.lighting_status },
  '@/lib/lightingCatalog': { normalizeLampType },
  '@/lib/poleDisplay': poleDisplay,
};
const code = ts.transpileModule(readFileSync(new URL('../components/municipality/PoleDetailsDialog.jsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const pole = { id: 1, identifier: 'S815475', lighting_status: 'aceso', latitude: -8.6012, longitude: -38.5815 };
function withDialog(props, run) {
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(React.createElement(module.exports.default, { open: true, pole, related: { history: [], orders: [], reports: [] }, onOpenChange() {}, ...props })));
    run(host);
  } finally { flushSync(() => root.unmount()); host.remove(); }
}

test('remover fica junto de editar no resumo do poste, sem passar pelo formulário', () => {
  const actions = [];
  withDialog({ canEditLighting: true, onEdit: step => actions.push(['edit', step]), onRemove: () => actions.push(['remove']) }, host => {
    const buttons = [...host.querySelectorAll('button')];
    assert.equal(buttons[0].textContent, 'Editar poste');
    assert.equal(buttons[1].textContent, 'Remover poste');
    flushSync(() => buttons[1].click());
    assert.deepEqual(actions, [['remove']]);
    flushSync(() => buttons.find(button => button.textContent === 'Corrigir localização').click());
    assert.deepEqual(actions[1], ['edit', 1]);
  });
});

test('resumo não oferece remoção para leitor nem para poste já removido', () => {
  for (const props of [{ canEditLighting: false }, { canEditLighting: true, pole: { ...pole, lighting_status: 'removido' } }]) {
    withDialog({ onRemove() {}, ...props }, host => {
      assert.equal([...host.querySelectorAll('button')].some(button => button.textContent === 'Remover poste'), false);
      assert.match(host.textContent, /Histórico/);
    });
  }
});

test('remoção em andamento desabilita edição e cliques duplicados', () => {
  let removals = 0;
  withDialog({ canEditLighting: true, saving: true, onRemove: () => removals++ }, host => {
    const buttons = [...host.querySelectorAll('button')];
    const remove = buttons.find(button => button.textContent === 'Removendo…');
    assert.equal(remove.disabled, true);
    assert.equal(buttons[0].disabled, true);
    remove.click();
    assert.equal(removals, 0);
  });
});
