import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import { prefersDeviceCamera, openDeviceCamera } from '../lib/deviceCamera.js';

const source = fs.readFileSync(new URL('../components/ReportModal.jsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('ReportModal.jsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX);
// Executa os handlers reais com dependências locais, sem rede ou banco.
function handler(name, bindings) {
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) initializer = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(initializer, `Handler ${name} encontrado`);
  return new Function(...Object.keys(bindings), `return (${initializer});`)(...Object.values(bindings));
}

test('celulares e iPadOS usam câmera do sistema; desktop usa webcam', () => {
  for (const userAgent of ['Mozilla/5.0 (Linux; Android 14)', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18)', 'Mozilla/5.0 (iPad; CPU OS 18)']) {
    assert.equal(prefersDeviceCamera({ userAgent }), true);
  }
  assert.equal(prefersDeviceCamera({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 5 }), true);
  assert.equal(prefersDeviceCamera({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', maxTouchPoints: 0 }), false);
  assert.equal(prefersDeviceCamera({ userAgent: 'Mozilla/5.0 (Windows NT 10.0)', maxTouchPoints: 10 }), false);
  assert.equal(prefersDeviceCamera({}), false);
});

function photoRequest(mobile) {
  const calls = [];
  const input = { isConnected: true, value: 'foto anterior', click() { calls.push('camera'); assert.equal(this.value, ''); } };
  const bindings = {
    isTakingPhoto: false, isRecordingVideo: false, isPhotoProcessing: false,
    isProcessingRef: { current: false },
    Capacitor: { isNativePlatform: () => false },
    prefersDeviceCamera: () => mobile, openDeviceCamera,
    photoCameraInputRef: { current: input }, municipalMode: false,
    formData: { title: 'Buraco na rua' }, wizardStep: 2,
    saveReportDraft: () => { calls.push('draft'); return true; },
    saveReportDraftMedia: async () => { calls.push('media'); return true; },
    setCameraMode: mode => calls.push(mode), setShowCamera: value => calls.push(['webcam', value]),
    setIsTakingPhoto: value => calls.push(['busy', value]), showAppError: () => calls.push('error'),
  };
  return { calls, bindings, request: () => handler('handleTakePhoto', bindings)() };
}

test('Tirar Foto salva campos e abre câmera padrão no mesmo gesto, sem bloquear modal', async () => {
  const view = photoRequest(true);
  const first = view.request();
  assert.deepEqual(view.calls, ['draft', 'media', 'camera']);
  await first;
  // Após cancelar, nada ficou em estado busy e uma nova tentativa funciona.
  await view.request();
  assert.deepEqual(view.calls, ['draft', 'media', 'camera', 'draft', 'media', 'camera']);
});

test('desktop ainda abre câmera web e processamento em andamento impede nova captura', async () => {
  const view = photoRequest(false);
  await view.request();
  assert.deepEqual(view.calls, ['photo', ['webcam', true], ['busy', true]]);
  const busy = photoRequest(true);
  busy.bindings.isPhotoProcessing = true;
  await busy.request();
  assert.deepEqual(busy.calls, ['error']);
  assert.equal(openDeviceCamera({ isConnected: false }), false);
});

function fileReturn() {
  let state = { title: 'Buraco', location: { lat: -8.6, lng: -38.5 }, photos: [], videos: [] };
  const busy = [], notices = [];
  const bindings = {
    Capacitor: { isNativePlatform: () => false },
    isMountedRef: { current: true }, errors: {},
    showAppError: error => notices.push(error),
    setErrors: () => {}, setIsPhotoProcessing: value => busy.push(value),
    setPhotoProcessingProgress: () => {}, setPhotoProcessingMessage: () => {},
    setFormData: update => { state = update(state); },
    compressToJpeg: async file => {
      assert.equal(bindings.input.value, '', 'input liberado antes da compressão');
      return new File(['small photo'], file.name, { type: 'image/jpeg' });
    },
    FileReader: class { constructor() { throw new Error('Base64 não deve ser usado no retorno web'); } },
    console: { error() {} },
  };
  return { bindings, busy, notices, state: () => state, change: event => handler('handleFileChange', bindings)(event, 'photos') };
}

test('foto grande retorna ao modal sem Base64, preservando campos e liberando processamento', async () => {
  const view = fileReturn();
  const file = new File(['camera photo'], 'camera.jpg', { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: 12 * 1024 * 1024 });
  view.bindings.input = { value: 'camera.jpg', files: [file] };
  await view.change({ target: view.bindings.input });
  const state = view.state();
  assert.equal(state.title, 'Buraco');
  assert.deepEqual(state.location, { lat: -8.6, lng: -38.5 });
  assert.equal(state.photos.length, 1);
  assert.equal(state.photos[0].file.type, 'image/jpeg');
  assert.ok(state.photos[0].preview.startsWith('blob:'));
  assert.deepEqual(view.busy, [true, false]);
  assert.deepEqual(view.notices, []);
  URL.revokeObjectURL(state.photos[0].preview);
});

function compressionFixture(failDecode = false) {
  const source = fs.readFileSync(new URL('../hooks/useNativeCamera.js', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('useNativeCamera.js', source, ts.ScriptTarget.Latest, true);
  let initializer;
  const visit = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'compressToJpeg') initializer = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast);
  const revoked = [], drawn = [], images = [];
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage: (...args) => drawn.push(args.slice(1)) }),
    toBlob: callback => callback(new Blob(['compressed jpeg'], { type: 'image/jpeg' })),
  };
  const bindings = {
    Image: class {
      naturalWidth = 6000; naturalHeight = 4000;
      constructor() { images.push(this); }
      async decode() { if (failDecode) throw new Error('Formato não suportado'); }
    },
    document: { createElement: () => canvas },
    URL: { createObjectURL: () => 'blob:camera-original', revokeObjectURL: value => revoked.push(value) },
    File, console: { warn() {} },
  };
  const compress = new Function(...Object.keys(bindings), `return (${initializer});`)(...Object.values(bindings));
  return { compress, canvas, revoked, drawn, images };
}

test('compressão web libera imagem, canvas e URL temporária depois da foto grande', async () => {
  const view = compressionFixture();
  const original = new File(['photo'], 'camera.jpg', { type: 'image/jpeg' });
  const result = await view.compress(original);
  assert.equal(result.type, 'image/jpeg');
  assert.equal(result.name, 'camera.jpg');
  assert.notEqual(result, original);
  assert.deepEqual(view.drawn, [[0, 0, 1280, 853]]);
  assert.equal(view.canvas.width, 0);
  assert.equal(view.canvas.height, 0);
  assert.equal(view.images[0].src, '');
  assert.deepEqual(view.revoked, ['blob:camera-original']);
});

test('falha na decodificação mantém arquivo original e também libera recursos', async () => {
  const view = compressionFixture(true);
  const original = new File(['photo'], 'camera.jpg', { type: 'image/jpeg' });
  assert.equal(await view.compress(original), original);
  assert.equal(view.images[0].src, '');
  assert.deepEqual(view.revoked, ['blob:camera-original']);
});

test('cancelar ou falhar no processamento mantém o modal com os campos preenchidos', async () => {
  const view = fileReturn();
  view.bindings.input = { value: '', files: [] };
  await view.change({ target: view.bindings.input });
  assert.equal(view.state().photos.length, 0);
  assert.deepEqual(view.busy, []);
  const file = new File(['photo'], 'camera.jpg', { type: 'image/jpeg' });
  Object.defineProperty(file, 'size', { value: 12 * 1024 * 1024 });
  view.bindings.input = { value: 'camera.jpg', files: [file] };
  view.bindings.compressToJpeg = async () => { throw new Error('Erro de leitura'); };
  await view.change({ target: view.bindings.input });
  assert.equal(view.state().title, 'Buraco');
  assert.deepEqual(view.busy, [true, false]);
  assert.equal(view.notices.length, 1);
});
