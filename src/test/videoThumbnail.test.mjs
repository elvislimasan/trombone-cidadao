import test from 'node:test';
import assert from 'node:assert/strict';
import { captureVideoThumbnail, getVideoThumbnail } from '../lib/videoThumbnail.js';

function mediaDocument(mode = 'ready') {
  const videos = [], canvases = [], hosts = [];
  class Video {
    listeners = new Map();
    addEventListener(name, listener) { if (!this.listeners.has(name)) this.listeners.set(name, new Set()); this.listeners.get(name).add(listener); }
    removeEventListener(name, listener) { this.listeners.get(name)?.delete(listener); }
    dispatchEvent(event) { for (const listener of this.listeners.get(event.type) || []) listener(event); }
    readyState = 0;
    videoWidth = 1920;
    videoHeight = 1080;
    duration = 2;
    seeking = false;
    time = 0;
    src = '';
    attributes = new Map();
    setAttribute(key, value) { this.attributes.set(key, value); }
    removeAttribute(key) { if (key === 'src') this.src = ''; }
    pause() {}
    load() {
      if (!this.src || mode === 'timeout') return;
      if (this.src.includes('broken')) { this.dispatchEvent(new Event('error')); return; }
      this.readyState = 4;
      // Reproduz mídia em cache: loadeddata pode chegar antes de o consumidor
      // registrar o próximo listener, sem disparar outra vez.
      this.dispatchEvent(new Event('loadedmetadata'));
      this.dispatchEvent(new Event('loadeddata'));
    }
    set currentTime(value) {
      this.time = value;
      if (mode !== 'no-seek-event') this.dispatchEvent(new Event('seeked'));
    }
    get currentTime() { return this.time; }
  }
  const document = {
    body: { appendChild(host) { hosts.push(host); } },
    createElement(tag) {
      if (tag === 'video') { const video = new Video(); videos.push(video); return video; }
      if (tag === 'canvas') {
        const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => {
          if (mode === 'cors') throw new Error('SecurityError');
          return 'data:image/jpeg;base64,preview';
        } };
        canvases.push(canvas); return canvas;
      }
      return { style: {}, setAttribute() {}, appendChild() {}, remove() { this.removed = true; } };
    },
  };
  return { document, videos, canvases, hosts };
}

async function withMedia(mode, task) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const media = mediaDocument(mode);
  Object.defineProperty(globalThis, 'document', { configurable: true, value: media.document });
  try { await task(media); } finally {
    if (original) Object.defineProperty(globalThis, 'document', original);
    else delete globalThis.document;
  }
}

test('extrai quadro de vídeo em cache sem perder eventos e reduz uma imagem Full HD', async () => {
  await withMedia('ready', async ({ videos, canvases, hosts }) => {
    assert.match(await captureVideoThumbnail('/cached.mp4', { timeoutMs: 50 }), /^data:image\/jpeg/);
    assert.equal(canvases[0].width, 640);
    assert.equal(canvases[0].height, 360);
    assert.equal(videos[0].src, '');
    assert.ok(hosts[0].removed);
  });
});

test('usa o quadro já decodificado quando seeked não é disparado novamente', async () => {
  await withMedia('no-seek-event', async () => {
    assert.match(await captureVideoThumbnail('/decoded.mp4', { timeoutMs: 50 }), /^data:image\/jpeg/);
  });
});

test('limita a espera e libera o elemento de mídia quando o vídeo não carrega', async () => {
  await withMedia('timeout', async ({ hosts, videos }) => {
    await assert.rejects(captureVideoThumbnail('/slow.mp4', { timeoutMs: 10 }), /thumbnail:timeout/);
    assert.ok(hosts[0].removed);
    assert.equal(videos[0].src, '');
  });
});

test('recusa exportação sem permissão de canvas e libera os recursos', async () => {
  await withMedia('cors', async ({ hosts }) => {
    await assert.rejects(captureVideoThumbnail('/remote.mp4'), /SecurityError/);
    assert.ok(hosts[0].removed);
  });
});

test('compartilha uma extração concorrente e reutiliza a miniatura pronta', async () => {
  await withMedia('ready', async ({ videos }) => {
    const first = getVideoThumbnail('/shared.mp4');
    const second = getVideoThumbnail('/shared.mp4');
    assert.equal(first, second);
    assert.deepEqual(await Promise.all([first, second]), ['data:image/jpeg;base64,preview', 'data:image/jpeg;base64,preview']);
    await getVideoThumbnail('/shared.mp4');
    assert.equal(videos.length, 1);
  });
});

test('uma falha não bloqueia o próximo vídeo nem impede uma nova tentativa', async () => {
  await withMedia('ready', async ({ videos }) => {
    const broken = getVideoThumbnail('/broken.mp4');
    const valid = getVideoThumbnail('/next.mp4');
    await assert.rejects(broken, /thumbnail:media-error/);
    assert.match(await valid, /^data:image\/jpeg/);
    await assert.rejects(getVideoThumbnail('/broken.mp4'), /thumbnail:media-error/);
    assert.equal(videos.length, 3);
  });
});
