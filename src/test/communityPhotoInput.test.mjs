import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import { Window } from 'happy-dom';
import * as deviceCamera from '../lib/deviceCamera.js';

const require = createRequire(import.meta.url), win = new Window();
const previous = Object.fromEntries(['window', 'document', 'navigator', 'HTMLElement', 'Node', 'Event'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
for (const key of Object.keys(previous)) Object.defineProperty(globalThis, key, { configurable: true, value: win[key] });
const createUrl = URL.createObjectURL, revokeUrl = URL.revokeObjectURL;
URL.createObjectURL = () => 'blob:photo-preview'; URL.revokeObjectURL = () => {};
after(() => { URL.createObjectURL = createUrl; URL.revokeObjectURL = revokeUrl; for (const key of Object.keys(previous)) { if (previous[key]) Object.defineProperty(globalThis, key, previous[key]); else delete globalThis[key]; } win.happyDOM.abort(); });
const React = require('react'), { createRoot } = require('react-dom/client'), { flushSync } = require('react-dom');
let native, cam, selected, cameraCalls, galleryCalls, busy, removed;
const panel = ({ children }) => React.createElement('div', {}, children);
const mocks = {
  '@capacitor/core': { Capacitor: { isNativePlatform: () => native } },
  '@/components/ui/button': { Button: ({ variant, children, ...props }) => React.createElement('button', props, children) },
  '@/components/ui/dialog': { Dialog: ({ open, children }) => open ? React.createElement('div', { 'data-camera-open': true }, children) : null, DialogContent: panel, DialogTitle: panel, DialogDescription: panel },
  '@/hooks/useNativeCamera': { useNativeCamera: ({ maxPhotos }) => { assert.equal(maxPhotos, 2); return cam; } },
  '@/lib/deviceCamera': deviceCamera,
  '@/components/WebCameraCapture': { __esModule: true, default: ({ onClose }) => React.createElement('button', { onClick: onClose }, 'Fechar câmera de teste') },
};
const code = ts.transpileModule(readFileSync(new URL('../components/arborization/CommunityPhotoInput.jsx', import.meta.url), 'utf8'), { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => mocks[name] || require(name), module, module.exports);
const Photo = module.exports.default;
const settle = async () => { await new Promise(resolve => setTimeout(resolve, 15)); flushSync(() => {}); };
async function mount(run, isNative = false) {
  native = isNative; cameraCalls = 0; galleryCalls = 0; busy = []; removed = [];
  cam = { photoItems: [], canAdd: true, addingPhoto: false, fileInputRef: { current: null }, handleCamera() { cameraCalls++; }, handleGallery() { galleryCalls++; }, removePhoto(id) { removed.push(id); cam.photoItems = cam.photoItems.filter(item => item.id !== id); } };
  const initial = new File(['photo'], 'original.jpg', { type: 'image/jpeg' });
  function Probe() { const [file, setFile] = React.useState(initial); selected = file; return React.createElement(Photo, { file, onChange: setFile, optional: true, onBusyChange: value => busy.push(value) }); }
  const node = document.createElement('div'); document.body.appendChild(node); const root = createRoot(node);
  const render = () => flushSync(() => root.render(React.createElement(Probe)));
  const click = text => flushSync(() => [...node.querySelectorAll('button')].find(button => button.textContent.trim() === text).click());
  try { render(); await settle(); await run({ node, render, click, initial }); } finally { flushSync(() => root.unmount()); node.remove(); }
}

test('captura nativa mantém foto anterior ao cancelar, aceita caminho sem ler arquivo e permite trocar novamente', async () => {
  await mount(async ({ node, render, click, initial }) => {
    click('Tirar foto'); click('Galeria'); assert.equal(cameraCalls, 1); assert.equal(galleryCalls, 1); assert.equal(selected, initial);
    assert.equal(cam.fileInputRef.current, node.querySelector('input[type=file]'));
    const photo = { id: 'native-1', nativePath: '/private/photo.jpg', preview: 'capacitor://localhost/photo.jpg', name: 'photo.jpg' };
    cam.photoItems = [photo]; render(); await settle();
    assert.equal(selected, photo); assert.equal(node.querySelector('img').getAttribute('src'), photo.preview);
    assert.equal(node.querySelector('[data-camera-open]'), null);
    click('Tirar foto'); assert.equal(cameraCalls, 2); assert.equal(selected, photo);
    const next = { ...photo, id: 'native-2', nativePath: '/private/next.jpg', preview: 'capacitor://localhost/next.jpg' };
    cam.photoItems = [photo, next]; render(); await settle();
    assert.equal(selected, next); assert.deepEqual(removed, ['native-1']);
  }, true);
});

test('galeria recusa arquivo inválido sem substituir a foto e permite selecionar a mesma imagem novamente', async () => {
  await mount(async ({ node, initial }) => {
    const input = node.querySelector('input[type=file]');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['video'], 'video.mp4', { type: 'video/mp4' })] });
    flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true }))); await settle();
    assert.equal(selected, initial); assert.match(node.querySelector('[role=alert]').textContent, /JPG, PNG ou WebP/); assert.equal(input.value, '');
    const replacement = new File(['new'], 'nova.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { configurable: true, value: [replacement] });
    flushSync(() => input.dispatchEvent(new Event('change', { bubbles: true }))); await settle();
    assert.equal(selected, replacement); assert.equal(node.querySelector('[role=alert]'), null);
  });
});

test('câmera no navegador bloqueia avanço e cancelar preserva a foto selecionada', async () => {
  await mount(async ({ node, click, initial }) => {
    click('Tirar foto'); await settle();
    assert.ok(node.querySelector('[data-camera-open]')); assert.equal(busy.at(-1), true);
    click('Fechar câmera de teste'); await settle();
    assert.equal(node.querySelector('[data-camera-open]'), null); assert.equal(busy.at(-1), false); assert.equal(selected, initial);
  });
});

test('iPhone no navegador abre o input da câmera traseira no gesto, sem descartar foto existente', async () => {
  const original = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' });
  try {
    await mount(async ({ node, click, initial }) => {
      const cameraInput = node.querySelector('input[capture]'); let opened = 0;
      cameraInput.click = () => { opened++; };
      click('Tirar foto'); await settle();
      assert.equal(opened, 1); assert.equal(cameraInput.getAttribute('capture'), 'environment');
      assert.equal(node.querySelector('[data-camera-open]'), null); assert.equal(selected, initial);
    });
  } finally { if (original) Object.defineProperty(navigator, 'userAgent', original); else delete navigator.userAgent; }
});
