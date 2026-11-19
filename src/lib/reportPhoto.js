const PHOTO_MIME_BY_EXTENSION = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
  webp: 'image/webp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
};

export const REPORT_PHOTO_ACCEPT = 'image/jpeg,image/jpg,image/png,image/webp,image/gif,image/heic,image/heif,image/heic-sequence,image/heif-sequence,.heic,.heif';

export const isHeicPhoto = (file) =>
  /^image\/hei[cf](?:-sequence)?$/i.test(file?.type || '') || /\.hei[cf]$/i.test(file?.name || '');

export const isReportPhoto = (file) =>
  Object.values(PHOTO_MIME_BY_EXTENSION).includes(file?.type) || file?.type === 'image/jpg' || isHeicPhoto(file);

// O seletor do iOS pode entregar fotos sem MIME. Inferir somente extensões
// conhecidas; o nome de uma foto convertida deve acompanhar os bytes enviados.
export function normalizeReportPhoto(file) {
  const extension = String(file?.name || '').split('.').pop().toLowerCase();
  const inferredType = PHOTO_MIME_BY_EXTENSION[extension];
  if (inferredType && (!file.type || file.type === 'application/octet-stream' || file.type === 'image/jpg')) {
    return new File([file], file.name, { type: inferredType, lastModified: file.lastModified });
  }
  return file;
}

export const HEIC_CONVERSION_ERROR = 'Não foi possível converter esta foto HEIC/HEIF. Selecione uma versão JPEG ou tire outra foto pela câmera.';

export function reportPhotoContentType(path, fallback = 'image/jpeg') {
  const extension = String(path || '').split(/[?#]/)[0].split('.').pop().toLowerCase();
  return PHOTO_MIME_BY_EXTENSION[extension] || fallback;
}
