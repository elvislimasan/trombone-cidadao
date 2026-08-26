import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildPavementMediaPath,
  pavementMediaMimeType,
  pavementMediaStoragePath,
  sanitizePavementMediaFileName,
  validatePavementMediaFile,
} from '../lib/pavementStreetMedia.js';

test('nome de arquivo fica seguro sem perder a extensão', () => {
  assert.equal(sanitizePavementMediaFileName(' Lei nº 1.234 (final).PDF '), 'Lei-no-1.234-final.PDF');
});

test('caminho separa cidade, rua e tipo do anexo', () => {
  assert.equal(
    buildPavementMediaPath({ cityId: 64, streetId: 'rua-123', kind: 'photo', fileName: 'Foto atual.jpg', objectId: 'obj-1' }),
    '64/rua-123/photos/obj-1-Foto-atual.jpg'
  );
  assert.equal(
    buildPavementMediaPath({ cityId: 64, streetId: 'rua-123', kind: 'document', fileName: 'Lei.pdf', objectId: 'obj-2' }),
    '64/rua-123/documents/obj-2-Lei.pdf'
  );
});

test('mime pode ser deduzido da extensão quando o navegador não informa', () => {
  assert.equal(pavementMediaMimeType({ name: 'lei.DOCX', type: '' }), 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.equal(pavementMediaMimeType({ name: 'rua.webp', type: '' }), 'image/webp');
});

test('validação separa imagens de documentos e limita o tamanho', () => {
  assert.equal(validatePavementMediaFile({ name: 'rua.jpg', type: 'image/jpeg', size: 1000 }, 'photo'), '');
  assert.match(validatePavementMediaFile({ name: 'lei.pdf', type: 'application/pdf', size: 1000 }, 'photo'), /imagem/);
  assert.equal(validatePavementMediaFile({ name: 'lei.pdf', type: 'application/pdf', size: 1000 }, 'document'), '');
  assert.match(validatePavementMediaFile({ name: 'lei.pdf', type: 'application/pdf', size: 21 * 1024 * 1024 }, 'document'), /20 MB/);
});

test('caminho é recuperado de metadado novo ou URL do bucket', () => {
  assert.equal(pavementMediaStoragePath({ path: '64/a/photos/foto.jpg' }), '64/a/photos/foto.jpg');
  assert.equal(
    pavementMediaStoragePath({ url: 'https://abc.supabase.co/storage/v1/object/public/pavement-history/64/a/documents/Lei%20final.pdf' }),
    '64/a/documents/Lei final.pdf'
  );
  assert.equal(pavementMediaStoragePath({ url: 'https://example.com/arquivo.pdf' }), '');
});
