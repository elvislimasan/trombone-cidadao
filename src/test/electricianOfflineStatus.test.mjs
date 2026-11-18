import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import 'fake-indexeddb/auto';
import { comLoja, LOJA_ELETRICISTA } from '../lib/offlineDb.js';
import * as offline from '../lib/electricianOffline.js';

const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event', 'CustomEvent']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const require = createRequire(import.meta.url);
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
let context;
const mocks = {
  '@/contexts/ElectricianOfflineContext': { useElectricianOffline: () => context },
  '@/lib/electricianOffline': offline,
  '@/components/ui/button': { Button: ({ size, variant, ...props }) => React.createElement('button', props) },
};
const code = ts.transpileModule(readFileSync(new URL('../components/municipality/ElectricianOfflineStatus.jsx', import.meta.url), 'utf8'), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);

test('Enviar agora tenta novamente todos os bloqueados da prefeitura sem duplicar registros ou perder fotos', async () => {
  await comLoja(LOJA_ELETRICISTA, 'readwrite', store => store.clear());
  const saved = [];
  for (const [index, municipalityId] of ['city', 'city', 'other-city'].entries()) {
    const job = await offline.queueElectricianJob({ userId: 'worker', municipalityId,
      rpc: 'registrar_visita_poste_eletricista_v2', args: { p_prefeitura: municipalityId, p_poste_id: index + 1 },
      resource: `pole:${index}`, label: `Visita ${index}`, files: [{ file: new File(['foto preservada'], 'poste.jpg', { type: 'image/jpeg' }) }],
    });
    const blocked = { ...job, state: 'blocked', error: index === 0 ? 'Executor só pode registrar o serviço atribuído.' : 'Altere a situação, o tipo ou a potência, ou registre um serviço' };
    await comLoja(LOJA_ELETRICISTA, 'readwrite', store => store.put(blocked)); saved.push(blocked);
  }
  let syncs = 0, syncCompleted = false;
  context = { jobs: saved, syncing: false, online: true, sync: async () => {
    syncs++;
    const jobs = await offline.listElectricianJobs('worker');
    assert.deepEqual(jobs.map(job => job.id), saved.map(job => job.id));
    assert.deepEqual(jobs.map(job => job.state), ['pending', 'pending', 'blocked']);
    assert.deepEqual(jobs.map(job => job.args), saved.map(job => job.args));
    for (const job of jobs) assert.equal(await job.photos[0].blob.text(), 'foto preservada');
    syncCompleted = true;
  } };
  const node = document.createElement('div'); document.body.appendChild(node);
  const root = createRoot(node);
  try {
    flushSync(() => root.render(React.createElement(module.exports.default, { userId: 'worker', municipalityId: 'city' })));
    assert.equal(node.querySelectorAll('li').length, 2);
    const button = [...node.querySelectorAll('button')].find(item => item.textContent === 'Enviar agora');
    flushSync(() => { button.click(); button.click(); });
    for (let attempt = 0; attempt < 100 && !syncCompleted; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(syncCompleted, true, 'O envio recebeu os dois registros e suas fotos intactos');
    assert.equal(syncs, 1);
    await new Promise(resolve => setTimeout(resolve, 20));
  } finally { flushSync(() => root.unmount()); node.remove(); }
});
