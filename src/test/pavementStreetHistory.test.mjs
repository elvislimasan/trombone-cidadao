import test from 'node:test';
import assert from 'node:assert/strict';

import {
  capaDaRua,
  formatarDataBr,
  formatarTamanhoArquivo,
  hasPavementStreetHistory,
  normalizarDocumentos,
  normalizarFotos,
  tipoDoArquivo,
} from '../lib/pavementStreetHistory.js';

test('rua sem conteúdo histórico não exibe acesso à história', () => {
  assert.equal(hasPavementStreetHistory({
    honoree_name: '  ',
    biography: null,
    curiosities: '',
    historical_documents: [],
    historical_photos: [],
  }), false);
});

test('qualquer conteúdo histórico válido libera o acesso', () => {
  assert.equal(hasPavementStreetHistory({ biography: 'Biografia' }), true);
  assert.equal(hasPavementStreetHistory({ historical_documents: [{ url: 'https://example.com/lei.pdf' }] }), true);
  assert.equal(hasPavementStreetHistory({ historical_photos: [{ url: 'https://example.com/rua.jpg' }] }), true);
});

test('mídia sem endereço público não conta como história disponível', () => {
  assert.equal(hasPavementStreetHistory({
    historical_documents: [{ title: 'Lei sem arquivo', url: '' }],
    historical_photos: [{ caption: 'Foto sem arquivo' }],
  }), false);
});

/* --- Data --- */

test('a data pura nao anda um dia para tras no fuso do Brasil', () => {
  // `new Date('2024-01-12')` e meia-noite UTC, que aqui ainda e dia 11. Este e
  // o teste que impede a foto de 12/01 aparecer como 11/01.
  assert.equal(formatarDataBr('2024-01-12'), '12/01/2024');
  assert.equal(formatarDataBr('2025-05-07'), '07/05/2025');
});

test('data vazia ou invalida nao vira texto quebrado na tela', () => {
  assert.equal(formatarDataBr(''), '');
  assert.equal(formatarDataBr(null), '');
  assert.equal(formatarDataBr('   '), '');
  assert.equal(formatarDataBr('nao e data'), '');
});

/* --- Tamanho --- */

test('bytes viram a unidade legivel mais proxima', () => {
  assert.equal(formatarTamanhoArquivo(245 * 1024), '245 KB');
  assert.equal(formatarTamanhoArquivo(1024), '1,0 KB');
  assert.equal(formatarTamanhoArquivo(900), '900 B');
});

test('tamanho ja digitado pela pessoa passa direto', () => {
  assert.equal(formatarTamanhoArquivo('1,2 MB'), '1,2 MB');
  assert.equal(formatarTamanhoArquivo('  890 KB  '), '890 KB');
});

test('tamanho ausente nao inventa zero', () => {
  assert.equal(formatarTamanhoArquivo(undefined), '');
  assert.equal(formatarTamanhoArquivo(0), '');
  assert.equal(formatarTamanhoArquivo(-5), '');
});

/* --- Tipo --- */

test('o tipo sai da extensao do caminho, nao do dominio', () => {
  assert.equal(tipoDoArquivo({ url: 'https://exemplo.com/leis/lei-123.pdf' }), 'PDF');
  assert.equal(tipoDoArquivo({ url: 'https://exemplo.com/planta.PNG' }), 'PNG');
  // Sem este caso, o ponto de '.com' rotularia o documento como "COM".
  assert.equal(tipoDoArquivo({ url: 'https://exemplo.com' }), '');
  assert.equal(tipoDoArquivo({ url: 'https://exemplo.com/arquivo' }), '');
});

test('query e ancora nao entram na extensao', () => {
  assert.equal(tipoDoArquivo({ url: 'https://exemplo.com/lei.pdf?token=abc' }), 'PDF');
  assert.equal(tipoDoArquivo({ url: 'https://exemplo.com/lei.pdf#pagina2' }), 'PDF');
});

test('o tipo declarado no cadastro vence a extensao', () => {
  assert.equal(tipoDoArquivo({ type: 'pdf', url: 'https://exemplo.com/download?id=9' }), 'PDF');
});

/* --- Normalizacao --- */

test('so entra na tela o que tem endereco utilizavel', () => {
  const street = {
    historical_photos: [
      { url: 'https://exemplo.com/a.jpg', caption: ' Entrada ', date: '2024-01-12' },
      { url: '   ', caption: 'Sem arquivo' },
      { caption: 'Sem url nenhuma' },
    ],
    historical_documents: [
      { url: 'https://exemplo.com/lei.pdf', title: ' Lei 123 ', description: ' Municipal ', size: 245 * 1024 },
      { url: '', title: 'Descartado' },
    ],
  };

  const fotos = normalizarFotos(street);
  assert.equal(fotos.length, 1);
  assert.deepEqual(fotos[0], {
    url: 'https://exemplo.com/a.jpg',
    caption: 'Entrada',
    date: '2024-01-12',
    subject: 'street',
  });

  const documentos = normalizarDocumentos(street);
  assert.equal(documentos.length, 1);
  assert.deepEqual(documentos[0], {
    url: 'https://exemplo.com/lei.pdf',
    title: 'Lei 123',
    description: 'Municipal',
    type: 'PDF',
    size: '245 KB',
  });
});

test('cadastro antigo, sem as chaves novas, continua abrindo', () => {
  // As colunas sao jsonb sem esquema: o que foi salvo antes de existirem data,
  // descricao e tamanho precisa seguir valendo.
  const antigo = {
    historical_photos: [{ url: 'https://exemplo.com/a.jpg', caption: 'Rua' }],
    historical_documents: [{ url: 'https://exemplo.com/b.pdf', title: 'Lei' }],
  };

  assert.deepEqual(normalizarFotos(antigo)[0].date, '');
  assert.deepEqual(normalizarDocumentos(antigo)[0].description, '');
  assert.deepEqual(normalizarDocumentos(antigo)[0].size, '');
  assert.deepEqual(normalizarDocumentos(antigo)[0].type, 'PDF');
});

test('coluna ausente ou de outro formato devolve lista vazia', () => {
  assert.deepEqual(normalizarFotos(null), []);
  assert.deepEqual(normalizarFotos({}), []);
  assert.deepEqual(normalizarFotos({ historical_photos: 'nao e array' }), []);
  assert.deepEqual(normalizarDocumentos({ historical_documents: { url: 'x' } }), []);
});

/* --- Capa --- */

test('a capa e a foto da rua, nunca a do homenageado', () => {
  const fotos = normalizarFotos({
    historical_photos: [
      { url: 'https://exemplo.com/retrato.jpg', subject: 'honoree' },
      { url: 'https://exemplo.com/rua.jpg', subject: 'street' },
    ],
  });

  assert.equal(capaDaRua(fotos).url, 'https://exemplo.com/rua.jpg');
});

test('sem foto da rua nao ha capa, e a pagina cai no gradiente', () => {
  const fotos = normalizarFotos({
    historical_photos: [{ url: 'https://exemplo.com/retrato.jpg', subject: 'honoree' }],
  });

  assert.equal(capaDaRua(fotos), null);
  assert.equal(capaDaRua([]), null);
  assert.equal(capaDaRua(null), null);
});
