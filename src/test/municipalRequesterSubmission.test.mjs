import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as creation from '../lib/municipalReportCreation.js';

const require = createRequire(import.meta.url), win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'CustomEvent', 'localStorage']) Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
let calls, failContact, createReport, receipts;
const api = { from(table) {
  let operation = 'select', payload;
  const query = {
    select() { return query; }, eq() { return query; }, single() { return query; }, abortSignal() { return query; },
    insert(value) { operation = 'insert'; payload = value; return query; },
    delete() { operation = 'delete'; return query; },
    then(resolve, reject) {
      calls.push({ table, operation, payload });
      const result = table === 'prefeitura_membros' ? { data: [{ prefeitura: { id: 'city-hall', city_id: 64, status: 'ativa' } }] }
        : table === 'municipal_report_contacts' && failContact ? { error: new Error('Contato não salvo') }
          : { data: { ...payload, id: 'report-1' } };
      return Promise.resolve(result).then(resolve, reject);
    },
  };
  return query;
} };
const mocks = {
  'canvas-confetti': { __esModule: true, default() {} },
  '@capacitor/core': { Capacitor: { isNativePlatform: () => false } },
  '@capacitor/haptics': {},
  '@/lib/customSupabaseClient': { supabase: api },
  '@/contexts/SupabaseAuthContext': { useAuth: () => ({ user: { id: 'staff' } }) },
  '@/lib/municipalReportCreation': creation,
  '@/contexts/MissionProgressContext': { useMissionProgress: () => ({ celebrate() {} }) },
  '@/lib/treeInventory': { uploadTreePhoto: async () => null },
};
const source = readFileSync(new URL('../hooks/useCreateReport.jsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const form = { title: 'Reparo da calçada', category: 'calcadas', address: 'Rua A', location: { lat: -8.6, lng: -38.57 }, city_id: 64, requester_name: ' Maria ', requester_phone: '(87) 99999-1234', is_public: true };
async function withHook(municipalMode, run) {
  calls = []; failContact = false; receipts = [];
  function Probe() { ({ createReport } = module.exports.useCreateReport({ municipalMode, municipalityId: 'city-hall', onCreated: (_, report) => receipts.push(report) })); return null; }
  const node = document.createElement('div'); document.body.appendChild(node); const root = createRoot(node);
  try { flushSync(() => root.render(React.createElement(Probe))); await run(); } finally { flushSync(() => root.unmount()); node.remove(); }
}

test('solicitação pública municipal salva contato privado e mantém autor como servidor', async () => {
  await withHook(true, async () => {
    await createReport(form);
    const report = calls.find(c => c.table === 'reports').payload;
    assert.equal(report.is_public, true); assert.equal(report.author_id, 'staff');
    assert.equal(Object.hasOwn(report, 'requester_name'), false); assert.equal(Object.hasOwn(report, 'requester_phone'), false);
    assert.deepEqual(calls.find(c => c.table === 'municipal_report_contacts').payload, { report_id: 'report-1', name: 'Maria', phone: '(87) 99999-1234' });
    assert.equal(Object.hasOwn(receipts[0], 'requester_name'), false); assert.equal(Object.hasOwn(receipts[0], 'phone'), false);
  });
});

test('falha no contato desfaz solicitação e não emite confirmação nem envia anexos', async () => {
  await withHook(true, async () => {
    failContact = true; let uploads = 0;
    await assert.rejects(createReport(form, async () => { uploads++; }), /Contato não salvo/);
    assert.ok(calls.some(c => c.table === 'reports' && c.operation === 'delete'));
    assert.equal(receipts.length, 0); assert.equal(uploads, 0);
  });
});

test('formulário vazio continua válido e fluxo comum não grava contato municipal', async () => {
  await withHook(true, async () => {
    await createReport({ ...form, requester_name: '', requester_phone: '' });
    assert.equal(calls.some(c => c.table === 'municipal_report_contacts'), false);
    assert.equal(receipts.length, 1);
  });
  await withHook(false, async () => {
    await createReport(form);
    assert.equal(calls.some(c => c.table === 'municipal_report_contacts'), false);
    assert.equal(Object.hasOwn(calls.find(c => c.table === 'reports').payload, 'requester_name'), false);
  });
});

test('contato inválido impede gravar solicitação', async () => {
  await withHook(true, async () => {
    await assert.rejects(createReport({ ...form, requester_phone: '123' }), /DDD/);
    assert.deepEqual(calls, []);
  });
});
