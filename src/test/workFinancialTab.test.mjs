import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as measurementHelpers from '../lib/workPaymentMeasurement.js';

const require = createRequire(import.meta.url);
const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const contractors = [{ id: 'c1', name: 'Construtora cadastrada', cnpj: '12345678000100' }];
let payments, saved, uploadCalls, removed, errors, writeError;
const supabase = {
  from(table) {
    let write;
    const query = {
      select() { return query; }, eq() { return query; }, order() { return query; },
      insert(rows) { write = rows[0]; return query; }, update(row) { write = row; return query; },
      then(resolve) {
        if (write) {
          saved.push(write);
          if (!writeError) payments = [{ id: 'p1', ...write }];
        }
        const data = table === 'contractors' ? contractors : [{
          id: 'm1', title: '1ª Licitação', value: 10000, contractor_id: 'c1', contractor: contractors[0], payments,
        }];
        return Promise.resolve({ data, error: write ? writeError : null }).then(resolve);
      },
    };
    return query;
  },
  storage: { from() { return {
    async upload(path, file) { uploadCalls.push({ path, file }); return { error: null }; },
    getPublicUrl(path) { return { data: { publicUrl: `https://example.com/${path}` } }; },
    async remove(paths) { removed.push(...paths); return { error: null }; },
  }; } },
};
const wrapper = ({ children, ...props }) => React.createElement('div', props, children);
const mocks = {
  'lucide-react': new Proxy({}, { get: () => () => null }),
  '@/lib/appConfirm': { confirmApp: async () => true },
  '@/lib/customSupabaseClient': { supabase },
  '@/lib/workPaymentMeasurement': measurementHelpers,
  '@/lib/appError': { showAppError: (error) => errors.push(error) },
  '@/lib/utils': { formatCurrency: (value) => `R$ ${value}`, formatDate: (value) => value },
  '@/components/ui/button': { Button: ({ size, variant, ...props }) => React.createElement('button', props) },
  '@/components/ui/input': { Input: React.forwardRef((props, ref) => React.createElement('input', { ...props, ref })) },
  '@/components/ui/label': { Label: (props) => React.createElement('label', props) },
  '@/components/ui/textarea': { Textarea: (props) => React.createElement('textarea', props) },
  '@/components/ui/card': Object.fromEntries(['Card', 'CardContent', 'CardHeader', 'CardTitle', 'CardDescription', 'CardFooter'].map((name) => [name, wrapper])),
};
function load(relativePath) {
  const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)((name) => mocks[name] || require(name), module, module.exports);
  return module.exports;
}
mocks['@/components/project/obra/PaymentMeasurementFields'] = load('../components/project/obra/PaymentMeasurementFields.jsx');
mocks['@/components/project/obra/PaymentMeasurementDetails'] = load('../components/project/obra/PaymentMeasurementDetails.jsx');
const { WorkFinancialTab } = load('../components/admin/WorkFinancialTab.jsx');
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));
function click(text) {
  const button = [...document.querySelectorAll('button')].find((node) => node.textContent.includes(text));
  assert.ok(button, `Botão ${text}`);
  flushSync(() => button.click());
}
function fill(selector, value) {
  const input = document.querySelector(selector);
  assert.ok(input, `Campo ${selector}`);
  const nativeSet = Object.getOwnPropertyDescriptor(win.HTMLInputElement.prototype, 'value').set;
  flushSync(() => {
    nativeSet.call(input, value);
    input.dispatchEvent(new win.Event('input', { bubbles: true }));
    input.dispatchEvent(new win.Event('change', { bubbles: true }));
  });
}
async function withTab(run) {
  payments = []; saved = []; uploadCalls = []; removed = []; errors = []; writeError = null;
  const node = document.createElement('div'); document.body.appendChild(node);
  const root = createRoot(node);
  try {
    flushSync(() => root.render(React.createElement(WorkFinancialTab, { workId: 'w1' })));
    await settle();
    click('Adicionar pagamento');
    await run(node);
  } finally {
    flushSync(() => root.unmount()); node.remove();
  }
}

test('Financeiro de Editar Obra exibe e grava o boletim sem exigir número de empenho', async () => {
  await withTab(async () => {
    assert.equal(document.querySelector('#admin-payment-contractor').tagName, 'SELECT');
    assert.equal(document.querySelector('#admin-payment-contractor').value, 'c1');
    assert.equal(document.querySelector('#admin-measurement-fields').hidden, true);
    click('Adicionar boletim de medição');
    assert.equal(document.querySelector('#admin-measurement-fields').hidden, false);
    assert.equal(document.querySelector('#admin-measurement-number').closest('.opacity-0'), null);
    assert.ok(document.querySelector('#admin-measurement-pdf'));
    fill('input[inputmode="decimal"]', '125000');
    fill('#admin-measurement-number', '07');
    fill('#admin-measurement-date', '2026-10-12');
    fill('#admin-execution-start', '2026-09-01');
    fill('#admin-execution-end', '2026-09-30');
    fill('#admin-measurement-pdf-url', 'https://example.com/boletim.pdf');
    click('Boletim de medição');
    assert.equal(document.querySelector('#admin-measurement-fields').hidden, true);
    click('Boletim de medição');
    assert.equal(document.querySelector('#admin-measurement-number').value, '07');
    click('Salvar Pagamento'); await settle();
    assert.equal(saved.length, 1);
    assert.equal(saved[0].commitment_number, null);
    assert.equal(saved[0].value, 1250);
    assert.equal(saved[0].installment, '07');
    assert.equal(saved[0].contractor_id, 'c1');
    assert.equal(saved[0].creditor_name, contractors[0].name);
    assert.equal(saved[0].measurement_date, '2026-10-12');
    assert.equal(saved[0].execution_start_date, '2026-09-01');
    assert.equal(saved[0].execution_end_date, '2026-09-30');
    assert.equal(saved[0].measurement_pdf_url, 'https://example.com/boletim.pdf');
    assert.ok(document.querySelector('a[href="https://example.com/boletim.pdf"]'));
    flushSync(() => document.querySelector('button[aria-label="Editar pagamento"]').click());
    assert.equal(document.querySelector('#admin-measurement-fields').hidden, false);
    assert.equal(document.querySelector('#admin-measurement-number').value, '07');
    assert.equal(document.querySelector('#admin-measurement-date').value, '2026-10-12');
    assert.equal(document.querySelector('#admin-execution-end').value, '2026-09-30');
    assert.equal(document.querySelector('#admin-measurement-pdf-url').value, 'https://example.com/boletim.pdf');
    assert.deepEqual(errors, []);
  });
});

test('falha ao gravar pagamento remove o PDF recém-enviado e mantém o formulário aberto', async () => {
  await withTab(async () => {
    fill('input[inputmode="decimal"]', '10000');
    click('Adicionar boletim de medição');
    const file = new win.File(['%PDF-1.4'], 'boletim.pdf', { type: 'application/pdf' });
    const input = document.querySelector('#admin-measurement-pdf');
    Object.defineProperty(input, 'files', { configurable: true, value: [file] });
    flushSync(() => input.dispatchEvent(new win.Event('change', { bubbles: true })));
    assert.equal(document.querySelector('#admin-measurement-pdf-url').disabled, true);
    click('Boletim de medição');
    assert.equal(document.querySelector('#admin-measurement-fields').hidden, true);
    click('Boletim de medição');
    assert.equal(document.querySelector('#admin-measurement-pdf'), input);
    assert.equal(document.querySelector('#admin-measurement-pdf-url').disabled, true);
    writeError = new Error('Gravação recusada');
    click('Salvar Pagamento'); await settle();
    assert.equal(uploadCalls.length, 1);
    assert.deepEqual(removed, [uploadCalls[0].path]);
    assert.equal(errors[0].description, 'Gravação recusada');
    assert.ok(document.querySelector('#admin-measurement-pdf'));
  });
});

test('pagamento sem boletim mantém os campos opcionais vazios e o painel recolhido', async () => {
  await withTab(async () => {
    assert.equal(document.querySelector('#admin-measurement-fields').hidden, true);
    fill('input[inputmode="decimal"]', '10000');
    click('Salvar Pagamento'); await settle();
    assert.equal(saved[0].installment, null);
    assert.equal(saved[0].measurement_pdf_url, null);
    assert.equal(saved[0].measurement_date, null);
    assert.equal(saved[0].execution_start_date, null);
    assert.equal(saved[0].execution_end_date, null);
    assert.deepEqual(errors, []);
  });
});
