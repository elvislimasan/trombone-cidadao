import { v4 as uuidv4 } from 'uuid';

export const PAVEMENT_HISTORY_BUCKET = 'pavement-history';

export const PAVEMENT_PHOTO_ACCEPT = 'image/jpeg,image/png,image/webp,image/gif,image/avif';
export const PAVEMENT_DOCUMENT_ACCEPT = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
].join(',');

const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXTENSION = {
  avif: 'image/avif',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  odt: 'application/vnd.oasis.opendocument.text',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
  webp: 'image/webp',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const PHOTO_MIMES = new Set(PAVEMENT_PHOTO_ACCEPT.split(','));
const DOCUMENT_MIMES = new Set(PAVEMENT_DOCUMENT_ACCEPT.split(','));

const extensionFromName = (name) => {
  const match = String(name || '').trim().toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

export const pavementMediaMimeType = (file) =>
  String(file?.type || '').trim().toLowerCase()
  || MIME_BY_EXTENSION[extensionFromName(file?.name)]
  || 'application/octet-stream';

export const validatePavementMediaFile = (file, kind) => {
  if (!file) return 'Selecione um arquivo.';

  const mime = pavementMediaMimeType(file);
  const allowed = kind === 'photo' ? PHOTO_MIMES : DOCUMENT_MIMES;
  if (!allowed.has(mime)) {
    return kind === 'photo'
      ? 'Use uma imagem JPG, PNG, WebP, GIF ou AVIF.'
      : 'Use um arquivo PDF, DOC, DOCX, ODT, XLS, XLSX ou TXT.';
  }

  const maxBytes = kind === 'photo' ? MAX_PHOTO_BYTES : MAX_DOCUMENT_BYTES;
  if (Number(file.size) > maxBytes) {
    return kind === 'photo'
      ? 'A imagem deve ter no máximo 10 MB.'
      : 'O documento deve ter no máximo 20 MB.';
  }

  return '';
};

export const sanitizePavementMediaFileName = (name) => {
  const normalized = String(name || 'arquivo')
    .replace(/[º°]/g, 'o')
    .replace(/ª/g, 'a')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/-+\./g, '.')
    .replace(/^[-.]+|[-.]+$/g, '');

  return normalized || 'arquivo';
};

const randomObjectId = () => {
  return uuidv4();
};

export const buildPavementMediaPath = ({ cityId, streetId, kind, fileName, objectId }) => {
  if (!/^\d+$/.test(String(cityId || ''))) throw new Error('Cidade inválida para o envio do arquivo.');
  if (!String(streetId || '').trim()) throw new Error('Rua inválida para o envio do arquivo.');
  if (kind !== 'photo' && kind !== 'document') throw new Error('Tipo de anexo inválido.');

  const folder = kind === 'photo' ? 'photos' : 'documents';
  const safeFileName = sanitizePavementMediaFileName(fileName);
  const safeObjectId = sanitizePavementMediaFileName(objectId || randomObjectId());
  return `${cityId}/${streetId}/${folder}/${safeObjectId}-${safeFileName}`;
};

export const pavementMediaStoragePath = (item) => {
  const explicitPath = String(item?.path || '').trim();
  if (explicitPath) return explicitPath;

  const url = String(item?.url || '').trim();
  if (!url) return '';

  try {
    const marker = `/storage/v1/object/public/${PAVEMENT_HISTORY_BUCKET}/`;
    const pathname = new URL(url).pathname;
    const markerIndex = pathname.indexOf(marker);
    if (markerIndex === -1) return '';
    return decodeURIComponent(pathname.slice(markerIndex + marker.length));
  } catch {
    return '';
  }
};

export const uploadPavementMedia = async ({ supabase, file, cityId, streetId, kind }) => {
  const validationError = validatePavementMediaFile(file, kind);
  if (validationError) throw new Error(validationError);

  const path = buildPavementMediaPath({
    cityId,
    streetId,
    kind,
    fileName: file.name,
  });
  const contentType = pavementMediaMimeType(file);
  const { error } = await supabase.storage
    .from(PAVEMENT_HISTORY_BUCKET)
    .upload(path, file, { cacheControl: '3600', contentType, upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(PAVEMENT_HISTORY_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) {
    await supabase.storage.from(PAVEMENT_HISTORY_BUCKET).remove([path]);
    throw new Error('Não foi possível gerar o endereço do arquivo enviado.');
  }

  return { path, url: data.publicUrl, contentType };
};

export const removePavementMedia = async (supabase, paths) => {
  const uniquePaths = [...new Set((paths || []).map((path) => String(path || '').trim()).filter(Boolean))];
  if (uniquePaths.length === 0) return;

  const { error } = await supabase.storage.from(PAVEMENT_HISTORY_BUCKET).remove(uniquePaths);
  if (error) throw error;
};
