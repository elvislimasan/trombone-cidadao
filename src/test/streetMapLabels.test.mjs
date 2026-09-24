import test from 'node:test';
import assert from 'node:assert/strict';
import { caixaDoRotulo, rotulosColidem, trechosParaRotulos } from '../lib/streetMapLabels.js';
import { criarPdfDoMapaDeRuas } from '../lib/pavementMapPdf.js';

test('rótulo aproveita rua com muitos vértices sem cortar uma curva', () => {
  const trechos = trechosParaRotulos([[[0, 0], [10, 0.1], [20, 0], [30, 0], [30, 20]]]);
  assert.equal(trechos.length, 2);
  assert.equal(trechos[0].comprimento, 30);
});

test('colisão considera toda a extensão e a rotação dos nomes', () => {
  const horizontal = caixaDoRotulo(0, 0, 40, 3, 0);
  assert.ok(rotulosColidem(horizontal, caixaDoRotulo(15, 0, 25, 3, 90)));
  assert.ok(!rotulosColidem(horizontal, caixaDoRotulo(0, 5, 40, 3, 0)));
  assert.ok(!rotulosColidem(caixaDoRotulo(0, 0, 40, 2, 45), caixaDoRotulo(0, 5, 40, 2, 45)));
});

test('exportação inclui nomes por padrão, planta A1 e índice A4', () => {
  const doc = criarPdfDoMapaDeRuas({ incluirIndice: true, ruas: [
    { name: 'Rua de teste', linhas: [[[0, 0], [0, 0.01]]] },
    { name: 'Rua sem localização' },
  ] });
  assert.equal(doc.tromboneMapStats.ruasComNomeNoMapa, 1);
  assert.ok(doc.internal.pageSize.getWidth() > 800);
  assert.equal(doc.getNumberOfPages(), 2);
  doc.setPage(2);
  assert.ok(doc.internal.pageSize.getWidth() < 211);
  assert.ok(doc.lastAutoTable.body.some((row) => row.raw[0] === 'Rua sem localização'));
});

test('mapas extensos exportam somente o mapa geral', () => {
  const ruas = Array.from({ length: 81 }, (_, i) => ({
    name: `Rua ${i}`, bairro: { name: i < 40 ? 'Centro' : 'Bela Vista' },
    linhas: [[[i * 0.001, 0], [i * 0.001, 0.01]]],
  }));
  const doc = criarPdfDoMapaDeRuas({ ruas });
  assert.equal(doc.tromboneMapStats.paginasDeDetalhe, 0);
  assert.equal(doc.tromboneMapStats.ruas, 81);
  assert.equal(doc.getNumberOfPages(), 1);
});
