/* global globalThis */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';

const require = createRequire(import.meta.url), window = new Window();
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Event', 'Node']) Object.defineProperty(globalThis, key, { configurable: true, value: key === 'window' ? window : window[key] });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require('react'), { act } = React, { createRoot } = require('react-dom/client');
let context;
const icons = new Proxy({}, { get: () => () => null });
const element = tag => ({ children, variant, size, ...props }) => React.createElement(tag, props, children);
const mocks = {
  react: React,
  'lucide-react': icons,
  '@/components/ui/dialog': { Dialog: ({ open, children }) => open ? React.createElement('div', null, children) : null, DialogContent: element('div'), DialogTitle: element('h2'), DialogDescription: element('p') },
  '@/components/ui/button': { Button: element('button') },
  '@/components/ui/progress': { Progress: () => null },
  '@/contexts/UploadContext': { useUpload: () => context },
  '@/lib/reportPhoto': { REPORT_PHOTO_ACCEPT: 'image/jpeg,image/heic,.heic' },
};
const code = ts.transpileModule(fs.readFileSync(new URL('../components/ReportMediaManager.jsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
// eslint-disable-next-line no-new-func -- Renderiza o componente real com contexto de fila e controles locais.
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);

test('painel oferece reenvio, troca e novas imagens para a mesma bronca, sem reenviar o relato', async () => {
  const calls = [], report = { reportId: 'report-1', title: 'Buraco', ownerId: 'author' };
  context = {
    reports: [report], managerOpen: true, managedReportId: report.reportId,
    activeUploads: { 'media-1': { id: 'media-1', reportId: report.reportId, name: 'foto.jpg', status: 'error', error: 'Sem rede' } },
    closeMediaManager() {}, selectManagedReport() {},
    retryUpload: id => calls.push(['retry', id]),
    replaceUpload: async (id, source) => calls.push(['replace', id, source]),
    queueReportMedia: async (source, selectedReport) => calls.push(['add', source, selectedReport]),
    cancelUpload: id => calls.push(['dismiss', id]),
  };
  const container = document.createElement('div'), root = createRoot(container);
  document.body.appendChild(container);
  try {
    await act(async () => root.render(React.createElement(module.exports.default)));
    const button = label => [...container.querySelectorAll('button')].find(node => node.textContent === label);
    assert.match(container.textContent, /A bronca está salva/);
    act(() => button('Reenviar').click());
    assert.deepEqual(calls[0], ['retry', 'media-1']);
    const replace = container.querySelector('[aria-label="Substituir arquivo pendente"]');
    replace.click = () => {};
    act(() => button('Trocar imagem').click());
    const file = new File(['jpeg'], 'nova.jpg', { type: 'image/jpeg' });
    Object.defineProperty(replace, 'files', { configurable: true, value: [file] });
    await act(async () => replace.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.equal(calls[1][0], 'replace');
    assert.equal(calls[1][1], 'media-1');
    assert.equal(calls[1][2].file, file);
    const gallery = container.querySelector('[aria-label="Selecionar novas fotos"]');
    Object.defineProperty(gallery, 'files', { configurable: true, value: [file] });
    await act(async () => gallery.dispatchEvent(new window.Event('change', { bubbles: true })));
    assert.equal(calls[2][0], 'add');
    assert.equal(calls[2][2].reportId, report.reportId);
    assert.equal(container.querySelector('[aria-label="Tirar nova foto"]').getAttribute('capture'), 'environment');
    act(() => button('Remover pendência').click());
    assert.deepEqual(calls[3], ['dismiss', 'media-1']);
  } finally {
    act(() => root.unmount());
    container.remove();
    await window.happyDOM.abort();
  }
});
