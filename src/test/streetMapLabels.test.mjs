import test from 'node:test';
import assert from 'node:assert/strict';
import { caixaDoRotulo, planejarRotulosDeRuas, rotulosColidem, trechosParaRotulos, nomeDaRuaNoMapa } from '../lib/streetMapLabels.js';
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

test('download padrão é somente a planta, sem índice ou rótulos deslocados das ruas', () => {
  const nomes = ['Rua principal', 'Rua Professora Maria de Lourdes Xavier Ferraz', 'Rua apenas por ponto'];
  const doc = criarPdfDoMapaDeRuas({ ruas: [
    { name: nomes[0], linhas: [[[0, 0], [0, 0.02]]] },
    { name: nomes[1], linhas: [[[0.001, 0.01], [0.001, 0.0101]]] },
    { name: nomes[2], location: { lat: 0.002, lng: 0.01 } },
  ] });
  assert.equal(doc.tromboneMapStats.ruasComNomeNoMapa, 1);
  assert.equal(doc.tromboneMapStats.ruasSomentePonto, 1);
  assert.deepEqual(doc.tromboneMapStats.ruasSemNomeNoMapa.map(r => r.name), nomes.slice(1));
  assert.equal(doc.getNumberOfPages(), 1);
  const comandosMapa = doc.internal.pages[1].join('\n');
  assert.ok(comandosMapa.includes(`(${nomes[0]})`));
  for (const nome of nomes.slice(1)) assert.ok(!comandosMapa.includes(`(${nome})`));
  assert.equal(doc.lastAutoTable, false);
});

test('rótulos institucionais ficam no eixo e não repetem bairro; apelidos e nomes cadastrados são preservados', () => {
  const rua = { name: 'Rua Projetada 15 (Parque das Acácias)', bairro: { name: 'Parque das Acácias' }, linhasProjetadas: [[[0, 20], [150, 20]]] };
  const rotulos = planejarRotulosDeRuas([rua, { name: 'Rua sem traçado', linhasProjetadas: [[[10, 20]]] }],
    { x: 0, y: 0, largura: 150, altura: 50 }, (texto, tamanho) => texto.length * tamanho * 0.18,
    { permitirChamadas: false, nomeVisual: nomeDaRuaNoMapa });
  assert.ok(rotulos.length > 0);
  assert.ok(rotulos.every(r => r.y === 20 && r.ancora === null && r.texto === 'Rua Projetada 15'));
  assert.equal(rua.name, 'Rua Projetada 15 (Parque das Acácias)');
  assert.equal(nomeDaRuaNoMapa({ name: 'Rua Pedro (Piduca)', bairro: { name: 'Centro' } }), 'Rua Pedro (Piduca)');
  assert.equal(nomeDaRuaNoMapa({ name: 'RUA BIANÔR ALVES DE BARROS' }), 'Rua Bianôr Alves de Barros');
});

test('nomes cabem em ruas curtas da planta geral usando linhas dentro do corredor da via', () => {
  const ruas = [
    { id: 'bianor', name: 'RUA BIANÔR ALVES DE BARROS', linhas: [[[-8.597119686, -38.580464137], [-8.598635081, -38.580979265]]] },
    { id: 'proj1', name: 'Rua Projetada 01 (Pedras de Josina)', bairro: { name: 'Pedras de Josina' }, linhas: [[[-8.606, -38.575], [-8.606, -38.57463]]] },
    { id: 'proj2', name: 'Rua Projetada 02 (Pedras de Josina)', bairro: { name: 'Pedras de Josina' }, linhas: [[[-8.6063, -38.575], [-8.6063, -38.57469]]] },
    { id: 'extent', name: 'Rua principal', linhas: [[[-8.6097976, -38.604902], [-8.588532, -38.563052]]] },
  ];
  const original = structuredClone(ruas);
  const doc = criarPdfDoMapaDeRuas({ ruas });
  assert.equal(doc.tromboneMapStats.ruasComNomeNoMapa, 4);
  assert.deepEqual(doc.tromboneMapStats.ruasSemNomeNoMapa, []);
  assert.equal(doc.getNumberOfPages(), 1);
  assert.deepEqual(ruas, original);
  assert.ok(doc.internal.pages[1].join('\n').includes('Bianôr'));
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
