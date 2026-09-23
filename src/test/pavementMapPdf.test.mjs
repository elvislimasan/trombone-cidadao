import test from 'node:test';
import assert from 'node:assert/strict';

import {
  construirRegioesDeBairros,
  criarPdfDoMapaDeRuas,
  indiceDoBairroDaQuadra,
  nomeDoArquivoDoMapa,
} from '../lib/pavementMapPdf.js';

test('quadra usa o bairro predominante nas ruas do perímetro', () => {
  const quadra = [[0, 0], [12, 0], [12, 8], [0, 8]];
  const grupos = [
    {
      nome: 'Centro',
      amostras: [[0, 0], [6, 0], [12, 0], [0, 4], [0, 8], [6, 8], [12, 8]],
      segmentos: [
        [[0, 0], [12, 0]],
        [[0, 8], [12, 8]],
        [[0, 0], [0, 8]],
      ],
    },
    {
      nome: 'Caraibeiras',
      // Esta amostra perto do centro reproduz o erro da regra antiga, que
      // ignorava quais ruas efetivamente fechavam a quadra.
      amostras: [[6, 4.1]],
      segmentos: [[[12, 0], [12, 8]]],
    },
  ];

  assert.equal(indiceDoBairroDaQuadra(quadra, grupos), 0);
});

test('regiões seguem a proximidade das ruas sem criar um bairro genérico', () => {
  const regioes = construirRegioesDeBairros([
    { nome: 'Centro', amostras: [[18, 20], [22, 20], [20, 24]] },
    { nome: 'Santa Rosa', amostras: [[76, 20], [82, 20], [80, 25]] },
    { nome: 'Vários Bairros', amostras: [[50, 20], [52, 22]] },
  ], { x: 0, y: 0, largura: 100, altura: 60 }, { celula: 2, alcance: 12 });

  assert.deepEqual(regioes.map((regiao) => regiao.nome), ['Centro', 'Santa Rosa']);
  assert.ok(regioes.every((regiao) => regiao.contornos.length > 0));
  assert.ok(regioes[0].centro[0] < regioes[1].centro[0]);
});

test('regiões de bairros respeitam o limite urbano informado', () => {
  const regioes = construirRegioesDeBairros([
    { nome: 'Centro', amostras: [[48, 28], [52, 28], [50, 32]] },
  ], { x: 0, y: 0, largura: 100, altura: 60 }, {
    celula: 2,
    alcance: 40,
    limites: [[[30, 15], [70, 15], [70, 45], [30, 45]]],
  });

  assert.equal(regioes.length, 1);
  assert.ok(regioes[0].contornos.flat().every(([x, y]) => (
    x >= 29 && x <= 71 && y >= 14 && y <= 46
  )));
});

test('gera desenho em PDF com ruas agrupadas por bairro', () => {
  const bairro = { name: 'Centro' };
  const anelIbge = [
    [-38.572, -8.603], [-38.567, -8.603], [-38.567, -8.598],
    [-38.572, -8.598], [-38.572, -8.603],
  ];
  const doc = criarPdfDoMapaDeRuas({
    cidade: 'Floresta - PE',
    limiteUrbano: {
      type: 'Feature',
      properties: { municipalityCode: '0000000', outline: [anelIbge] },
      geometry: { type: 'MultiPolygon', coordinates: [[[...anelIbge]]] },
    },
    ruas: [
      { name: 'Rua A', status: 'paved', bairro_id: 1, bairro, linhas: [[[-8.60, -38.57], [-8.601, -38.568]]] },
      { name: 'Rua B', status: 'unpaved', bairro_id: 1, bairro, linhas: [[[-8.602, -38.57], [-8.60, -38.568]]] },
      { name: 'Rua C', status: 'partially_paved', bairro_id: 1, bairro, linhas: [[[-8.601, -38.571], [-8.599, -38.569]]] },
    ],
  });

  assert.match(doc.output(), /^%PDF-/);
  assert.ok(doc.output('arraybuffer').byteLength > 2_000);
  assert.equal(nomeDoArquivoDoMapa('Floresta - PE'), 'mapa-de-ruas-floresta-pe.pdf');
});

test('Floresta usa somente as ruas cadastradas mesmo recebendo metadados antigos', () => {
  const doc = criarPdfDoMapaDeRuas({
    cidade: 'Floresta - PE',
    limiteUrbano: {
      type: 'Feature',
      properties: { municipalityCode: '2605707' },
      geometry: null,
    },
    ruas: [{
      name: 'Rua A',
      bairro_id: 1,
      bairro: { name: 'Centro' },
      linhas: [[[-8.60, -38.57], [-8.601, -38.568]]],
    }],
  });

  assert.match(doc.output(), /^%PDF-/);
  assert.match(doc.tromboneMapStats.fonteCartografica, /Trombone Cidadão/);
  assert.equal(doc.tromboneMapStats.quadras, 0);
  assert.equal(doc.tromboneMapStats.ruasComTracado, 1);
  assert.equal(doc.tromboneMapStats.riosOficiais, undefined);
});
