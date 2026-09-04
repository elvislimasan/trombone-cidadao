// O traçado da Rota do Dia sobre as ruas.
//   node --test src/test/rotaTracada.test.mjs
//
// As invariantes aqui são as que, quebradas, produzem um mapa que MENTE:
//
//   • sem geometria, o trecho é reta e se declara reta;
//   • com geometria, o caminho segue a rua em vez de cortar o quarteirão;
//   • parada longe de qualquer via cadastrada não contamina os outros trechos;
//   • duas paradas sem ligação na malha caem na reta, e não num desvio absurdo.

import test from 'node:test';
import assert from 'node:assert/strict';

import { haversine } from '../lib/navGeo.js';
import {
  TOLERANCIA_ENCAIXE_M,
  caixaDaRota,
  chaveDoNo,
  encaixar,
  montarGrafo,
  rotuloDoTracado,
  tracarRota,
} from '../lib/rotaTracada.js';

// Um quarteirão em L: a rua do sul vai de oeste a leste, a rua do leste sobe.
// Quem sai do canto sudoeste e vai ao canto nordeste NÃO pode cortar na
// diagonal — tem de dobrar a esquina.
const SO = { lat: -8.6, lng: -35.42 };
const SE = { lat: -8.6, lng: -35.415 };
const NE = { lat: -8.595, lng: -35.415 };

const RUA_SUL = [
  [SO.lat, SO.lng],
  [SE.lat, SE.lng],
];
const RUA_LESTE = [
  [SE.lat, SE.lng],
  [NE.lat, NE.lng],
];

test('sem geometria nenhuma, todo trecho é reta e se declara reta', () => {
  const r = tracarRota({ posicao: SO, paradas: [SE, NE], linhas: [] });

  assert.equal(r.tracado, 'reta');
  assert.equal(r.trechos.length, 2);
  assert.ok(r.trechos.every((t) => t.tipo === 'reta' && t.pontos.length === 2));
  assert.ok(r.metros > 0);
});

test('com as ruas cadastradas, o caminho dobra a esquina em vez de cortar', () => {
  const r = tracarRota({ posicao: SO, paradas: [NE], linhas: [RUA_SUL, RUA_LESTE] });

  assert.equal(r.tracado, 'ruas');
  assert.equal(r.trechos.length, 1);

  // A diagonal é mais curta que o L. Se o traçado tivesse cortado, o
  // comprimento bateria com a reta — e é justamente isso que não pode.
  const diagonal = haversine(SO, NE);
  assert.ok(
    r.metros > diagonal * 1.2,
    `esperava um caminho mais longo que a diagonal (${Math.round(diagonal)} m), veio ${r.metros} m`
  );

  // E ele passa pela esquina.
  const passaNaEsquina = r.trechos[0].pontos.some((p) => haversine(p, SE) < 5);
  assert.ok(passaNaEsquina, 'o caminho deveria passar pelo cruzamento');
});

test('na patrulha, aproximações até a rua são tracejadas sem rebaixar a rota', () => {
  const foraDaRua = { lat: SO.lat - 0.0001, lng: SO.lng };
  const alvoAoLado = { lat: NE.lat, lng: NE.lng + 0.0001 };
  const r = tracarRota({
    posicao: foraDaRua,
    paradas: [alvoAoLado],
    linhas: [RUA_SUL, RUA_LESTE],
    detalharAcessos: true,
  });

  assert.equal(r.tracado, 'ruas');
  assert.deepEqual(r.trechos.map((t) => t.tipo), ['acesso', 'ruas', 'acesso']);
  assert.ok(r.trechos[1].pontos.some((p) => haversine(p, SE) < 5));
});

test('a parada longe de qualquer via só estraga o trecho dela', () => {
  // Um ponto a ~2 km da malha: nenhum encaixe possível.
  const longe = { lat: -8.575, lng: -35.395 };
  const r = tracarRota({ posicao: SO, paradas: [SE, longe], linhas: [RUA_SUL, RUA_LESTE] });

  assert.equal(r.tracado, 'parcial');
  assert.equal(r.trechos[0].tipo, 'ruas');
  assert.equal(r.trechos[1].tipo, 'reta');
});

test('duas paradas sem ligação na malha caem na reta, e não num desvio', () => {
  // Duas ruas paralelas que nunca se tocam: quem está numa não chega na outra
  // pelo grafo.
  const ilhaA = [
    [-8.6, -35.42],
    [-8.6, -35.418],
  ];
  const ilhaB = [
    [-8.598, -35.42],
    [-8.598, -35.418],
  ];

  const r = tracarRota({
    posicao: { lat: -8.6, lng: -35.4195 },
    paradas: [{ lat: -8.598, lng: -35.4195 }],
    linhas: [ilhaA, ilhaB],
  });

  assert.equal(r.tracado, 'reta');
  assert.equal(r.trechos[0].tipo, 'reta');
});

test('o adensamento cria o vértice do meio da quadra', () => {
  // A rua tem só dois vértices, a 550 m um do outro. Um ponto no meio dela não
  // pode depender da esquina para encaixar.
  const grafo = montarGrafo([RUA_SUL]);
  const meio = { lat: -8.6, lng: -35.4175 };

  const encaixe = encaixar(grafo, meio);
  assert.ok(encaixe, 'o meio da quadra deveria encaixar');
  assert.ok(
    encaixe.metros < TOLERANCIA_ENCAIXE_M,
    `encaixou a ${Math.round(encaixe.metros)} m, longe demais`
  );
});

test('vias fora da caixa do percurso não entram no grafo', () => {
  const distante = [
    [-8.2, -35.0],
    [-8.2, -34.99],
  ];
  const caixa = caixaDaRota([SO, SE]);
  const grafo = montarGrafo([RUA_SUL, distante], { caixa });

  assert.ok(grafo.nos.has(chaveDoNo(SO.lat, SO.lng)));
  assert.ok(!grafo.nos.has(chaveDoNo(-8.2, -35.0)));
});

test('o rótulo do traçado nunca some — reta sem aviso lê como caminho conferido', () => {
  for (const tracado of ['ruas', 'parcial', 'reta']) {
    assert.ok(rotuloDoTracado(tracado).length > 0);
  }
});

test('rota sem paradas não desenha nada, e não quebra', () => {
  const r = tracarRota({ posicao: SO, paradas: [], linhas: [RUA_SUL] });
  assert.deepEqual(r.trechos, []);
  assert.equal(r.metros, 0);
});
