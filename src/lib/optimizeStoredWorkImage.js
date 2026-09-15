import { supabase } from '@/lib/customSupabaseClient';
import { optimizeImageFile } from '@/lib/optimizeImage';

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

/**
 * Otimiza uma foto já publicada sem deixar o registro apontando para um arquivo
 * incompleto: envia o novo, atualiza o banco e só então remove o original.
 */
export async function optimizeStoredWorkImage(item, { maxDimension = 1600 } = {}) {
  if (!item?.id || !item?.url) throw new Error('Imagem inválida.');
  if (!['image', 'photo'].includes(item.type)) throw new Error('Apenas fotos podem ser redimensionadas.');

  const response = await fetch(item.url, { cache: 'no-store' });
  if (!response.ok) throw new Error('Não foi possível baixar a imagem original.');
  const blob = await response.blob();
  const mimeType = blob.type?.startsWith('image/') ? blob.type : 'image/jpeg';
  const original = new File([blob], sourceName(item, mimeType), { type: mimeType, lastModified: Date.now() });
  const optimized = await optimizeImageFile(original, {
    maxDimension,
    quality: 0.8,
    forceResize: true,
  });

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
  const { error: updateError } = await supabase
    .from('public_work_media')
    .update({ url: publicUrl })
    .eq('id', item.id);

  if (updateError) {
    await supabase.storage.from(WORK_MEDIA_BUCKET).remove([path]);
    throw updateError;
  }

  const previousPath = storagePathFromUrl(item.url);
  if (previousPath && previousPath !== path) {
    await supabase.storage.from(WORK_MEDIA_BUCKET).remove([previousPath]);
  }

  return {
    changed: true,
    url: publicUrl,
    originalBytes: original.size,
    optimizedBytes: optimized.size,
  };
}
