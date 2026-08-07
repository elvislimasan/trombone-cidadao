import { useState, useEffect } from 'react';

// Fila module-level: garante que a geracao de thumbnail de video seja
// serializada entre TODOS os cards do feed, nao apenas dentro de um componente.
const cache = new Map();
const pending = new Map();
const queue = [];
let active = 0;
const MAX_CONCURRENT = 1;
const MAX_CACHE = 40;

const trimCache = () => {
  while (cache.size > MAX_CACHE) {
    const firstKey = cache.keys().next().value;
    const url = cache.get(firstKey);
    cache.delete(firstKey);
    if (typeof url === 'string' && url.startsWith('blob:')) {
      try { URL.revokeObjectURL(url); } catch {}
    }
  }
};

const waitForEvent = (el, event, timeoutMs = 8000) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => { cleanup(); reject(new Error(`timeout:${event}`)); }, timeoutMs);
    const onOk = () => { cleanup(); resolve(); };
    const onErr = () => { cleanup(); reject(new Error(`error:${event}`)); };
    const cleanup = () => {
      clearTimeout(t);
      el.removeEventListener(event, onOk);
      el.removeEventListener('error', onErr);
    };
    el.addEventListener(event, onOk, { once: true });
    el.addEventListener('error', onErr, { once: true });
  });

async function grabFrame(videoUrl) {
  const video = document.createElement('video');
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-99999px;top:0;width:1px;height:1px;overflow:hidden';
  host.appendChild(video);
  document.body.appendChild(host);

  try {
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.preload = 'metadata';
    video.src = videoUrl;
    try { video.load?.(); } catch {}

    await waitForEvent(video, 'loadedmetadata', 8000);
    try { await waitForEvent(video, 'loadeddata', 8000); } catch {}

    const seekTo = Math.min(
      0.2,
      Number.isFinite(video.duration) ? Math.max(0, video.duration - 0.05) : 0.2
    );
    try { video.currentTime = seekTo; } catch {}
    await Promise.race([
      waitForEvent(video, 'seeked', 8000),
      waitForEvent(video, 'timeupdate', 8000),
    ]);

    const w = Math.max(1, video.videoWidth || 0);
    const h = Math.max(1, video.videoHeight || 0);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d').drawImage(video, 0, 0, w, h);

    return await new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) { reject(new Error('thumbnail:empty')); return; }
          resolve(URL.createObjectURL(blob));
        },
        'image/jpeg',
        0.82
      );
    });
  } finally {
    try { video.removeAttribute('src'); video.load?.(); } catch {}
    try { host.remove(); } catch {}
  }
}

function pump() {
  if (active >= MAX_CONCURRENT) return;
  const job = queue.shift();
  if (!job) return;
  active += 1;
  grabFrame(job.url)
    .then((blobUrl) => {
      cache.set(job.url, blobUrl);
      trimCache();
      job.resolve(blobUrl);
    })
    .catch(job.reject)
    .finally(() => {
      active -= 1;
      pending.delete(job.url);
      pump();
    });
}

function enqueue(url) {
  if (cache.has(url)) return Promise.resolve(cache.get(url));
  if (pending.has(url)) return pending.get(url);

  const p = new Promise((resolve, reject) => {
    queue.push({ url, resolve, reject });
    pump();
  });
  pending.set(url, p);
  return p;
}

export function useVideoThumbnail(videoUrl, { enabled = true } = {}) {
  const [thumbnailUrl, setThumbnailUrl] = useState(() =>
    videoUrl && cache.has(videoUrl) ? cache.get(videoUrl) : null
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled || !videoUrl) return;
    if (cache.has(videoUrl)) {
      setThumbnailUrl(cache.get(videoUrl));
      return;
    }

    let canceled = false;
    enqueue(videoUrl)
      .then((url) => { if (!canceled) setThumbnailUrl(url); })
      .catch(() => { if (!canceled) setFailed(true); });

    return () => { canceled = true; };
  }, [videoUrl, enabled]);

  return { thumbnailUrl, failed };
}

export default useVideoThumbnail;
