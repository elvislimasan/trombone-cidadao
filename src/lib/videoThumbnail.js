// Uma extração por vez evita abrir vários decodificadores nos aparelhos menores.
const cache = new Map();
const pending = new Map();
const queue = [];
const MAX_CACHE = 40;
let active = false;

function waitForMedia(video, ready, start, timeoutMs) {
  return new Promise((resolve, reject) => {
    const events = ['loadedmetadata', 'loadeddata', 'canplay', 'seeked', 'timeupdate'];
    const cleanup = () => {
      clearTimeout(timer);
      events.forEach(event => video.removeEventListener(event, check));
      video.removeEventListener('error', fail);
    };
    const check = () => { if (ready()) { cleanup(); resolve(); } };
    const fail = () => { cleanup(); reject(new Error('thumbnail:media-error')); };
    const timer = setTimeout(() => { cleanup(); reject(new Error('thumbnail:timeout')); }, timeoutMs);
    events.forEach(event => video.addEventListener(event, check));
    video.addEventListener('error', fail);
    // Os listeners vêm antes de src/load/seek: mídia em cache pode responder
    // imediatamente. O estado também cobre eventos que já aconteceram.
    try { start(); check(); } catch (error) { cleanup(); reject(error); }
  });
}

export async function captureVideoThumbnail(videoUrl, { timeoutMs = 8000, maxDimension = 640 } = {}) {
  const video = document.createElement('video');
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none';
  host.appendChild(video);
  document.body.appendChild(host);
  try {
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.setAttribute('muted', '');
    video.setAttribute('playsinline', '');
    video.preload = 'auto';
    await waitForMedia(video, () => video.readyState >= 1 && video.videoWidth > 0 && video.videoHeight > 0, () => {
      video.src = videoUrl;
      video.load();
    }, timeoutMs);

    const target = Number.isFinite(video.duration) ? Math.min(.2, Math.max(0, video.duration / 2)) : .2;
    await waitForMedia(video, () => video.readyState >= 2 && !video.seeking && Math.abs(video.currentTime - target) < .05, () => {
      video.currentTime = target;
    }, timeoutMs);

    const scale = Math.min(1, maxDimension / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('thumbnail:canvas-unavailable');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    // Data URL permite retirar do cache sem invalidar a imagem de um cartão
    // ainda montado (revogar um blob compartilhado quebrava esses previews).
    const result = canvas.toDataURL('image/jpeg', .8);
    if (!result.startsWith('data:image/jpeg')) throw new Error('thumbnail:empty');
    return result;
  } finally {
    try { video.pause(); video.removeAttribute('src'); video.load(); } catch {}
    host.remove();
  }
}

export function getCachedVideoThumbnail(url) {
  return cache.get(url) || null;
}

async function pump() {
  if (active || !queue.length) return;
  active = true;
  const job = queue.shift();
  try {
    const result = await captureVideoThumbnail(job.url);
    cache.set(job.url, result);
    while (cache.size > MAX_CACHE) cache.delete(cache.keys().next().value);
    job.resolve(result);
  } catch (error) {
    job.reject(error);
  } finally {
    pending.delete(job.url);
    active = false;
    pump();
  }
}

export function getVideoThumbnail(url) {
  const cached = getCachedVideoThumbnail(url);
  if (cached) { cache.delete(url); cache.set(url, cached); return Promise.resolve(cached); }
  if (pending.has(url)) return pending.get(url);
  const promise = new Promise((resolve, reject) => queue.push({ url, resolve, reject }));
  pending.set(url, promise);
  pump();
  return promise;
}
