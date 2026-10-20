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
      // O portal real pode montar depois do efeito do painel que o abriu.
      React.useEffect(() => {
        const timer = setTimeout(() => setMounted(open), 0);
        return () => clearTimeout(timer);
      }, [open]);
      return open && mounted
        ? createPortal(React.createElement('div', { ...props, role: 'dialog' }), document.body) : null;
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
