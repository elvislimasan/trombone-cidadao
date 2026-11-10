import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as updates from '../lib/iosAppUpdate.js';
import * as stores from '../config/storeLinks.js';

const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
const require = createRequire(import.meta.url), React = require('react');
const { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
let native, platform, version, status, offline, stored, requests, resume, removed;
const panel = ({ children, className }) => React.createElement('div', { className }, children);
const mocks = {
  '@capacitor/core': { Capacitor: { isNativePlatform: () => native, getPlatform: () => platform }, CapacitorHttp: { async get(options) {
    requests.push(options); if (offline) throw new Error('offline');
    return { status, data: { results: [{ trackId: Number(stores.APP_STORE_APP_ID), bundleId: 'com.trombonecidadao.app', version }] } };
  } } },
  '@capacitor/app': { App: { async getInfo() { return { id: 'com.trombonecidadao.app', version: '1.2' }; }, async addListener(event, handler) {
    assert.equal(event, 'appStateChange'); resume = handler; return { async remove() { removed++; } };
  } } },
  '@capacitor/preferences': { Preferences: { async get() { return { value: stored }; }, async set({ key, value }) { assert.equal(key, updates.IOS_UPDATE_DISMISS_KEY); stored = value; } } },
  '@/lib/iosAppUpdate': updates,
  '@/config/storeLinks': stores,
  '@/components/ui/button': { Button: ({ asChild, children, variant, ...props }) => asChild ? React.cloneElement(children, props) : React.createElement('button', props, children) },
  '@/components/ui/dialog': {
    Dialog: ({ open, children }) => open ? React.createElement('section', { role: 'dialog' }, children) : null,
    DialogContent: panel, DialogHeader: panel, DialogFooter: panel, DialogTitle: panel, DialogDescription: panel,
  },
};
const code = ts.transpileModule(readFileSync(new URL('../components/IosAppUpdateNotice.jsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const Notice = module.exports.default;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 15)); flushSync(() => {}); };
async function mount(options, run) {
  native = true; platform = 'ios'; version = '1.3'; status = 200; offline = false; stored = null; requests = []; resume = null; removed = 0;
  if (options.platform) platform = options.platform;
  if (options.native !== undefined) native = options.native;
  if (options.version) version = options.version;
  if (options.status) status = options.status;
  offline = Boolean(options.offline);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try { flushSync(() => root.render(React.createElement(Notice))); await settle(); await run(host); }
  finally { flushSync(() => root.unmount()); host.remove(); await settle(); }
}

test('iPhone consulta a App Store brasileira e abre o destino nativo correto', async () => {
  await mount({}, async host => {
    assert.match(host.textContent, /Atualização disponível/); assert.match(host.textContent, /1.3/);
    assert.deepEqual(requests[0].params, { id: stores.APP_STORE_APP_ID, country: 'br' });
    assert.equal(requests[0].url, 'https://itunes.apple.com/lookup');
    const link = host.querySelector('a'); assert.equal(link.getAttribute('href'), stores.APP_STORE_DEEPLINK);
    link.addEventListener('click', event => event.preventDefault());
    flushSync(() => link.click()); await settle();
    assert.equal(host.querySelector('[role=dialog]'), null);
    assert.equal(JSON.parse(stored).version, '1.3');
  });
  assert.equal(removed, 1);
});

test('agora não fecha o aviso e retorno ao app não repete a consulta imediatamente', async () => {
  await mount({}, async host => {
    const button = [...host.querySelectorAll('button')].find(item => item.textContent === 'Agora não');
    flushSync(() => button.click()); await settle();
    assert.equal(host.querySelector('[role=dialog]'), null);
    resume({ isActive: false }); resume({ isActive: true }); await settle();
    assert.equal(requests.length, 1); assert.equal(JSON.parse(stored).version, '1.3');
  });
});

test('Android e navegador não consultam nem exibem aviso de iOS', async () => {
  for (const options of [{ platform: 'android' }, { native: false, platform: 'ios' }]) await mount(options, async host => {
    assert.equal(host.textContent, ''); assert.equal(requests.length, 0); assert.equal(resume, null);
  });
});

test('versão atual, build adiantado, rede indisponível e erro da loja não abrem aviso', async () => {
  for (const options of [{ version: '1.2.0' }, { version: '1.1' }, { offline: true }, { status: 503 }]) await mount(options, async host => {
    assert.equal(host.querySelector('[role=dialog]'), null);
  });
});
