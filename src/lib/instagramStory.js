import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { VideoProcessor } from '@/plugins/VideoProcessor';

// Limite do Instagram para video de story. Acima disso o Instagram corta
// ou recusa o asset, entao preferimos cair no card estatico.
const MAX_STORY_VIDEO_SECONDS = 60;

// Acima disso o download trava a UI por tempo demais em rede movel.
const MAX_STORY_VIDEO_BYTES = 50 * 1024 * 1024;

export const getFacebookAppId = () =>
  import.meta.env.VITE_FACEBOOK_APP_ID || '';

export const canShareToStory = () =>
  Capacitor.isNativePlatform() &&
  Capacitor.isPluginAvailable('VideoProcessor') &&
  Boolean(getFacebookAppId());

// O plugin nativo rejeita com esse codigo quando o app nao esta instalado;
// normalizamos para o chamador tratar sem inspecionar string de erro.
const normalizePluginError = (error) => {
  const message = String(error?.message || error?.code || '');
  if (message.includes('INSTAGRAM_NOT_INSTALLED')) {
    return new Error('INSTAGRAM_NOT_INSTALLED');
  }
  return error;
};

const blobToBase64 = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = String(reader.result || '');
      // readAsDataURL devolve "data:<mime>;base64,<dados>" e o Filesystem
      // espera apenas a parte depois da virgula.
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(new Error('Falha ao ler o video'));
    reader.readAsDataURL(blob);
  });

/**
 * Baixa um video remoto para o cache local do app.
 *
 * O intent do Instagram (Android) e o pasteboard (iOS) so aceitam arquivo
 * local — URL http do Supabase Storage nao funciona em nenhuma das duas.
 *
 * @returns {Promise<string>} caminho local absoluto do arquivo
 */
export const downloadVideoToCache = async (videoUrl, reportId) => {
  const response = await fetch(videoUrl);
  if (!response.ok) {
    throw new Error(`Falha ao baixar o video: HTTP ${response.status}`);
  }

  const blob = await response.blob();

  if (blob.size > MAX_STORY_VIDEO_BYTES) {
    throw new Error('VIDEO_TOO_LARGE');
  }

  const fileName = `story-${reportId}-${Date.now()}.mp4`;
  const base64 = await blobToBase64(blob);

  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({
    directory: Directory.Cache,
    path: fileName,
  });

  return uri;
};

/**
 * Verifica se o video cabe nas regras de story do Instagram.
 * Best-effort: se os metadados falharem, deixamos passar em vez de
 * bloquear o compartilhamento por um check auxiliar.
 */
const isVideoTooLong = async (filePath) => {
  try {
    const meta = await VideoProcessor.getVideoMetadata({ filePath });
    return Number(meta?.duration ?? 0) > MAX_STORY_VIDEO_SECONDS;
  } catch {
    return false;
  }
};

/**
 * Compartilha o video de uma bronca no story do Instagram, com link de volta
 * para o Trombone.
 *
 * IMPORTANTE: o sticker de link so aparece se a conta do usuario tiver
 * permissao de link em story — regra da Meta, nao detectavel pelo app.
 * `linkAttached: true` significa que enviamos o parametro, nao que ele
 * apareceu na tela do usuario.
 *
 * @returns {Promise<{shared: boolean, linkAttached: boolean}>}
 * @throws {Error} com message 'INSTAGRAM_NOT_INSTALLED', 'VIDEO_TOO_LONG'
 *                 ou 'VIDEO_TOO_LARGE' para os casos tratados pelo chamador.
 */
export const shareVideoToInstagramStory = async ({
  videoUrl,
  reportId,
  shareUrl,
}) => {
  const facebookAppId = getFacebookAppId();
  if (!facebookAppId) {
    throw new Error('MISSING_FACEBOOK_APP_ID');
  }

  const filePath = await downloadVideoToCache(videoUrl, reportId);

  if (await isVideoTooLong(filePath)) {
    throw new Error('VIDEO_TOO_LONG');
  }

  try {
    return await VideoProcessor.shareToInstagramStory({
      filePath,
      facebookAppId,
      contentUrl: shareUrl,
      mediaType: 'video',
    });
  } catch (error) {
    throw normalizePluginError(error);
  }
};

/**
 * Compartilha o card do story (PNG gerado pelo html-to-image) direto no
 * Instagram, sem passar pela galeria.
 *
 * Mesma ressalva do video: o sticker de link so aparece se a conta do usuario
 * tiver permissao de link em story.
 *
 * @param {object} params
 * @param {string} params.dataUrl PNG em data URI, saida do toPng
 * @param {string} params.reportId
 * @param {string} [params.shareUrl] URL da bronca para o sticker de link
 * @returns {Promise<{shared: boolean, linkAttached: boolean}>}
 */
export const shareImageToInstagramStory = async ({
  dataUrl,
  reportId,
  shareUrl,
}) => {
  const facebookAppId = getFacebookAppId();
  if (!facebookAppId) {
    throw new Error('MISSING_FACEBOOK_APP_ID');
  }

  const base64 = String(dataUrl || '').split(',')[1] || '';
  if (!base64) {
    throw new Error('INVALID_IMAGE_DATA');
  }

  const fileName = `story-card-${reportId}-${Date.now()}.png`;

  await Filesystem.writeFile({
    path: fileName,
    data: base64,
    directory: Directory.Cache,
    recursive: true,
  });

  const { uri } = await Filesystem.getUri({
    directory: Directory.Cache,
    path: fileName,
  });

  try {
    return await VideoProcessor.shareToInstagramStory({
      filePath: uri,
      facebookAppId,
      contentUrl: shareUrl,
      mediaType: 'image',
    });
  } catch (error) {
    throw normalizePluginError(error);
  }
};
