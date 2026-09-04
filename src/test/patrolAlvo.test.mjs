// Para onde a patrulha aponta.
//   node --test src/test/patrolAlvo.test.mjs
//
// A parte perigosa não é achar o mais próximo — é NÃO trocar de alvo a cada
// leitura de GPS. Com dois sinais quase à mesma distância, um "sempre o mais
// próximo" ingênuo faz a seta girar e a distância pular a cada segundo,
// justamente quando há mais de uma coisa para fazer por perto.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TROCA_MINIMA_M,
  escolherAlvo,
  formatarDistancia,
  rumoRelativo,
} from '../lib/patrolAlvo.js';

// Floresta-PE. ~111 m por 0,001° de latitude.
const AQUI = { lat: -8.6000, lng: -38.5700, heading: 0 };
const norte = (metros, id) => ({ id, lat: AQUI.lat + metros / 111320, lng: AQUI.lng });

// ── Escolha ─────────────────────────────────────────────────────────────────

test('sem alvo anterior, escolhe o mais próximo', () => {
  const alvo = escolherAlvo(AQUI, [norte(300, 'longe'), norte(100, 'perto')]);
  assert.equal(alvo.id, 'perto');
  assert.ok(Math.abs(alvo.distancia - 100) < 2);
});

test('lista vazia não tem alvo', () => {
  assert.equal(escolherAlvo(AQUI, []), null);
  assert.equal(escolherAlvo(AQUI, null), null);
});

test('sem posição não há alvo', () => {
  assert.equal(escolherAlvo(null, [norte(100, 'a')]), null);
  assert.equal(escolherAlvo({ lat: NaN, lng: NaN }, [norte(100, 'a')]), null);
});

test('sinal sem coordenada é ignorado em vez de quebrar', () => {
  const alvo = escolherAlvo(AQUI, [{ id: 'torto' }, norte(100, 'bom')]);
  assert.equal(alvo.id, 'bom');
});

// ── Inércia: o que impede a seta de girar ───────────────────────────────────

test('o alvo atual continua escolhido quando o outro é só um pouco mais perto', () => {
  // 'b' está 20 m mais perto — dentro do ruído do GPS urbano. Trocar aqui é
  // exatamente o que faz a seta oscilar entre os dois a cada segundo.
  const atual = { id: 'a' };
  const alvo = escolherAlvo(AQUI, [norte(100, 'a'), norte(80, 'b')], atual);
  assert.equal(alvo.id, 'a');
});

test('o alvo troca quando o outro está MUITO mais perto', () => {
  const atual = { id: 'a' };
  const alvo = escolherAlvo(AQUI, [norte(200, 'a'), norte(100, 'b')], atual);
  assert.equal(alvo.id, 'b');
});

test('a troca acontece dos dois lados da margem, não no fio da navalha', () => {
  // A margem é TROCA_MINIMA_M. Testar o limite ao milímetro seria testar o
  // arredondamento do haversine, não o comportamento — e ninguém depende de
  // 40,0 m contra 39,9 m. O que importa é: claramente acima troca, claramente
  // abaixo não.
  const atual = { id: 'a' };

  const acima = escolherAlvo(AQUI, [norte(200, 'a'), norte(200 - TROCA_MINIMA_M - 5, 'b')], atual);
  assert.equal(acima.id, 'b');

  const abaixo = escolherAlvo(AQUI, [norte(200, 'a'), norte(200 - TROCA_MINIMA_M + 5, 'b')], atual);
  assert.equal(abaixo.id, 'a');
});

test('alvo que saiu da lista é substituído pelo mais próximo', () => {
  // Registrado, descartado, ou fora do corredor: apontar para ele seria
  // apontar para nada.
  const alvo = escolherAlvo(AQUI, [norte(300, 'x'), norte(500, 'y')], { id: 'sumiu' });
  assert.equal(alvo.id, 'x');
});

test('afastar-se do alvo atual não o troca sozinho', () => {
  // Andar para longe de 'a' sem que 'b' fique 40 m mais perto mantém 'a'.
  const atual = { id: 'a' };
  const alvo = escolherAlvo(AQUI, [norte(150, 'a'), norte(130, 'b')], atual);
  assert.equal(alvo.id, 'a');
});

test('o alvo devolvido sempre traz a distância atual', () => {
  const alvo = escolherAlvo(AQUI, [norte(250, 'a')], { id: 'a' });
  assert.ok(Math.abs(alvo.distancia - 250) < 3);
});

// ── Rumo relativo ───────────────────────────────────────────────────────────

test('alvo à frente dá zero', () => {
  const r = rumoRelativo({ ...AQUI, heading: 0 }, norte(100, 'a'));
  assert.ok(Math.abs(r) < 1, `esperava ~0, veio ${r}`);
});

test('indo para o norte, alvo ao norte continua à frente', () => {
  // E indo para o LESTE, o mesmo alvo passa a estar à esquerda (-90).
  const r = rumoRelativo({ ...AQUI, heading: 90 }, norte(100, 'a'));
  assert.ok(Math.abs(r + 90) < 1, `esperava ~-90, veio ${r}`);
});

test('a volta longa nunca acontece: o rumo fica entre -180 e 180', () => {
  for (const heading of [0, 45, 90, 180, 270, 359]) {
    const r = rumoRelativo({ ...AQUI, heading }, norte(100, 'a'));
    // -180 é resposta legítima: o alvo está exatamente atrás.
    assert.ok(r >= -180 && r <= 180, `heading ${heading} deu ${r}`);
  }
});

test('sem rumo do GPS não há seta', () => {
  // Parado, o GPS não sabe para onde a pessoa aponta. Uma seta chutada é pior
  // que nenhuma — o painel mostra só a distância.
  assert.equal(rumoRelativo({ ...AQUI, heading: null }, norte(100, 'a')), null);
  assert.equal(rumoRelativo({ ...AQUI, heading: NaN }, norte(100, 'a')), null);
});

test('sem alvo ou sem posição não há rumo', () => {
  assert.equal(rumoRelativo(AQUI, null), null);
  assert.equal(rumoRelativo(null, norte(100, 'a')), null);
});

// ── Distância na tela ───────────────────────────────────────────────────────

test('abaixo de 1 km sai em metros inteiros', () => {
  assert.equal(formatarDistancia(0), '0 m');
  assert.equal(formatarDistancia(87.4), '87 m');
  assert.equal(formatarDistancia(999), '999 m');
});

test('de 1 km em diante sai em km com vírgula', () => {
  assert.equal(formatarDistancia(1000), '1,0 km');
  assert.equal(formatarDistancia(2450), '2,5 km');
});

test('valor inválido não vira "NaN m" na tela', () => {
  assert.equal(formatarDistancia(undefined), '');
  assert.equal(formatarDistancia(-5), '');
});

test('alvo exatamente atrás dá -180, e isso é uma resposta e não um erro', () => {
  const r = rumoRelativo({ ...AQUI, heading: 180 }, norte(100, 'a'));
  assert.equal(Math.round(r), -180);
});
