// Recência e confiança.
//   node --test src/test/recencia.test.mjs
//
// Três invariantes carregam o desenho:
//
//   • duas observações do MESMO vizinho não viram "duas independentes" — sem
//     isso, uma pessoa sozinha marca a rua como confirmada;
//   • "confirmado" vale ZERO na rota, por perto ou longe — mandar alguém a um
//     ponto já confirmado produz sensação de trabalho, não informação;
//   • conflito não é empate a ser desempatado por voto — vai para auditoria.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIRMADO,
  CONFLITO,
  JANELA_RECENCIA_DIAS,
  SEM_DADO,
  UMA_OBSERVACAO,
  VENCIDO,
  estadoDeRecencia,
  valorDaVisita,
  rotuloDeCobertura,
} from '../lib/recencia.js';

const AUTOR = 'u-autor';
const VIZINHO = 'u-vizinho';
const OUTRO = 'u-outro';

const AGORA = new Date('2026-09-30T12:00:00Z');
const diasAtras = (n) => new Date(AGORA.getTime() - n * 86400000).toISOString();

const bronca = (extra = {}) => ({ id: 'r1', author_id: AUTOR, ...extra });

const obs = (extra = {}) => ({
  author_id: VIZINHO,
  update_type: 'still_here',
  status: 'pending',
  created_at: diasAtras(3),
  ...extra,
});

const estado = (atualizacoes, report = bronca()) =>
  estadoDeRecencia({ report, atualizacoes, agora: AGORA });

// ── Os cinco estados ─────────────────────────────────────────────────────────

test('sem nenhuma observação, ninguém conferiu', () => {
  const e = estado([]);
  assert.equal(e.estado, SEM_DADO);
  assert.equal(e.diasDesdeUltima, null);
});

test('observação fora da janela vence o dado, não o apaga', () => {
  const e = estado([obs({ created_at: diasAtras(JANELA_RECENCIA_DIAS + 5) })]);
  assert.equal(e.estado, VENCIDO);
  assert.equal(e.diasDesdeUltima, JANELA_RECENCIA_DIAS + 5);
});

test('uma pessoa recente é uma observação, não confirmação', () => {
  assert.equal(estado([obs()]).estado, UMA_OBSERVACAO);
});

test('duas pessoas independentes confirmam', () => {
  const e = estado([obs(), obs({ author_id: OUTRO })]);
  assert.equal(e.estado, CONFIRMADO);
  assert.equal(e.observacoesRecentes, 2);
});

test('duas linhas do MESMO vizinho não viram duas pessoas', () => {
  const e = estado([obs({ created_at: diasAtras(10) }), obs({ created_at: diasAtras(2) })]);
  assert.equal(e.estado, UMA_OBSERVACAO);
  assert.equal(e.observacoesRecentes, 1);
});

test('"continua" e "acabou" na mesma janela é conflito', () => {
  const e = estado([obs(), obs({ author_id: OUTRO, update_type: 'solved' })]);
  assert.equal(e.estado, CONFLITO);
});

test('"está sendo resolvido" não contradiz nenhum dos dois', () => {
  const e = estado([obs(), obs({ author_id: OUTRO, update_type: 'being_solved' })]);
  assert.equal(e.estado, CONFIRMADO);
});

// ── Quem não conta ───────────────────────────────────────────────────────────

test('o autor não confere a própria bronca', () => {
  assert.equal(estado([obs({ author_id: AUTOR })]).estado, SEM_DADO);
});

test('quem completou o sinal também tem interesse', () => {
  const r = bronca({ completed_by: OUTRO });
  assert.equal(estado([obs({ author_id: OUTRO })], r).estado, SEM_DADO);
});

test('observação rejeitada não conta', () => {
  assert.equal(estado([obs({ status: 'rejected' })]).estado, SEM_DADO);
});

test('pendente de moderação conta, igual à 199', () => {
  assert.equal(estado([obs({ status: 'pending_moderation' })]).estado, UMA_OBSERVACAO);
});

// ── O valor da visita ────────────────────────────────────────────────────────

test('ponto confirmado vale zero mesmo na esquina', () => {
  const e = estado([obs(), obs({ author_id: OUTRO })]);
  assert.equal(valorDaVisita(e, 10), 0);
  assert.equal(valorDaVisita(e, 800), 0);
});

test('sem dado longe ainda vale mais que uma observação perto', () => {
  // É a decisão que separa "rota do dado mais necessário" de "rota do ponto
  // mais próximo". Se cair, a rota vira um passeio pelo quarteirão.
  const semDado = valorDaVisita(estado([]), 600);
  const umaObs = valorDaVisita(estado([obs()]), 150);

  assert.ok(semDado > umaObs, `${semDado} deveria superar ${umaObs}`);
});

test('a distância desempata, não decide', () => {
  // Mesmo estado, dois pontos nas pontas do alcance a pé: o mais perto vence,
  // mas por pouco. Uma queda maior que isso faria a rota virar um passeio pelo
  // quarteirão — que é o que o plano proíbe.
  const e = estado([]);
  const perto = valorDaVisita(e, 50);
  const longe = valorDaVisita(e, 800);

  assert.ok(perto > longe);
  assert.ok(longe > perto / 2, 'a distância está pesando demais');
});

test('conflito vale menos que vencido — mais uma observação não resolve', () => {
  const conflito = estado([obs(), obs({ author_id: OUTRO, update_type: 'solved' })]);
  const vencido = estado([obs({ created_at: diasAtras(60) })]);

  assert.ok(valorDaVisita(conflito, 200) < valorDaVisita(vencido, 200));
});

// ── O texto ──────────────────────────────────────────────────────────────────

test('a cobertura nunca anuncia onde ninguém está olhando', () => {
  for (const atualizacoes of [[], [obs({ created_at: diasAtras(90) })], [obs()]]) {
    const r = rotuloDeCobertura(estado(atualizacoes));
    assert.doesNotMatch(r.texto, /pouco patrulhada|sem vigilância|ninguém patrulha/i);
  }
});

test('conflito é anunciado como auditoria, não como dúvida do leitor', () => {
  const r = rotuloDeCobertura(estado([obs(), obs({ author_id: OUTRO, update_type: 'solved' })]));
  assert.match(r.texto, /auditoria/i);
});
