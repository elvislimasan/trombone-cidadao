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
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const element = (tag) => React.forwardRef((props, ref) => React.createElement(tag, { ...props, ref }));
const mocks = {
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/lib/customSupabaseClient': { supabase: new Proxy({}, { get() { throw new Error('Consulta pública não deve exigir autenticação nem gravação'); } }) },
  '@/components/ui/button': { Button: ({ size, variant, ...props }) => React.createElement('button', props) },
  '@/components/ui/input': { Input: element('input') },
  '@/components/ui/progress': { Progress: () => null },
  '@/components/ui/dialog': {
    Dialog: ({ open, children }) => open ? React.createElement('div', {}, children) : null,
    DialogContent: element('div'), DialogHeader: element('div'), DialogTitle: element('h2'),
  },
  '@/components/ui/table': Object.fromEntries(Object.entries({
    Table: 'table', TableBody: 'tbody', TableCell: 'td', TableHead: 'th', TableHeader: 'thead', TableRow: 'tr',
  }).map(([name, tag]) => [name, element(tag)])),
};
function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), module, module.exports);
  return module.exports;
}
mocks['./PaymentMeasurementDetails'] = load('../components/project/obra/PaymentMeasurementDetails.jsx');
const { ObraPayments } = load('../components/project/obra/ObraPayments.jsx');
const pdfUrl = 'https://example.com/boletim.pdf';
const payment = {
  id: 'p1', orderNumber: '123', payment_date: '2026-10-12', value: 1000,
  installment: '07', measurement_pdf_url: pdfUrl,
};
function withPayments(payments, run, props = {}) {
  const node = document.createElement('div'); document.body.appendChild(node);
  const root = createRoot(node);
  try {
    flushSync(() => root.render(React.createElement(ObraPayments, { payments, ...props })));
    run(node);
  } finally {
    flushSync(() => root.unmount()); node.remove();
  }
}
function click(scope, label) {
  const button = [...scope.querySelectorAll('button')].find((node) => node.textContent.trim() === label);
  assert.ok(button, `Botão ${label}`);
  flushSync(() => button.click());
}
function assertPdf(scope) {
  const link = scope.querySelector(`a[href="${pdfUrl}"]`);
  assert.ok(link, 'PDF do boletim disponível para consulta pública');
  assert.match(link.textContent, /PDF do boletim/);
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
}

test('card público no celular mostra PDF de pagamento único, mesmo sem descrição ou link do portal', () => {
  withPayments([payment], (node) => {
    const mobile = node.querySelector('.md\\:hidden');
    assertPdf(mobile);
    assert.match(mobile.textContent, /Boletim nº 07/);
    assert.equal(node.textContent.includes('Gerenciar'), false);
    assert.equal(node.textContent.includes('Editar'), false);
  });
});

test('consulta pública mantém PDF na tabela e na visualização desktop de cards', () => {
  withPayments([payment], (node) => {
    assertPdf(node.querySelector('table'));
    click(node, 'Cards');
    assertPdf(node.querySelector('.md\\:grid'));
  });
});

test('público consegue expandir empenho e acessar PDF de cada pagamento na tabela e no celular', () => {
  withPayments([payment, { ...payment, id: 'p2', installment: '08' }], (node) => {
    const mobile = node.querySelector('.md\\:hidden');
    click(mobile, 'Ver pagamentos desse empenho');
    assert.equal(mobile.querySelectorAll(`a[href="${pdfUrl}"]`).length, 2);
    assert.equal(node.querySelectorAll('table table a').length, 2);
  });
});

test('card público omite link ausente ou inválido e mantém as datas do boletim', () => {
  for (const url of [null, 'javascript:alert(1)']) {
    withPayments([{ ...payment, measurement_pdf_url: url, measurement_date: '2026-10-12' }], (node) => {
      const mobile = node.querySelector('.md\\:hidden');
      assert.equal(mobile.querySelector('a'), null);
      assert.match(mobile.textContent, /Data do boletim: 12\/10\/2026/);
    });
  }
});

test('administrador continua com acesso ao PDF e às ações de gerenciamento', () => {
  withPayments([payment], (node) => {
    click(node, 'Gerenciar');
    assertPdf(node);
    assert.match(node.textContent, /Gerenciar pagamentos/);
    assert.match(node.textContent, /Editar/);
  }, { canAdd: true });
});
