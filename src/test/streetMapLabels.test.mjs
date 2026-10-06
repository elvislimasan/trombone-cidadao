import test from 'node:test';
import assert from 'node:assert/strict';
import { caixaDoRotulo, planejarRotulosDeRuas, rotulosColidem, trechosParaRotulos } from '../lib/streetMapLabels.js';
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

test('PDF inclui nome completo de trecho curto e rua cadastrada apenas por ponto', () => {
  const nomes = ['Rua principal', 'Rua Professora Maria de Lourdes Xavier Ferraz', 'Rua apenas por ponto'];
  const doc = criarPdfDoMapaDeRuas({ ruas: [
    { name: nomes[0], linhas: [[[0, 0], [0, 0.02]]] },
    { name: nomes[1], linhas: [[[0.001, 0.01], [0.001, 0.0101]]] },
    { name: nomes[2], location: { lat: 0.002, lng: 0.01 } },
  ] });
  assert.equal(doc.tromboneMapStats.ruasComNomeNoMapa, 3);
  assert.equal(doc.tromboneMapStats.ruasSomentePonto, 1);
  assert.deepEqual(doc.tromboneMapStats.ruasSemNomeNoMapa, []);
  const comandos = doc.internal.pages[1].join('\n');
  for (const nome of nomes) assert.ok(comandos.includes(`(${nome})`), nome);
});

test('nomes em cruzamento denso usam chamadas sem sobrepor texto ou sair do mapa', () => {
  const mapa = { x: 0, y: 0, largura: 100, altura: 80 };
  const ruas = Array.from({ length: 14 }, (_, i) => ({
    name: `Rua Professora Maria ${i}`,
    linhasProjetadas: [[[49, 38 + i * 0.3], [51, 38 + i * 0.3]]],
  }));
  ruas.push({ name: 'Rua por ponto', linhasProjetadas: [[[50, 40]]] });
  const rotulos = planejarRotulosDeRuas(ruas, mapa, (texto, tamanho) => texto.length * tamanho * 0.18);
  assert.equal(new Set(rotulos.map((rotulo) => rotulo.rua)).size, ruas.length);
  assert.ok(rotulos.some((rotulo) => rotulo.ancora));
  const ponto = rotulos.find((rotulo) => rotulo.rua === ruas.at(-1));
  assert.deepEqual(ponto.ancora, [50, 40]);
  assert.ok(Math.hypot(ponto.x - 50, ponto.y - 40) >= 3);
  for (let i = 0; i < rotulos.length; i += 1) {
    assert.equal(rotulos[i].texto, rotulos[i].rua.name);
    assert.ok(rotulos[i].caixa.every(([x, y]) => x >= 0 && x <= 100 && y >= 0 && y <= 80));
    for (const outro of rotulos.slice(i + 1)) {
      assert.ok(!rotulosColidem(rotulos[i].caixa, outro.caixa));
    }
  }
});

test('vias longas só repetem nomes depois de reservar os nomes das outras ruas', () => {
  const ruas = [
    { name: 'Avenida longa', linhasProjetadas: [[[10, 40], [290, 40]]] },
    { name: 'Rua curta', linhasProjetadas: [[[100, 39], [100, 41]]] },
    { name: 'Rua por ponto', linhasProjetadas: [[[220, 40]]] },
  ];
  const rotulos = planejarRotulosDeRuas(ruas, { x: 0, y: 0, largura: 300, altura: 80 },
    (texto, tamanho) => texto.length * tamanho * 0.18);
  assert.equal(new Set(rotulos.map((rotulo) => rotulo.rua)).size, ruas.length);
  const primeiros = new Set();
  for (const { rua } of rotulos) {
    if (primeiros.has(rua)) assert.equal(primeiros.size, ruas.length);
    primeiros.add(rua);
  }
  assert.ok(rotulos.filter((rotulo) => rotulo.rua === ruas[0]).length > 1);
});

test('opção de exportar sem nomes continua disponível', () => {
  const doc = criarPdfDoMapaDeRuas({ mostrarNomesRuas: false, ruas: [
    { name: 'Rua de teste', linhas: [[[0, 0], [0, 0.01]]] },
  ] });
  assert.equal(doc.tromboneMapStats.ruasComNomeNoMapa, 0);
  assert.equal(doc.tromboneMapStats.rotulosDeRuas, 0);
  assert.deepEqual(doc.tromboneMapStats.ruasSemNomeNoMapa, []);
});
