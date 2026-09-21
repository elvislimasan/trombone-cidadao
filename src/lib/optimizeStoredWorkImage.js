import { supabase } from '@/lib/customSupabaseClient';
import { imageDimensions, optimizeImageFile } from '@/lib/optimizeImage';

const WORK_MEDIA_BUCKET = 'work-media';

const storagePathFromUrl = (url) => {
  try {
    const encodedPath = new URL(String(url || '')).pathname.split(`/${WORK_MEDIA_BUCKET}/`)[1];
    return encodedPath ? decodeURIComponent(encodedPath) : null;
  } catch {
    return null;
  }
};

const sourceName = (item, mimeType) => {
  const current = String(item?.name || '').trim();
  if (current && /\.[a-z0-9]{2,5}$/i.test(current)) return current;
  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return `${current || 'imagem'}.${extension}`;
};

const prepareImage = async (item, maxDimension, onlyOversized) => {
  const response = await fetch(item.url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível baixar a imagem original.');
  const blob = await response.blob();
  const mimeType = blob.type?.startsWith('image/') ? blob.type : 'image/jpeg';
  if (/image\/(gif|svg\+xml)/i.test(mimeType)) return { skipped: true, reason: 'Formato não redimensionável' };
  const original = new File([blob], sourceName(item, mimeType), { type: mimeType, lastModified: Date.now() });
  if (onlyOversized) {
    const { width, height } = await imageDimensions(original);
    if (Math.max(width, height) <= maxDimension) return { skipped: true, reason: 'Já está dentro do limite' };
  }
  const optimized = await optimizeImageFile(original, { maxDimension, quality: 0.8, forceResize: true });
  if (optimized === original && onlyOversized) throw new Error('Não foi possível redimensionar esta imagem.');
  return { original, optimized };
};

const removeOriginalIfUnreferenced = async (url, replacementPath) => {
  try {
    const previousPath = storagePathFromUrl(url);
    if (!previousPath || previousPath === replacementPath) return;
    const bucketOrigin = new URL(supabase.storage.from(WORK_MEDIA_BUCKET).getPublicUrl('check').data.publicUrl).origin;
    if (new URL(url).origin !== bucketOrigin) return;
    const [media, thumbnails] = await Promise.all([
      supabase.from('public_work_media').select('id', { count: 'exact', head: true }).eq('url', url),
      supabase.from('public_works').select('id', { count: 'exact', head: true }).eq('thumbnail_url', url),
    ]);
    if (!media.error && !thumbnails.error && media.count === 0 && thumbnails.count === 0) {
      await supabase.storage.from(WORK_MEDIA_BUCKET).remove([previousPath]);
    }
  } catch {
    // A imagem nova já está publicada. Uma falha de limpeza não deve
    // transformar o redimensionamento concluído em um erro para o operador.
  }
};

/**
 * Otimiza uma foto já publicada sem deixar o registro apontando para um arquivo
 * incompleto: envia o novo, atualiza o banco e só então remove o original.
 */
export async function optimizeStoredWorkImage(item, { maxDimension = 1600, onlyOversized = false } = {}) {
  if (!item?.id || !item?.url) throw new Error('Imagem inválida.');
  if (!['image', 'photo'].includes(item.type)) throw new Error('Apenas fotos podem ser redimensionadas.');

  const prepared = await prepareImage(item, maxDimension, onlyOversized);
  if (prepared.skipped) return { changed: false, reason: prepared.reason };
  const { original, optimized } = prepared;

  if (optimized === original) {
    return { changed: false, originalBytes: original.size, optimizedBytes: original.size };
  }

  const baseFolder = item.measurement_id
    ? `measurements/${item.measurement_id}`
    : `works/${item.work_id || 'legacy'}`;
  const path = `${baseFolder}/${Date.now()}-${crypto.randomUUID()}-optimized.webp`;
  const { error: uploadError } = await supabase.storage
    .from(WORK_MEDIA_BUCKET)
    .upload(path, optimized, { contentType: 'image/webp', upsert: false });
  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage.from(WORK_MEDIA_BUCKET).getPublicUrl(path);
  const { data: updated, error: updateError } = await supabase
    .from('public_work_media')
    .update({ url: publicUrl })
    .eq('id', item.id)
    .eq('url', item.url)
    .select('id');

  if (updateError || !updated?.length) {
    await supabase.storage.from(WORK_MEDIA_BUCKET).remove([path]);
    throw updateError || new Error('A imagem mudou durante o processamento. Tente novamente.');
  }

  await removeOriginalIfUnreferenced(item.url, path);

  return {
    changed: true,
    url: publicUrl,
    originalBytes: original.size,
    optimizedBytes: optimized.size,
  };
}

export async function optimizeStoredWorkThumbnail(work, { maxDimension = 1600 } = {}) {
  if (!work?.id || !work?.thumbnail_url) throw new Error('Capa inválida.');
  const prepared = await prepareImage({ name: 'capa', url: work.thumbnail_url }, maxDimension, true);
  if (prepared.skipped) return { changed: false, reason: prepared.reason };
  const { original, optimized } = prepared;
  const path = `works/${work.id}/${Date.now()}-${crypto.randomUUID()}-thumbnail-optimized.webp`;
  const { error: uploadError } = await supabase.storage.from(WORK_MEDIA_BUCKET)
    .upload(path, optimized, { contentType: 'image/webp', upsert: false });
  if (uploadError) throw uploadError;
  const { data: { publicUrl } } = supabase.storage.from(WORK_MEDIA_BUCKET).getPublicUrl(path);
  const { data: updated, error: updateError } = await supabase.from('public_works')
    .update({ thumbnail_url: publicUrl }).eq('id', work.id).eq('thumbnail_url', work.thumbnail_url).select('id');
  if (updateError || !updated?.length) {
    await supabase.storage.from(WORK_MEDIA_BUCKET).remove([path]);
    throw updateError || new Error('A capa mudou durante o processamento. Tente novamente.');
  }
  await removeOriginalIfUnreferenced(work.thumbnail_url, path);
  return { changed: true, url: publicUrl, originalBytes: original.size, optimizedBytes: optimized.size };
}
