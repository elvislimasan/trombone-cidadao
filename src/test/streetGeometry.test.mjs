// O traçado da rua vindo do OpenStreetMap.
//   node --test src/test/streetGeometry.test.mjs
//
// O casamento por nome é a parte perigosa: errar para MENOS deixa a rua sem
// desenho, o que se vê. Errar para MAIS desenha a rua errada no mapa oficial de
// pavimentação, o que passa por informação. Por isso os testes cobrem os dois
// lados, e o "não casou" é um resultado esperado, não uma falha.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  bboxDasRuas,
  buildOverpassQuery,
  buildOverpassQueryAround,
  casarTracado,
  coordenadaDaRua,
  normalizarNomeDeRua,
  parseOverpassWays,
  toMultiLineStringWkt,
} from '../lib/streetGeometry.js';

// ── Normalização de nome ─────────────────────────────────────────────────────

test('tira acento e caixa', () => {
  assert.equal(normalizarNomeDeRua('Rua Damião'), 'rua damiao');
});

test('expande as abreviaturas do cadastro', () => {
  assert.equal(normalizarNomeDeRua('R. Dr. José'), 'rua doutor jose');
  assert.equal(normalizarNomeDeRua('Av. Pe. Cícero'), 'avenida padre cicero');
  assert.equal(normalizarNomeDeRua('Trav. Prof. Ana'), 'travessa professor ana');
});

test('descarta o que está entre parênteses', () => {
  // "Rua Bernardo Menezes (antiga Rua Projetada 4)" tem que casar com a via
  // que o OSM conhece pelo nome novo.
  assert.equal(
    normalizarNomeDeRua('Rua Bernardo Menezes (antiga Rua Projetada 4)'),
    'rua bernardo menezes'
  );
});

test('colapsa espaço repetido e apara as pontas', () => {
  assert.equal(normalizarNomeDeRua('  Rua   São   João  '), 'rua sao joao');
});

test('entrada inútil não quebra', () => {
  assert.equal(normalizarNomeDeRua(null), '');
  assert.equal(normalizarNomeDeRua(''), '');
});

// ── Consulta ─────────────────────────────────────────────────────────────────

test('a consulta por bbox pede geometria embutida', () => {
  const q = buildOverpassQuery({ sul: -8.62, oeste: -38.60, norte: -8.58, leste: -38.55 });
  assert.match(q, /\[out:json\]/);
  assert.match(q, /way\["highway"\]\["name"\]/);
  assert.match(q, /-8\.62,-38\.6,-8\.58,-38\.55/);
  // `out geom` evita a segunda passada pelos nós.
  assert.match(q, /out geom;/);
});

test('a consulta por raio usa around', () => {
  const q = buildOverpassQueryAround({ lat: -8.6, lng: -38.57, raio: 1500 });
  assert.match(q, /around:1500,-8\.6,-38\.57/);
  assert.match(q, /out geom;/);
});

// ── Leitura da resposta ──────────────────────────────────────────────────────

const RESPOSTA = {
  elements: [
    {
      type: 'way',
      tags: { name: 'Rua São João', highway: 'residential' },
      geometry: [{ lat: -8.60, lon: -38.57 }, { lat: -8.601, lon: -38.571 }],
    },
    {
      type: 'way',
      tags: { name: 'Rua São João', highway: 'residential' },
      geometry: [{ lat: -8.601, lon: -38.571 }, { lat: -8.602, lon: -38.572 }],
    },
    { type: 'way', tags: { name: 'Avenida Central' }, geometry: [{ lat: -8.61, lon: -38.58 }] },
    { type: 'node', id: 1, lat: -8.6, lon: -38.57 },
  ],
};

test('lê as vias com nome e geometria, em [lng,lat]', () => {
  const ways = parseOverpassWays(RESPOSTA);
  assert.equal(ways.length, 3);
  assert.deepEqual(ways[0].coords[0], [-38.57, -8.60]);
});

test('ignora nó e via sem geometria', () => {
  const ways = parseOverpassWays({
    elements: [
      { type: 'node', lat: 1, lon: 1 },
      { type: 'way', tags: { name: 'X' } },
      { type: 'way', tags: { name: 'Y' }, geometry: [] },
    ],
  });
  assert.deepEqual(ways, []);
});

test('resposta vazia ou inválida devolve lista vazia', () => {
  assert.deepEqual(parseOverpassWays(null), []);
  assert.deepEqual(parseOverpassWays({}), []);
  assert.deepEqual(parseOverpassWays({ elements: 'nada' }), []);
});

// ── Casamento ────────────────────────────────────────────────────────────────

const RUA = { name: 'Rua São João', location: { lat: -8.60, lng: -38.57 } };

test('junta todos os trechos da mesma rua', () => {
  // Duas `way` com o mesmo nome são a mesma rua partida, e as duas entram.
  const linhas = casarTracado(RUA, parseOverpassWays(RESPOSTA));
  assert.equal(linhas.length, 2);
});

test('casa mesmo com acento e abreviatura divergentes', () => {
  const rua = { name: 'R. Sao Joao', location: { lat: -8.60, lng: -38.57 } };
  assert.equal(casarTracado(rua, parseOverpassWays(RESPOSTA)).length, 2);
});

test('casa ignorando o tipo da via quando só ele difere', () => {
  const ways = parseOverpassWays({
    elements: [{
      type: 'way',
      tags: { name: 'Avenida Bela Vista' },
      geometry: [{ lat: -8.60, lon: -38.57 }, { lat: -8.601, lon: -38.571 }],
    }],
  });
  const rua = { name: 'Rua Bela Vista', location: { lat: -8.60, lng: -38.57 } };
  assert.equal(casarTracado(rua, ways).length, 1);
});

test('não casa nome parecido — errar para mais é pior que errar para menos', () => {
  const rua = { name: 'Rua São João Batista', location: { lat: -8.60, lng: -38.57 } };
  assert.deepEqual(casarTracado(rua, parseOverpassWays(RESPOSTA)), []);
});

test('descarta homônima longe do ponto cadastrado', () => {
  // Duas "Rua São João" na mesma cidade: a coordenada já cadastrada diz qual é.
  const ways = parseOverpassWays({
    elements: [{
      type: 'way',
      tags: { name: 'Rua São João' },
      // ~11 km ao norte
      geometry: [{ lat: -8.50, lon: -38.57 }, { lat: -8.501, lon: -38.571 }],
    }],
  });
  assert.deepEqual(casarTracado(RUA, ways), []);
});

test('rua sem ponto cadastrado não casa nada', () => {
  // Sem coordenada não há como aplicar a guarda de distância, e sem a guarda o
  // casamento vira aposta.
  assert.deepEqual(casarTracado({ name: 'Rua São João' }, parseOverpassWays(RESPOSTA)), []);
});

// ── WKT ──────────────────────────────────────────────────────────────────────

test('monta o MULTILINESTRING em lng lat', () => {
  const wkt = toMultiLineStringWkt([[[-38.57, -8.60], [-38.571, -8.601]]]);
  assert.equal(wkt, 'MULTILINESTRING((-38.57 -8.6,-38.571 -8.601))');
});

test('duas linhas viram dois grupos', () => {
  const wkt = toMultiLineStringWkt([
    [[-38.57, -8.60], [-38.571, -8.601]],
    [[-38.58, -8.61], [-38.581, -8.611]],
  ]);
  assert.equal(wkt.match(/\(\(/g).length, 1);
  assert.equal(wkt.split('),(').length, 2);
});

test('lista vazia vira null, não WKT inválido', () => {
  assert.equal(toMultiLineStringWkt([]), null);
  assert.equal(toMultiLineStringWkt(null), null);
});

test('linha com um ponto só é descartada — não existe reta de um ponto', () => {
  assert.equal(toMultiLineStringWkt([[[-38.57, -8.60]]]), null);
});

// ── bbox ─────────────────────────────────────────────────────────────────────

test('a bbox cobre todas as ruas com folga', () => {
  const b = bboxDasRuas([
    { location: { lat: -8.60, lng: -38.57 } },
    { location: { lat: -8.62, lng: -38.55 } },
  ], 0.02);
  assert.ok(b.sul <= -8.64 + 1e-9);
  assert.ok(b.norte >= -8.58 - 1e-9);
  assert.ok(b.oeste <= -38.59 + 1e-9);
  assert.ok(b.leste >= -38.53 - 1e-9);
});

test('sem rua com ponto, não há bbox', () => {
  assert.equal(bboxDasRuas([]), null);
  assert.equal(bboxDasRuas([{ location: null }]), null);
});

// ── coordenadaDaRua ──────────────────────────────────────────────────────────

test('GeoJSON [lng,lat] vira {lat,lng}', () => {
  assert.deepEqual(coordenadaDaRua({ coordinates: [-38.57, -8.60] }), { lat: -8.60, lng: -38.57 });
});

test('{lat,lng} já convertido passa direto', () => {
  assert.deepEqual(coordenadaDaRua({ lat: -8.60, lng: -38.57 }), { lat: -8.60, lng: -38.57 });
});

test('sem localização vira null', () => {
  assert.equal(coordenadaDaRua(null), null);
  assert.equal(coordenadaDaRua(undefined), null);
});

test('objeto sem coordinates nem lat/lng vira null', () => {
  assert.equal(coordenadaDaRua({}), null);
});

test('coordinates vazio vira null, não NaN', () => {
  assert.equal(coordenadaDaRua({ coordinates: [] }), null);
});

test('coordenada em texto vira null — não é coagida a número', () => {
  assert.equal(coordenadaDaRua({ coordinates: ['-38.57', '-8.60'] }), null);
  assert.equal(coordenadaDaRua({ lat: '-8.60', lng: '-38.57' }), null);
});
