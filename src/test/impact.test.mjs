// Pontos de Impacto — a moeda que só existe quando a bronca fecha.
//   node --test src/test/impact.test.mjs
//
// O risco que estes testes guardam é conceitual, não aritmético: o Impacto
// voltar a ser pago por esforço. Basta alguém acrescentar um contador de
// "broncas registradas" à lista de PAPEIS para a moeda nova virar uma cópia do
// XP com outro nome — e o problema que ela existe para corrigir volta em
// silêncio, sem nenhum teste de soma falhar.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPACTO,
  PAPEIS,
  SELOS,
  creditosDe,
  impactoDe,
  resolvidasDe,
  seloDe,
  proximoSelo,
  placarDeImpacto,
  impactoGanho,
  fraseDaResolucao,
} from '../lib/impact.js';

// ── A invariante ──────────────────────────────────────────────────────────────

test('todo papel paga sobre bronca RESOLVIDA', () => {
  for (const p of PAPEIS) {
    assert.ok(
      p.contador.startsWith('resolvidas_'),
      `${p.id} lê "${p.contador}", que não é um contador de resolução`
    );
  }
});

test('sem nenhuma resolução, o impacto é zero', () => {
  // Uma pessoa que registrou 200 broncas e não viu nenhuma fechar tem XP alto
  // e impacto zero. É o comportamento correto, e é o ponto da separação.
  assert.equal(impactoDe({ reports_count: 200, signals_count: 500 }), 0);
});

test('contadores ausentes não viram NaN', () => {
  assert.equal(impactoDe(), 0);
  assert.equal(impactoDe({}), 0);
  assert.equal(impactoDe({ resolvidas_autor: null }), 0);
  assert.equal(impactoDe({ resolvidas_autor: 'x' }), 0);
});

test('valor negativo não vira crédito', () => {
  assert.equal(impactoDe({ resolvidas_autor: -5 }), 0);
});

// ── A escala ──────────────────────────────────────────────────────────────────

test('consertar pesa mais que registrar', () => {
  // Se o impacto de uma resolução fosse menor que os 10 XP de uma bronca, a
  // moeda nova não mudaria incentivo nenhum.
  assert.ok(IMPACTO.autor > 10);
});

test('ir ao local confirmar vale mais que comentar de casa', () => {
  assert.ok(IMPACTO.confirmacao > IMPACTO.comentario);
  assert.ok(IMPACTO.comentario > IMPACTO.apoio);
});

test('completar o sinal de outro empata com registrar do zero', () => {
  assert.equal(IMPACTO.missao, IMPACTO.autor);
});

test('soma cada papel pelo peso dele', () => {
  const c = {
    resolvidas_autor: 2,        // 50
    resolvidas_confirmadas: 3,  // 45
    resolvidas_apoiadas: 4,     // 12
  };
  assert.equal(impactoDe(c), 107);
});

// ── Detalhamento ──────────────────────────────────────────────────────────────

test('creditosDe devolve todos os papéis, inclusive zerados', () => {
  // A tela de "como ganho impacto" mostra a lista inteira; quem quer só o que
  // somou filtra. O contrário obrigaria duas funções.
  assert.equal(creditosDe({}).length, PAPEIS.length);
});

test('o placar mostra só o que somou', () => {
  const p = placarDeImpacto({ resolvidas_autor: 1 });
  assert.equal(p.creditos.length, 1);
  assert.equal(p.creditos[0].id, 'autor');
  assert.equal(p.impacto, IMPACTO.autor);
});

test('resolvidas não é a soma dos papéis', () => {
  // A mesma bronca pode contar como autoria E como confirmação. Somar diria
  // "você resolveu 2" para uma resolução só.
  assert.equal(resolvidasDe({ resolvidas_autor: 1, resolvidas_confirmadas: 1 }), 1);
});

test('o distinto do banco tem precedência sobre a estimativa', () => {
  const c = { resolvidas_autor: 3, resolvidas_confirmadas: 2, resolvidas_total: 4 };
  assert.equal(resolvidasDe(c), 4);
});

// ── Selos ─────────────────────────────────────────────────────────────────────

test('o primeiro selo chega com uma bronca resolvida', () => {
  assert.equal(seloDe(IMPACTO.autor).id, 'semente');
});

test('sem impacto nenhum não há selo', () => {
  assert.equal(seloDe(0).id, 'nenhum');
});

test('as faixas estão em ordem decrescente', () => {
  // `seloDe` pega a primeira que couber — fora de ordem, todo mundo vira
  // "Referência da cidade".
  for (let i = 1; i < SELOS.length; i += 1) {
    assert.ok(
      SELOS[i - 1].minimo > SELOS[i].minimo,
      `${SELOS[i - 1].id} deveria exigir mais que ${SELOS[i].id}`
    );
  }
});

test('o topo não tem próximo selo', () => {
  assert.equal(proximoSelo(99999), null);
});

test('a fração mede o trecho atual, não o caminho inteiro', () => {
  // Mesma regra da escada de missões: quem acabou de entrar numa faixa vê a
  // barra vazia, não quase cheia por causa do que já fez.
  const p = proximoSelo(120);
  assert.equal(p.id, 'transformador');
  assert.equal(p.fracao, 0);
  assert.equal(p.faltam, 280);
});

// ── O que mudou ───────────────────────────────────────────────────────────────

test('sem foto anterior, não inventa ganho', () => {
  assert.equal(impactoGanho(null, { resolvidas_autor: 3 }), null);
});

test('sem mudança, não há o que comemorar', () => {
  assert.equal(impactoGanho({ resolvidas_autor: 3 }, { resolvidas_autor: 3 }), null);
});

test('conta o ganho e diz de onde veio', () => {
  const g = impactoGanho({ resolvidas_confirmadas: 0 }, { resolvidas_confirmadas: 3 });
  assert.equal(g.total, 3 * IMPACTO.confirmacao);
  assert.equal(g.por[0].id, 'confirmacao');
  assert.equal(g.por[0].quantidade, 3);
});

test('o maior ganho ganha a vez na tela', () => {
  const g = impactoGanho({}, { resolvidas_apoiadas: 1, resolvidas_autor: 1 });
  assert.equal(g.por[0].id, 'autor');
});

test('avisa quando o selo subiu', () => {
  const g = impactoGanho({}, { resolvidas_autor: 1 });
  assert.equal(g.subiuDeSelo, true);
  assert.equal(g.selo.id, 'semente');
});

test('ganho sem troca de selo não anuncia selo novo', () => {
  const g = impactoGanho({ resolvidas_autor: 1 }, { resolvidas_autor: 2 });
  assert.equal(g.subiuDeSelo, false);
});

// ── A frase ───────────────────────────────────────────────────────────────────

test('a frase nomeia quantas pessoas fizeram junto', () => {
  const f = fraseDaResolucao({
    endereco: 'Rua Frei Caneca',
    participantes: 12,
    pontos: 40,
  });
  assert.match(f.titulo, /Rua Frei Caneca/);
  assert.match(f.corpo, /mais 11 pessoas/);
  assert.match(f.corpo, /\+40/);
});

test('uma pessoa só não vira "e mais 0 pessoas"', () => {
  const f = fraseDaResolucao({ endereco: 'Rua X', participantes: 1, pontos: 25 });
  assert.match(f.corpo, /Você fez isso acontecer/);
});

test('duas pessoas usam o singular', () => {
  const f = fraseDaResolucao({ endereco: 'Rua X', participantes: 2 });
  assert.match(f.corpo, /mais 1 pessoa\b/);
});

test('sem pontos, a frase não promete crédito', () => {
  const f = fraseDaResolucao({ endereco: 'Rua X', participantes: 3, pontos: 0 });
  assert.ok(!f.corpo.includes('+'));
});

test('sem endereço, ainda sai uma frase legível', () => {
  const f = fraseDaResolucao({ participantes: 2 });
  assert.ok(f.titulo.length > 0);
  assert.ok(!f.titulo.includes('undefined'));
});
