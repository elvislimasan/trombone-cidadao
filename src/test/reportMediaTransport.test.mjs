import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import * as photoUtils from '../lib/reportPhoto.js';

const code = ts.transpileModule(fs.readFileSync(new URL('../lib/reportMediaTransport.js', import.meta.url), 'utf8'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
function fixture({ earlyStatus = 'completed', httpStatus = 200 } = {}) {
  let receive;
  const calls = [], removed = [], cancelled = [], xhrs = [];
  const plugin = {
    addListener: async (name, callback) => { receive = callback; return { remove: async () => removed.push(name) }; },
    uploadVideoInBackground: async options => { calls.push(options); if (earlyStatus) receive({ id: 'native-1', status: earlyStatus, progress: 100 }); return { uploadId: 'native-1' }; },
    cancelUpload: async ({ uploadId }) => cancelled.push(uploadId),
    compressImage: async () => ({ outputPath: '/cache/converted.jpg' }),
  };
  class XHR {
    upload = {};
    headers = {};
    constructor() { xhrs.push(this); }
    open(method, url) { this.method = method; this.url = url; }
    setRequestHeader(key, value) { this.headers[key] = value; }
    send(file) { this.file = file; this.status = httpStatus; queueMicrotask(() => this.onload()); }
    abort() { this.aborted = true; }
  }
  const mocks = {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true } },
    '@/plugins/VideoProcessor': { VideoProcessor: plugin },
    '@/lib/customSupabaseClient': { supabase: { functions: { invoke: async () => ({ data: { completed: true } }) } } },
    '@/hooks/useNativeCamera': { compressToJpeg: async file => file, toWebUrl: path => path },
    './reportPhoto': photoUtils,
  };
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func -- Executa o módulo real com plugin e XMLHttpRequest controlados.
  new Function('require', 'module', 'exports', 'XMLHttpRequest', code)(name => mocks[name], module, module.exports, XHR);
  return { api: module.exports, plugin, calls, removed, cancelled, xhrs, receive: event => receive(event) };
}

test('upload nativo captura conclusão anterior ao retorno do plugin e remove listener', async () => {
  const view = fixture();
  await view.api.uploadNativeReportFile({ nativePath: '/cache/photo.jpg' }, 'https://signed', 'image/jpeg', new AbortController().signal, () => {});
  assert.equal(view.calls[0].headers['Content-Type'], 'image/jpeg');
  assert.equal(view.calls[0].skipCompression, true);
  assert.equal(view.removed.length, 1);
});

test('erro nativo é propagado para a fila, sem confirmar a imagem', async () => {
  const view = fixture({ earlyStatus: 'error_upload_failed_403' });
  await assert.rejects(view.api.uploadNativeReportFile({ nativePath: '/cache/photo.jpg' }, 'https://signed', 'image/jpeg', new AbortController().signal, () => {}), /Reenvie/);
  assert.equal(view.removed.length, 1);
});

test('interromper um upload nativo cancela apenas sua task e libera listener', async () => {
  const view = fixture({ earlyStatus: null });
  const controller = new AbortController();
  const upload = view.api.uploadNativeReportFile({ nativePath: '/cache/photo.jpg' }, 'https://signed', 'image/jpeg', controller.signal, () => {});
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  await assert.rejects(upload, /cancelado/);
  assert.deepEqual(view.cancelled, ['native-1']);
  assert.equal(view.removed.length, 1);
});

test('Safari envia o Blob por PUT e erro HTTP fica disponível para reenvio', async () => {
  for (const httpStatus of [200, 403]) {
    const view = fixture({ httpStatus });
    const file = new Blob(['jpeg'], { type: 'image/jpeg' });
    const upload = view.api.uploadSignedReportFile(file, 'https://signed', 'image/jpeg', new AbortController().signal, () => {});
    if (httpStatus === 200) await upload; else await assert.rejects(upload, /HTTP 403/);
    assert.equal(view.xhrs[0].method, 'PUT');
    assert.equal(view.xhrs[0].file, file);
    assert.equal(view.xhrs[0].headers['Content-Type'], 'image/jpeg');
  }
});

test('foto HEIC nativa recebe JPEG real e falha na conversão não envia bytes HEIC como JPEG', async () => {
  const view = fixture();
  const source = { nativePath: '/cache/IMG.heic', name: 'IMG.heic', type: 'photo' };
  const prepared = await view.api.prepareReportMediaSource(source, new AbortController().signal);
  assert.equal(prepared.contentType, 'image/jpeg');
  assert.equal(prepared.name, 'IMG.jpg');
  view.plugin.compressImage = async () => { throw new Error('decode failed'); };
  await assert.rejects(view.api.prepareReportMediaSource(source, new AbortController().signal), /HEIC/);
});
