// Quilômetros de rua por situação.
//   node --test src/test/pavementLength.test.mjs
//
// O erro que este arquivo existe para impedir é o mais silencioso de todos: uma
// soma que parece certa e está subestimada. Rua sem traçado não tem extensão
// ZERO — tem extensão desconhecida —, e tratar as duas coisas como a mesma faz
// o painel afirmar "43 km da cidade" quando são 43 km do que já foi traçado.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  extensaoDaRua,
  formatarKm,
  percentual,
  resumoDeExtensao,
  resumoPorBairro,
} from '../lib/pavementLength.js';

// Floresta-PE. 0,001° de latitude ≈ 111,2 m.
const LAT = -8.6;
const LNG = -38.57;
/** Uma rua reta de `metros` para o norte. */
const rua = (metros, extra = {}) => ({
  status: 'paved',
  path: { coordinates: [[[LNG, LAT], [LNG, LAT + metros / 111320]]] },
  ...extra,
});
const semTracado = (extra = {}) => ({ status: 'paved', path: null, ...extra });

// ── Extensão de uma rua ─────────────────────────────────────────────────────

test('mede uma linha reta', () => {
  assert.ok(Math.abs(extensaoDaRua(rua(500)) - 500) < 5);
});

test('soma os trechos de uma rua partida, sem emendar o vão entre eles', () => {
  // Duas linhas de ~100 m separadas por um vão de ~800 m — a praça que corta a
  // rua. O total é 200, não 1000: o vão não é rua.
  const partida = {
    path: { coordinates: [
      [[LNG, LAT], [LNG, LAT + 100 / 111320]],
      [[LNG, LAT + 900 / 111320], [LNG, LAT + 1000 / 111320]],
    ] },
  };
  assert.ok(Math.abs(extensaoDaRua(partida) - 200) < 5, `veio ${extensaoDaRua(partida)}`);
});

test('rua sem traçado mede zero, e não quebra', () => {
  assert.equal(extensaoDaRua(semTracado()), 0);
  assert.equal(extensaoDaRua({}), 0);
  assert.equal(extensaoDaRua(null), 0);
});

test('coordenada torta é ignorada em vez de virar NaN', () => {
  const torta = { path: { coordinates: [[[LNG, LAT], [null, 'x'], [LNG, LAT + 0.001]]] } };
  const medida = extensaoDaRua(torta);
  assert.ok(Number.isFinite(medida), 'a medida virou NaN');
});

// ── Resumo ──────────────────────────────────────────────────────────────────

test('soma por situação', () => {
  const r = resumoDeExtensao([
    rua(1000, { status: 'paved' }),
    rua(500, { status: 'unpaved' }),
    rua(500, { status: 'partially_paved' }),
  ]);
  assert.ok(Math.abs(r.metros - 2000) < 15);
  assert.ok(Math.abs(r.porSituacao.paved - 1000) < 10);
  assert.ok(Math.abs(r.porSituacao.unpaved - 500) < 10);
  assert.equal(r.ruas, 3);
});

test('status desconhecido cai em "unknown" em vez de sumir da soma', () => {
  // Somar só as três situações conhecidas faria o total das partes ser menor
  // que o total, e a diferença desapareceria sem explicação.
  const r = resumoDeExtensao([rua(300, { status: 'bizarro' })]);
  assert.ok(Math.abs(r.porSituacao.unknown - 300) < 5);
  assert.ok(Math.abs(r.metros - 300) < 5);
});

test('conta separadamente as ruas sem traçado', () => {
  const r = resumoDeExtensao([rua(1000), semTracado(), semTracado()]);
  assert.equal(r.ruas, 3);
  assert.equal(r.ruasSemTracado, 2);
  assert.equal(r.temTracado, true);
});

test('sem nenhum traçado, `temTracado` é falso — a tela mostra contagem, não km', () => {
  const r = resumoDeExtensao([semTracado(), semTracado()]);
  assert.equal(r.temTracado, false);
  assert.equal(r.metros, 0);
  assert.equal(r.ruas, 2);
});

test('lista vazia devolve um resumo zerado, não undefined', () => {
  const r = resumoDeExtensao([]);
  assert.equal(r.metros, 0);
  assert.equal(r.ruas, 0);
  assert.equal(r.temTracado, false);
});

// ── Por bairro ──────────────────────────────────────────────────────────────

test('agrupa por bairro e ordena do mais extenso para o menos', () => {
  const lista = [
    rua(500, { bairro_id: 'a', bairro: { name: 'Centro' } }),
    rua(2000, { bairro_id: 'b', bairro: { name: 'São Cristóvão' } }),
    rua(500, { bairro_id: 'a', bairro: { name: 'Centro' } }),
  ];
  const porBairro = resumoPorBairro(lista);
  assert.equal(porBairro.length, 2);
  assert.equal(porBairro[0].nome, 'São Cristóvão');
  assert.equal(porBairro[1].nome, 'Centro');
  assert.ok(Math.abs(porBairro[1].metros - 1000) < 10);
});

test('rua sem bairro forma grupo próprio em vez de sumir', () => {
  // O bairro virou opcional. Descartar essas ruas faria o somatório dos bairros
  // não bater com o total da cidade, e ninguém saberia por quê.
  const porBairro = resumoPorBairro([rua(400), rua(100, { bairro_id: 'a', bairro: { name: 'Centro' } })]);
  const semBairro = porBairro.find((b) => b.id === 'sem-bairro');
  assert.ok(semBairro, 'as ruas sem bairro sumiram');
  assert.ok(Math.abs(semBairro.metros - 400) < 5);
});

// ── Formatação ──────────────────────────────────────────────────────────────

test('km com uma casa e vírgula', () => {
  assert.equal(formatarKm(68400), '68,4 km');
  assert.equal(formatarKm(0), '0,0 km');
  // 950 m dá "0,9 km", e não "1,0": (0.95).toFixed(1) é "0.9" porque 0,95 não
  // existe exato em ponto flutuante. Fixado aqui para o comportamento ser
  // escolhido em vez de descoberto no dia em que alguém estranhar o painel.
  assert.equal(formatarKm(950), '0,9 km');
  assert.equal(formatarKm(1050), '1,1 km');
});

test('valor inválido não vira "NaN km"', () => {
  assert.equal(formatarKm(undefined), '0,0 km');
  assert.equal(formatarKm(-10), '0,0 km');
});

test('percentual arredonda e não divide por zero', () => {
  assert.equal(percentual(436, 684), 64);
  assert.equal(percentual(0, 0), 0);
  assert.equal(percentual(10, 0), 0);
});
