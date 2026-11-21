import { Capacitor } from '@capacitor/core';
import { VideoProcessor } from '@/plugins/VideoProcessor';
import { supabase } from '@/lib/customSupabaseClient';
import { compressToJpeg, toWebUrl } from '@/hooks/useNativeCamera';
import { normalizeReportPhoto, isReportPhoto, isHeicPhoto, reportPhotoContentType, HEIC_CONVERSION_ERROR } from './reportPhoto';

export async function prepareReportMediaSource(source, signal) {
  const isVideo = source.type === 'video';
  if (source.nativePath && !/^(blob:|data:|https?:)/i.test(source.nativePath) && Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('VideoProcessor')) {
    let nativePath = source.nativePath;
    if (!isVideo) {
      try {
        const compressed = await VideoProcessor.compressImage({ filePath: nativePath, maxWidth: 1600, maxHeight: 1600, quality: 'high', format: 'jpeg' });
        if (compressed?.outputPath) nativePath = compressed.outputPath;
      } catch {
        if (isHeicPhoto({ name: nativePath })) throw new Error(HEIC_CONVERSION_ERROR);
      }
    }
    const contentType = isVideo ? (/\.mov$/i.test(nativePath) ? 'video/quicktime' : /\.webm$/i.test(nativePath) ? 'video/webm' : 'video/mp4') : reportPhotoContentType(nativePath, reportPhotoContentType(source.name));
    if (/^image\/hei/.test(contentType)) throw new Error(HEIC_CONVERSION_ERROR);
    const name = !isVideo && contentType === 'image/jpeg' ? String(source.name || 'foto').replace(/\.[^.]+$/, '') + '.jpg' : source.name;
    return { source: { ...source, file: null, nativePath }, name, contentType };
  }
  let file = source.file;
  if (!(file instanceof Blob) && source.nativePath) {
    const response = await fetch(toWebUrl(source.nativePath), { signal });
    if (!response.ok) throw new Error('O arquivo não está mais neste aparelho. Escolha outro.');
    const blob = await response.blob();
    file = new File([blob], source.name || 'foto.jpg', { type: blob.type || reportPhotoContentType(source.name) });
  }
  if (!(file instanceof Blob) || !file.size) throw new Error('O arquivo não está mais neste aparelho. Escolha outro.');
  // IndexedDB pode restaurar File como Blob em alguns WebViews.
  file = new File([file], source.name || file.name || (isVideo ? 'video.mp4' : 'foto.jpg'), { type: file.type });
  if (!isVideo) {
    file = normalizeReportPhoto(file);
    if (!isReportPhoto(file)) throw new Error('Selecione uma imagem JPEG, PNG, WEBP, GIF ou HEIC/HEIF.');
    if (file.size > 100 * 1024 * 1024) throw new Error('A foto deve ter até 100 MB.');
    if (file.size > 200 * 1024 || isHeicPhoto(file)) file = await compressToJpeg(file, 1600, 0.8);
    if (isHeicPhoto(file)) throw new Error(HEIC_CONVERSION_ERROR);
  } else if (file.size > 1024 * 1024 * 1024) throw new Error('O vídeo deve ter até 1 GB.');
  return { source: { ...source, file, nativePath: null }, name: file.name, contentType: file.type.split(';')[0] };
}

export async function reportMediaApi(action, item, signal) {
  const { data, error } = await supabase.functions.invoke('report-media', {
    body: { action, reportId: item.reportId, recoveryToken: item.recoveryToken, media: item.media }, signal,
  });
  if (error || data?.error) {
    let message = data?.error;
    if (!message && error?.context?.json) {
      try { message = (await error.context.json()).error; } catch { /* Usa a mensagem padrão. */ }
    }
    throw new Error(message || 'Não foi possível enviar este arquivo. A bronca está salva. Tente novamente.');
  }
  if (!data || (action === 'complete' && !data.completed) || (action === 'prepare' && !data.completed && !data.uploaded && !data.signedUrl)) throw new Error('Resposta de envio indisponível. Tente novamente.');
  return data;
}

export function uploadSignedReportFile(file, signedUrl, contentType, signal, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const finish = error => {
      signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve();
    };
    const abort = () => { xhr.abort(); finish(new Error('Envio cancelado.')); };
    if (signal.aborted) { reject(new Error('Envio cancelado.')); return; }
    xhr.open('PUT', signedUrl);
    xhr.timeout = file.size > 100 * 1024 * 1024 ? 900000 : 120000;
    xhr.setRequestHeader('Content-Type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = event => { if (event.lengthComputable) onProgress(Math.round(100 * event.loaded / event.total)); };
    xhr.onload = () => finish(xhr.status >= 200 && xhr.status < 300 ? null : new Error(`Não foi possível enviar o arquivo (HTTP ${xhr.status}). Tente novamente.`));
    xhr.onerror = () => finish(new Error('A conexão caiu. Tente reenviar o arquivo.'));
    xhr.ontimeout = () => finish(new Error('O envio demorou demais. Tente novamente.'));
    signal.addEventListener('abort', abort, { once: true });
    xhr.send(file);
  });
}

export async function uploadNativeReportFile(source, signedUrl, contentType, signal, onProgress) {
  let nativeId, terminal = false;
  const earlyEvents = new Map();
  let resolveUpload, rejectUpload;
  const completion = new Promise((resolve, reject) => { resolveUpload = resolve; rejectUpload = reject; });
  // O cancelamento pode chegar enquanto o plugin ainda resolve o identificador.
  void completion.catch(() => {});
  const receive = event => {
    if (!nativeId) { earlyEvents.set(event.id, event); return; }
    if (event.id !== nativeId || terminal) return;
    if (event.status === 'completed') { terminal = true; resolveUpload(); }
    else if (event.status === 'cancelled' || String(event.status).startsWith('error')) {
      terminal = true; rejectUpload(new Error('Não foi possível enviar o arquivo. Reenvie ou escolha outro.'));
    } else onProgress(Number(event.progress) || 0);
  };
  const listener = await VideoProcessor.addListener('uploadProgress', receive);
  const abort = () => {
    terminal = true;
    if (nativeId) void VideoProcessor.cancelUpload({ uploadId: nativeId }).catch(() => {});
    rejectUpload(new Error('Envio cancelado.'));
  };
  const timer = setTimeout(abort, 15 * 60 * 1000);
  try {
    if (signal.aborted) throw new Error('Envio cancelado.');
    const result = await VideoProcessor.uploadVideoInBackground({ filePath: source.nativePath, uploadUrl: signedUrl, headers: { 'Content-Type': contentType, 'x-upsert': 'false' }, skipCompression: true });
    nativeId = result.uploadId;
    if (!nativeId) throw new Error('Não foi possível iniciar o envio.');
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    const early = earlyEvents.get(nativeId);
    if (early) receive(early);
    await completion;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', abort);
    await listener.remove();
  }
}

export const uploadReportMediaSource = (source, signedUrl, contentType, signal, onProgress) =>
  source.nativePath ? uploadNativeReportFile(source, signedUrl, contentType, signal, onProgress) : uploadSignedReportFile(source.file, signedUrl, contentType, signal, onProgress);
