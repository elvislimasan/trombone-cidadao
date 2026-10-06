import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as controls from '../lib/webCameraControls.js';

const require = createRequire(import.meta.url);
const React = require('react');
const window = new Window();
const globals = ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT'];
const previous = Object.fromEntries(globals.map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: window.navigator });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
after(() => {
  for (const key of globals) {
    if (previous[key]) Object.defineProperty(globalThis, key, previous[key]);
    else delete globalThis[key];
  }
  window.happyDOM.abort();
});
const { createRoot } = require('react-dom/client');
const { act } = React;
const code = ts.transpileModule(fs.readFileSync(new URL('../components/WebCameraCapture.jsx', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS, esModuleInterop: true },
}).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => {
  if (name === '@/lib/webCameraControls') return controls;
  if (name === '@/components/ui/button') return { Button: props => React.createElement('button', props) };
  return require(name);
}, module, module.exports);
const Camera = module.exports.default;
window.HTMLVideoElement.prototype.play = async function () {};
const videoStreams = new WeakMap();
Object.defineProperty(window.HTMLVideoElement.prototype, 'srcObject', {
  get() { return videoStreams.get(this); }, set(value) { videoStreams.set(this, value); },
});
Object.defineProperty(window.HTMLVideoElement.prototype, 'videoWidth', { get: () => 1280 });
Object.defineProperty(window.HTMLVideoElement.prototype, 'videoHeight', { get: () => 720 });
let draws, canvases;
window.HTMLCanvasElement.prototype.getContext = () => ({ drawImage: (...args) => draws.push(args.slice(1)) });
window.HTMLCanvasElement.prototype.toBlob = function (callback) { canvases.push(this); callback(new Blob(['photo'], { type: 'image/jpeg' })); };

async function mount({ hardware = false, torch = false, ignore = false, delayed = false, allowDeviceCamera = true } = {}) {
  draws = [];
  canvases = [];
  const captures = [], constraints = [], streams = [], pending = [];
  const mediaDevices = {
    getSupportedConstraints: () => ({ zoom: true }),
    getUserMedia: async options => {
      constraints.push(options);
      const settings = hardware ? { zoom: 1, torch: false } : {};
      const track = {
        readyState: 'live',
        getCapabilities: () => ({ ...(hardware ? { zoom: { min: 1, max: 8, step: 0.25 } } : {}), torch }),
        getSettings: () => ({ ...settings }),
        applyConstraints: async ({ advanced: [next] }) => {
          if (delayed) await new Promise(resolve => pending.push(resolve));
          if (!ignore) Object.assign(settings, next);
        },
        stop() { this.readyState = 'ended'; },
      };
      const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
      streams.push(stream);
      return stream;
    },
  };
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: mediaDevices });
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Camera, { allowDeviceCamera, onCapture: result => captures.push(result), onClose() {} })));
  const button = text => [...container.querySelectorAll('button')].find(el => el.textContent.includes(text));
  return { container, captures, constraints, streams, pending, button, dispose: () => { act(() => root.unmount()); container.remove(); } };
}

function pointer(view, type, pointerId, clientX) {
  const preview = view.container.querySelector('video').parentElement.parentElement;
  act(() => preview.dispatchEvent(new window.PointerEvent(type, { bubbles: true, pointerId, clientX, clientY: 100 })));
}

test('pinça e botões aproximam prévia e foto com o mesmo recorte digital', async () => {
  const view = await mount();
  try {
    pointer(view, 'pointerdown', 1, 100);
    pointer(view, 'pointerdown', 2, 200);
    pointer(view, 'pointermove', 2, 300);
    assert.equal(view.container.querySelector('input[type=range]').value, '2');
    assert.equal(view.container.querySelector('video').style.transform, 'scale(2)');
    pointer(view, 'pointerup', 2, 300);
    act(() => view.container.querySelector('[aria-label="Aumentar zoom"]').click());
    assert.equal(view.container.querySelector('input[type=range]').value, '2.5');
    act(() => view.container.querySelector('[aria-label="Diminuir zoom"]').click());
    assert.equal(view.container.querySelector('input[type=range]').value, '2');
    assert.equal(view.constraints[0].video.zoom, true);
    await act(async () => view.button('Capturar').click());
    assert.deepEqual(draws.at(-1), [320, 180, 640, 360, 0, 0, 1280, 720]);
    assert.equal(view.captures[0].type, 'photo');
    assert.equal(view.streams[0].getVideoTracks()[0].readyState, 'ended');
    assert.equal(canvases[0].width, 0);
    assert.equal(canvases[0].height, 0);
  } finally { view.dispose(); }
  assert.equal(view.streams[0].getVideoTracks()[0].readyState, 'ended');
});

test('flash do hardware preserva zoom e a captura não aplica um segundo zoom', async () => {
  const view = await mount({ hardware: true, torch: [false, true] });
  try {
    await act(async () => view.container.querySelector('[aria-label="Aumentar zoom"]').click());
    await act(async () => view.button('Flash desligado').click());
    assert.deepEqual(view.streams[0].getVideoTracks()[0].getSettings(), { zoom: 1.5, torch: true });
    assert.equal(view.button('Flash ligado').getAttribute('aria-pressed'), 'true');
    await act(async () => view.container.querySelector('[aria-label="Aumentar zoom"]').click());
    assert.deepEqual(view.streams[0].getVideoTracks()[0].getSettings(), { zoom: 2, torch: true });
    await act(async () => view.button('Flash ligado').click());
    assert.equal(view.streams[0].getVideoTracks()[0].getSettings().torch, false);
    await act(async () => view.button('Capturar').click());
    assert.deepEqual(draws.at(-1), [0, 0, 1280, 720, 0, 0, 1280, 720]);
  } finally { view.dispose(); }
});

test('zoom ignorado pelo aparelho retorna ao zoom digital funcional', async () => {
  const view = await mount({ hardware: true, ignore: true });
  try {
    await act(async () => view.container.querySelector('[aria-label="Aumentar zoom"]').click());
    assert.match(view.container.textContent, /zoom do aparelho não respondeu/);
    assert.equal(view.container.querySelector('input[type=range]').max, '4');
    act(() => view.container.querySelector('[aria-label="Aumentar zoom"]').click());
    assert.equal(view.container.querySelector('video').style.transform, 'scale(1.5)');
  } finally { view.dispose(); }
});

test('flash ignorado não aparece ligado e oferece captura pelo aparelho', async () => {
  const view = await mount({ hardware: true, torch: true, ignore: true });
  try {
    await act(async () => view.button('Flash desligado').click());
    const fallback = view.button('Flash: usar câmera do aparelho');
    assert.ok(fallback);
    assert.equal(fallback.disabled, false);
    assert.notEqual(fallback.getAttribute('aria-pressed'), 'true');
  } finally { view.dispose(); }
});

test('flash sem suporte abre input do aparelho e cancelar retoma a câmera web', async () => {
  const view = await mount();
  try {
    const input = view.container.querySelector('input[type=file]');
    let opened = 0;
    input.click = () => { opened += 1; assert.equal(view.streams[0].getVideoTracks()[0].readyState, 'ended'); };
    act(() => view.button('Flash: usar câmera do aparelho').click());
    assert.equal(opened, 1);
    assert.equal(input.getAttribute('capture'), 'environment');
    assert.equal(input.isConnected, true);
    assert.match(view.container.textContent, /Voltar à câmera do navegador/);
    await act(async () => input.dispatchEvent(new window.Event('cancel', { bubbles: false })));
    assert.equal(view.streams.length, 2);
    assert.equal(view.button('Capturar').disabled, false);
  } finally { view.dispose(); }
});

test('ajustes rápidos ficam em ordem e captura espera toda a fila', async () => {
  const view = await mount({ hardware: true, delayed: true });
  try {
    pointer(view, 'pointerdown', 1, 100);
    pointer(view, 'pointerdown', 2, 200);
    await act(async () => pointer(view, 'pointermove', 2, 300));
    await act(async () => pointer(view, 'pointermove', 2, 400));
    assert.equal(view.button('Capturar').disabled, true);
    await act(async () => view.pending.shift()());
    assert.equal(view.streams[0].getVideoTracks()[0].getSettings().zoom, 2);
    assert.equal(view.button('Capturar').disabled, true);
    await act(async () => view.pending.shift()());
    assert.equal(view.streams[0].getVideoTracks()[0].getSettings().zoom, 3);
    assert.equal(view.button('Capturar').disabled, false);
  } finally { view.dispose(); }
});

test('captura de frame de 50 MP limita saída e preserva recorte e orientação', async () => {
  const view = await mount({ allowDeviceCamera: false });
  try {
    const video = view.container.querySelector('video');
    Object.defineProperty(video, 'videoWidth', { value: 8160 });
    Object.defineProperty(video, 'videoHeight', { value: 6120 });
    act(() => view.container.querySelector('[aria-label="Aumentar zoom"]').click());
    await act(async () => view.button('Capturar').click());
    assert.deepEqual(draws.at(-1), [1360, 1020, 5440, 4080, 0, 0, 1280, 960]);
    assert.equal(view.captures.length, 1);
    assert.equal(canvases[0].width, 0);
    assert.equal(canvases[0].height, 0);
  } finally { view.dispose(); }

  const portrait = await mount({ allowDeviceCamera: false });
  try {
    const video = portrait.container.querySelector('video');
    Object.defineProperty(video, 'videoWidth', { value: 6120 });
    Object.defineProperty(video, 'videoHeight', { value: 8160 });
    await act(async () => portrait.button('Capturar').click());
    assert.deepEqual(draws.at(-1), [0, 0, 6120, 8160, 0, 0, 960, 1280]);
  } finally { portrait.dispose(); }
});

test('fluxo Android não oferece saída para câmera externa quando flash falta ou falha', async () => {
  for (const options of [{}, { torch: true, ignore: true }]) {
    const view = await mount({ ...options, allowDeviceCamera: false });
    try {
      if (options.torch) await act(async () => view.button('Flash desligado').click());
      assert.equal(view.container.querySelector('input[type=file]'), null);
      assert.equal(view.button('Usar câmera do aparelho'), undefined);
      assert.equal(view.button('Flash indisponível').disabled, true);
      assert.equal(view.button('Capturar').disabled, false);
    } finally { view.dispose(); }
  }
});

test('cliques repetidos geram uma foto e fechar durante codificação descarta resultado', async () => {
  const originalToBlob = window.HTMLCanvasElement.prototype.toBlob;
  let finish, pendingCanvas;
  window.HTMLCanvasElement.prototype.toBlob = function (callback) { finish = callback; pendingCanvas = this; };
  const view = await mount();
  try {
    act(() => { view.button('Capturar').click(); view.button('Capturar').click(); });
    assert.equal(draws.length, 1);
    assert.equal(view.button('Capturar').disabled, true);
    await act(async () => finish(new Blob(['photo'], { type: 'image/jpeg' })));
    assert.equal(view.captures.length, 1);
    assert.equal(pendingCanvas.width, 0);
  } finally { view.dispose(); }
  const closing = await mount();
  try {
    act(() => closing.button('Capturar').click());
    closing.dispose();
    await act(async () => finish(new Blob(['photo'], { type: 'image/jpeg' })));
    assert.equal(closing.captures.length, 0);
    assert.equal(pendingCanvas.width, 0);
    assert.equal(pendingCanvas.height, 0);
  } finally { window.HTMLCanvasElement.prototype.toBlob = originalToBlob; }
});

test('falha de codificação libera memória e permite tentar de novo sem fechar câmera', async () => {
  const originalToBlob = window.HTMLCanvasElement.prototype.toBlob;
  let failedCanvas;
  window.HTMLCanvasElement.prototype.toBlob = function (callback) { failedCanvas = this; callback(null); };
  const view = await mount({ allowDeviceCamera: false });
  try {
    await act(async () => view.button('Capturar').click());
    assert.equal(view.captures.length, 0);
    assert.equal(view.container.querySelector('[role=alert]').textContent, 'Não foi possível tirar a foto. Tente novamente.');
    assert.equal(failedCanvas.width, 0);
    assert.equal(failedCanvas.height, 0);
    assert.equal(view.button('Capturar').disabled, false);
    assert.equal(view.streams[0].getVideoTracks()[0].readyState, 'live');
    window.HTMLCanvasElement.prototype.toBlob = originalToBlob;
    await act(async () => view.button('Capturar').click());
    assert.equal(view.captures.length, 1);
  } finally {
    window.HTMLCanvasElement.prototype.toBlob = originalToBlob;
    view.dispose();
  }
});
