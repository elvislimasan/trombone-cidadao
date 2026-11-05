import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';

const require = createRequire(import.meta.url);
const win = new Window();
for (const name of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event']) {
  Object.defineProperty(globalThis, name, { configurable: true, value: win[name] });
}
const React = require('react');
const { createRoot } = require('react-dom/client');
const { flushSync } = require('react-dom');
const { act } = React;
const jobs = new Map();
const mocks = {
  getCachedVideoThumbnail: () => null,
  getVideoThumbnail: url => new Promise((resolve, reject) => jobs.set(url, { resolve, reject })),
};
const code = ts.transpileModule(readFileSync(new URL('../hooks/useVideoThumbnail.js', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const hookModule = { exports: {} };
new Function('require', 'module', 'exports', code)(name => name === '@/lib/videoThumbnail' ? mocks : require(name), hookModule, hookModule.exports);
const { useVideoThumbnail } = hookModule.exports;
const settle = async () => { await act(async () => { await Promise.resolve(); }); };

async function renderHook(task) {
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const node = document.createElement('div');
  document.body.appendChild(node);
  const root = createRoot(node);
  let value;
  function Probe({ url, attempt }) { value = useVideoThumbnail(url, { attempt }); return null; }
  const render = (url, attempt = 0) => act(() => flushSync(() => root.render(React.createElement(Probe, { url, attempt }))));
  try { await task({ render, value: () => value }); } finally { act(() => root.unmount()); node.remove(); jobs.clear(); globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct; }
}

test('troca de URL esconde o preview anterior e ignora uma extração atrasada', async () => {
  await renderHook(async ({ render, value }) => {
    render('first.mp4');
    jobs.get('first.mp4').resolve('data:image/jpeg;first');
    await settle();
    assert.equal(value().thumbnailUrl, 'data:image/jpeg;first');
    render('slow.mp4');
    assert.equal(value().thumbnailUrl, null);
    render('current.mp4');
    jobs.get('current.mp4').resolve('data:image/jpeg;current');
    await settle();
    jobs.get('slow.mp4').resolve('data:image/jpeg;wrong');
    await settle();
    assert.equal(value().thumbnailUrl, 'data:image/jpeg;current');
  });
});

test('nova tentativa não herda a falha da tentativa anterior', async () => {
  await renderHook(async ({ render, value }) => {
    render('retry.mp4');
    jobs.get('retry.mp4').reject(new Error('temporary'));
    await settle();
    assert.equal(value().failed, true);
    render('retry.mp4', 1);
    assert.equal(value().failed, false);
    jobs.get('retry.mp4').resolve('data:image/jpeg;recovered');
    await settle();
    assert.equal(value().thumbnailUrl, 'data:image/jpeg;recovered');
  });
});
