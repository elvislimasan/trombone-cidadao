import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';

const require = createRequire(import.meta.url);
const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
globalThis.requestAnimationFrame = win.requestAnimationFrame.bind(win);
globalThis.cancelAnimationFrame = win.cancelAnimationFrame.bind(win);
globalThis.Event = win.Event;
const React = require('react');
const { createRoot } = require('react-dom/client');
const { createPortal, flushSync } = require('react-dom');
const DialogContext = React.createContext(false);
const mocks = {
  'lucide-react': { Maximize2: () => null, Minimize2: () => null },
  '@/components/ui/button': { Button: ({ size, variant, ...props }) => React.createElement('button', props) },
  '@/components/ui/dialog': {
    Dialog: ({ open, children }) => React.createElement(DialogContext.Provider, { value: open }, children),
    DialogContent: ({ hideClose, onInteractOutside, ...props }) => {
      const open = React.useContext(DialogContext);
      const [mounted, setMounted] = React.useState(false);
      const contentRef = React.useRef(null);
      React.useEffect(() => {
        if (open && mounted && contentRef.current) return require('aria-hidden').hideOthers(contentRef.current);
      }, [open, mounted]);
      // O portal real pode montar depois do efeito do painel que o abriu.
      React.useEffect(() => {
        const timer = setTimeout(() => setMounted(open), 0);
        return () => clearTimeout(timer);
      }, [open]);
      return open && mounted
        ? createPortal(React.createElement('div', { ...props, ref: contentRef, role: 'dialog' }), document.body) : null;
    },
    DialogTitle: (props) => React.createElement('h2', props),
  },
};
const source = readFileSync(new URL('../components/map/FullscreenMapPanel.jsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), module, module.exports);

for (const withHeader of [false, true]) test(`portal com montagem adiada preserva a instância ao expandir e recolher ${withHeader ? 'com cabeçalho' : 'com botão sobre o mapa'}`, async () => {
  let mounts = 0;
  function MapFixture() {
    const [zoom, setZoom] = React.useState(13);
    React.useEffect(() => { mounts += 1; }, []);
    return React.createElement('button', { id: 'map-fixture', onClick: () => setZoom(17) }, `Zoom ${zoom}`);
  }
  const node = document.createElement('div');
  document.body.appendChild(node);
  const root = createRoot(node);
  try {
    flushSync(() => root.render(React.createElement(module.exports.default, { title: 'Mapa de ruas', header: withHeader ? React.createElement('h2', null, 'Localização da árvore') : undefined }, React.createElement(MapFixture))));
    const mapNode = document.querySelector('#map-fixture');
    flushSync(() => mapNode.click());
    const expand = node.querySelector('button[aria-label]');
    flushSync(() => expand.click());
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(document.querySelector('#map-fixture'), mapNode);
    assert.equal(mapNode.textContent, 'Zoom 17');
    assert.ok(mapNode.closest('[role="dialog"]'));
    const close = [...document.querySelectorAll('[role="dialog"] button')].find((button) => button.textContent.trim() === 'Sair da tela cheia');
    flushSync(() => close.click());
    assert.equal(node.querySelector('#map-fixture'), mapNode);
    assert.equal(mapNode.textContent, 'Zoom 17');
    flushSync(() => expand.click());
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(document.querySelector('[role="dialog"] #map-fixture'), mapNode);
    assert.equal(mapNode.textContent, 'Zoom 17');
    assert.equal(mounts, 1);
  } finally {
    flushSync(() => root.unmount());
    node.remove();
  }
});

test('tela cheia controlada mantém busca e filtros junto ao mapa sem duplicar o botão de expansão', async () => {
  function Tools() {
    const [status, setStatus] = React.useState('all');
    return React.createElement('aside', null,
      React.createElement('input', { id: 'lighting-search-fixture', defaultValue: 'X159189' }),
      React.createElement('button', { id: 'lighting-filter-fixture', onClick: () => setStatus('apagado') }, status),
      React.createElement('div', { 'aria-live': 'polite' }, 'Resultados de postes'));
  }
  function Page() {
    const [expanded, setExpanded] = React.useState(false);
    return React.createElement(React.Fragment, null,
      React.createElement('button', { id: 'expand-lighting-fixture', onClick: () => setExpanded(true) }, 'Ampliar mapa'),
      React.createElement(module.exports.default, { title: 'Mapa de iluminação', open: expanded, onOpenChange: setExpanded, hideExpandButton: true },
        React.createElement('div', { id: 'lighting-map-fixture' }, 'Mapa'), React.createElement(Tools)));
  }
  const node = document.createElement('div');
  document.body.appendChild(node);
  const root = createRoot(node);
  try {
    flushSync(() => root.render(React.createElement(Page)));
    assert.equal(node.querySelector('button[aria-label="Expandir mapa de iluminação para tela cheia"]'), null);
    const search = document.querySelector('#lighting-search-fixture');
    const map = document.querySelector('#lighting-map-fixture');
    search.value = 'Rua de teste';
    flushSync(() => document.querySelector('#expand-lighting-fixture').click());
    await new Promise(resolve => setTimeout(resolve, 40));
    const dialog = document.querySelector('[role="dialog"]');
    assert.ok(dialog.contains(search));
    assert.ok(dialog.contains(map));
    assert.equal(map.closest('[aria-hidden="true"]'), null);
    assert.equal(search.closest('[aria-hidden="true"]'), null);
    flushSync(() => dialog.querySelector('#lighting-filter-fixture').click());
    assert.equal(dialog.querySelector('#lighting-filter-fixture').textContent, 'apagado');
    const close = [...dialog.querySelectorAll('button')].find(button => button.textContent.trim() === 'Sair da tela cheia');
    flushSync(() => close.click());
    assert.equal(node.querySelector('#lighting-search-fixture'), search);
    assert.equal(search.value, 'Rua de teste');
    assert.equal(node.querySelector('#lighting-filter-fixture').textContent, 'apagado');
    assert.equal(node.querySelector('#lighting-map-fixture'), map);
  } finally {
    flushSync(() => root.unmount());
    node.remove();
  }
});
