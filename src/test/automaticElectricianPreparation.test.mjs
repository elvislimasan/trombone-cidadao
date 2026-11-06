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
const settle = () => new Promise(resolve => setTimeout(resolve, 20));

function load(path, mocks) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
  }).outputText;
  const module = { exports: {} };
  new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
  return module.exports;
}

function setup(prepare = async () => {}) {
  const calls = [];
  const sync = async () => { calls.push('sync'); };
  const screens = ['@/pages/ElectricianOrderPage', '@/components/municipality/ElectricianLightingMap', '@/pages/ElectricianPatrolPage'];
  const { useAutomaticElectricianPreparation } = load('src/hooks/useAutomaticElectricianPreparation.js', {
    '@/lib/customSupabaseClient': { supabase: {} },
    '@/contexts/ElectricianOfflineContext': { useElectricianOffline: () => ({ sync }) },
    '@/lib/electricianOffline': { prepareElectricianOrders: async (...args) => { calls.push(args); await prepare(...args); } },
    ...Object.fromEntries(screens.map(name => [name, {}])),
  });
  const node = document.createElement('div');
  document.body.appendChild(node);
  const root = createRoot(node);
  function Harness(props) { useAutomaticElectricianPreparation(props); return null; }
  const props = { userId: 'worker', municipalityId: 'city', cityId: 64, enabled: true };
  return {
    calls, node,
    render(overrides) { flushSync(() => root.render(React.createElement(Harness, { ...props, ...overrides }))); },
    close() { flushSync(() => root.unmount()); node.remove(); },
  };
}

function connection(online) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value: online });
  window.dispatchEvent(new win.Event(online ? 'online' : 'offline'));
}

test('prepares silently on entry, syncs before downloading and refreshes on reconnection', async () => {
  connection(true);
  const app = setup();
  try {
    app.render();
    await settle();
    assert.equal(app.calls[0], 'sync');
    assert.deepEqual(app.calls[1].slice(1, 5), ['worker', 'city', undefined, 64]);
    assert.equal(app.node.textContent, '');
    window.dispatchEvent(new win.Event('focus'));
    document.dispatchEvent(new win.Event('visibilitychange'));
    await settle();
    assert.equal(app.calls.length, 2, 'recent successful preparation is reused on focus');
    connection(false);
    connection(true);
    await settle();
    assert.equal(app.calls.length, 4);
  } finally { app.close(); }
});

test('waits for internet and a complete electrician identity', async () => {
  connection(false);
  const app = setup();
  try {
    app.render();
    await settle();
    assert.equal(app.calls.length, 0);
    connection(true);
    await settle();
    assert.equal(app.calls.length, 2);
    for (const overrides of [{ enabled: false }, { userId: null }, { municipalityId: null }]) {
      app.render(overrides);
      connection(true);
      await settle();
    }
    assert.equal(app.calls.length, 2);
  } finally { app.close(); }
});

test('does not overlap preparations and cancels the previous account scope', async () => {
  connection(true);
  let release;
  const app = setup(() => new Promise(resolve => { release = resolve; }));
  try {
    app.render();
    await settle();
    const signal = app.calls[1][5];
    connection(true);
    window.dispatchEvent(new win.Event('focus'));
    await settle();
    assert.equal(app.calls.length, 2);
    app.render({ enabled: false });
    assert.equal(signal.aborted, true);
    release();
    await settle();
    app.render({ userId: 'other-worker', municipalityId: 'other-city' });
    await settle();
    assert.deepEqual(app.calls[3].slice(1, 3), ['other-worker', 'other-city']);
    release();
    await settle();
  } finally { app.close(); }
});

test('a failed preparation stays silent and retries when the app returns to focus', async () => {
  connection(true);
  const app = setup(async () => { throw new Error('Failed to fetch'); });
  try {
    app.render();
    await settle();
    assert.equal(app.node.textContent, '');
    window.dispatchEvent(new win.Event('focus'));
    await settle();
    assert.equal(app.calls.length, 4);
  } finally { app.close(); }
});

test('offline status hides preparation messages and retains pending work controls', () => {
  const state = { jobs: [], syncing: false, online: true, sync: async () => {} };
  const { default: Status } = load('src/components/municipality/ElectricianOfflineStatus.jsx', {
    '@/components/ui/button': { Button: props => React.createElement('button', props) },
    '@/contexts/ElectricianOfflineContext': { useElectricianOffline: () => state },
    '@/lib/electricianOffline': { retryElectricianJob: async () => {} },
  });
  const node = document.createElement('div');
  const root = createRoot(node);
  const render = () => flushSync(() => root.render(React.createElement(Status, { userId: 'worker', municipalityId: 'city' })));
  try {
    render();
    assert.equal(node.innerHTML, '');
    state.online = false;
    render();
    assert.equal(node.innerHTML, '');
    state.jobs = [{ id: 'one', municipalityId: 'city', state: 'blocked', error: 'A ordem mudou', photos: [] }];
    render();
    assert.match(node.textContent, /A ordem mudou/);
    assert.match(node.textContent, /Baixar cópia com fotos/);
    assert.doesNotMatch(node.textContent, /Preparar ordens|preparar aparelho|ordem\(ns\) disponível/);
    state.jobs = [{ ...state.jobs[0], municipalityId: 'other-city' }];
    render();
    assert.equal(node.innerHTML, '');
  } finally { flushSync(() => root.unmount()); }
});
