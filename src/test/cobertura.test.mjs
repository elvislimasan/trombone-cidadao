// Cobertura por trecho e meta comunitária.
//   node --test src/test/cobertura.test.mjs
//
// Quatro invariantes carregam a fase 3:
//
//   • uma observação isolada NÃO conta como cobertura — se contasse, uma pessoa
//     sozinha fecharia a meta de um bairro num sábado;
//   • sugestão enviada de longe não conta — senão o mapa vira enquete;
//   • a tela pública nunca aponta qual bairro está descoberto;
//   • o placar da meta não é ordenado por contribuição individual.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONFIRMADO,
  CONFLITO,
  JANELA_COBERTURA_DIAS,
  SEM_DADO,
  UMA_OBSERVACAO,
  VENCIDO,
  bairroMaisAtrasado,
  coberturaDaArea,
  estadoDeCobertura,
  rotuloPublico,
} from '../lib/cobertura.js';

import {
  FATOR_MAXIMO_DE_TAMANHO,
  participacao,
  progressoDaMeta,
  relatorioPublico,
  timesComparaveis,
} from '../lib/metaComunitaria.js';

const AGORA = new Date('2026-09-30T12:00:00Z');
const diasAtras = (n) => new Date(AGORA.getTime() - n * 86400000).toISOString();

const rua = (extra = {}) => ({ id: 'r1', status: 'unpaved', bairro_id: 'b1', ...extra });

const sug = (extra = {}) => ({
  user_id: 'u-a',
  street_id: 'r1',
  resposta: 'paved',
  status: 'pendente',
  local_confere: true,
  created_at: diasAtras(10),
  ...extra,
});

const estado = (sugestoes, r = rua()) =>
  estadoDeCobertura({ rua: r, sugestoes, agora: AGORA });

// ── Os estados ───────────────────────────────────────────────────────────────

test('rua sem sugestão nenhuma não tem dado', () => {
  assert.equal(estado([]).estado, SEM_DADO);
});

test('uma verificação recente ainda não é cobertura', () => {
  const e = estado([sug()]);
  assert.equal(e.estado, UMA_OBSERVACAO);
  assert.equal(e.contaComoCoberto, false);
});

test('duas pessoas concordando confirmam a rua', () => {
  const e = estado([sug(), sug({ user_id: 'u-b' })]);
  assert.equal(e.estado, CONFIRMADO);
  assert.equal(e.contaComoCoberto, true);
  assert.equal(e.respostaSustentada, 'paved');
});

test('duas pessoas discordando não é cobertura, é conflito', () => {
  const e = estado([sug(), sug({ user_id: 'u-b', resposta: 'unpaved' })]);
  assert.equal(e.estado, CONFLITO);
  assert.equal(e.contaComoCoberto, false);
  assert.equal(e.respostaSustentada, null);
});

test('a mesma pessoa duas vezes não confirma sozinha', () => {
  const e = estado([sug({ created_at: diasAtras(20) }), sug({ created_at: diasAtras(2) })]);
  assert.equal(e.estado, UMA_OBSERVACAO);
});

test('verificação antiga vence, e a janela do pavimento é longa', () => {
  // 28 dias marcaria como vencida uma classificação de dois meses — e encheria
  // a cidade de tarefa que não muda nada.
  assert.ok(JANELA_COBERTURA_DIAS >= 90);

  const e = estado([sug({ created_at: diasAtras(JANELA_COBERTURA_DIAS + 10) })]);
  assert.equal(e.estado, VENCIDO);
});

test('sugestão de longe não conta como observação', () => {
  assert.equal(estado([sug({ local_confere: false }), sug({ user_id: 'u-b' })]).estado, UMA_OBSERVACAO);
});

test('sugestão recusada não conta', () => {
  assert.equal(estado([sug({ status: 'recusada' })]).estado, SEM_DADO);
});

// ── A área ───────────────────────────────────────────────────────────────────

const area = () => [
  { rua: rua({ id: 'a' }), sugestoes: [sug({ street_id: 'a' }), sug({ street_id: 'a', user_id: 'u-b' })] },
  { rua: rua({ id: 'b' }), sugestoes: [sug({ street_id: 'b' })] },
  { rua: rua({ id: 'c', bairro_id: 'b2' }), sugestoes: [] },
  { rua: rua({ id: 'd', bairro_id: 'b2' }), sugestoes: [] },
];

test('a cobertura conta só as confirmadas', () => {
  const c = coberturaDaArea(area(), AGORA);
  assert.equal(c.total, 4);
  assert.equal(c.cobertos, 1);
  assert.match(c.rotulo, /1 de 4/);
});

test('o que falta vem ordenado por necessidade', () => {
  const c = coberturaDaArea(area(), AGORA);
  // Sem dado antes de uma observação: é onde a ida à rua produz mais.
  assert.equal(c.faltando[0].estado.estado, SEM_DADO);
  assert.equal(c.faltando.at(-1).estado.estado, UMA_OBSERVACAO);
});

test('o recorte por bairro existe — a guarda de equidade da §36.15', () => {
  const c = coberturaDaArea(area(), AGORA);
  const b1 = c.porBairro.find((b) => b.bairroId === 'b1');
  const b2 = c.porBairro.find((b) => b.bairroId === 'b2');

  assert.equal(b1.cobertos, 1);
  assert.equal(b2.cobertos, 0);
});

test('área vazia não divide por zero', () => {
  const c = coberturaDaArea([], AGORA);
  assert.equal(c.fracao, 0);
  assert.equal(c.total, 0);
});

// ── O que pode ser dito em público ───────────────────────────────────────────

test('o rótulo público nunca aponta bairro descoberto', () => {
  const c = coberturaDaArea(area(), AGORA);
  const r = rotuloPublico(c);

  assert.doesNotMatch(r.texto, /bairro|pouco patrulhad|sem vigilância|ninguém/i);
  assert.match(r.texto, /faltam 3/);
});

test('o bairro atrasado existe para a moderação, não para a tela', () => {
  // A função existe (o critério de liberação de fase precisa dela) e exige
  // massa mínima: um bairro com duas ruas não é um sinal, é ruído.
  const c = coberturaDaArea(area(), AGORA);
  assert.equal(bairroMaisAtrasado(c), null);
});

test('cobertura total muda o texto para o caso feliz', () => {
  const todas = [
    { rua: rua({ id: 'a' }), sugestoes: [sug({ street_id: 'a' }), sug({ street_id: 'a', user_id: 'u-b' })] },
  ];
  assert.match(rotuloPublico(coberturaDaArea(todas, AGORA)).texto, /Todas as 1/);
});

// ── A meta ───────────────────────────────────────────────────────────────────

const meta = (extra = {}) => ({ titulo: 'Entorno das escolas', alvo_percentual: 80, ...extra });

test('a barra mede o caminho até o ALVO, não até 100%', () => {
  // Quatro ruas, alvo 80% → 4 ruas (arredonda para cima). Com 1 coberta, 25%.
  const p = progressoDaMeta(meta(), area(), AGORA);
  assert.equal(p.ruasParaAlvo, 4);
  assert.equal(p.fracao, 0.25);
});

test('meta de 80% cumprida com 80% não continua devendo', () => {
  const cinco = Array.from({ length: 5 }, (_, i) => ({
    rua: rua({ id: `r${i}` }),
    sugestoes:
      i < 4
        ? [sug({ street_id: `r${i}` }), sug({ street_id: `r${i}`, user_id: 'u-b' })]
        : [],
  }));

  const p = progressoDaMeta(meta(), cinco, AGORA);
  assert.equal(p.atingida, true);
  assert.equal(p.faltamParaAlvo, 0);
  assert.equal(p.fracao, 1);
});

test('participação não é ranking', () => {
  const ps = participacao([
    sug({ user_id: 'u-b', street_id: 'a', autor: { name: 'Zeca' } }),
    sug({ user_id: 'u-b', street_id: 'b', autor: { name: 'Zeca' } }),
    sug({ user_id: 'u-a', street_id: 'a', autor: { name: 'Ana' } }),
  ]);

  // Zeca fez mais e aparece depois: a ordem é alfabética de propósito.
  assert.deepEqual(ps.map((p) => p.nome), ['Ana', 'Zeca']);
  assert.equal(ps[1].ruas, 2);
});

test('a mesma rua duas vezes não vira duas contribuições', () => {
  const ps = participacao([
    sug({ user_id: 'u-a', street_id: 'a' }),
    sug({ user_id: 'u-a', street_id: 'a' }),
  ]);
  assert.equal(ps[0].ruas, 1);
});

// ── Comparação entre times ───────────────────────────────────────────────────

test('times de tamanhos muito diferentes não são comparados', () => {
  const r = timesComparaveis([
    { id: 'a', totalDeRuas: 20 },
    { id: 'b', totalDeRuas: 20 * FATOR_MAXIMO_DE_TAMANHO + 1 },
  ]);

  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'tamanhos');
  assert.match(r.texto, /tamanho do bairro/i);
});

test('times comparáveis passam', () => {
  assert.equal(
    timesComparaveis([{ id: 'a', totalDeRuas: 20 }, { id: 'b', totalDeRuas: 30 }]).ok,
    true
  );
});

test('um time só não é comparação', () => {
  assert.equal(timesComparaveis([{ id: 'a', totalDeRuas: 20 }]).ok, false);
});

// ── O relatório público ──────────────────────────────────────────────────────

test('sem registro de uso, o relatório DIZ que não há', () => {
  const p = progressoDaMeta(meta(), area(), AGORA);
  const r = relatorioPublico({ meta: meta(), progresso: p, participantes: [{ userId: 'u-a' }] });

  assert.match(r.usado.texto, /ainda não há registro de uso/i);
});

test('com uso registrado, o relatório mostra o uso', () => {
  const p = progressoDaMeta(meta(), area(), AGORA);
  const r = relatorioPublico({
    meta: meta(),
    progresso: p,
    uso: { texto: 'A lista foi entregue à Secretaria de Obras em 12/10.' },
  });

  assert.match(r.usado.texto, /Secretaria de Obras/);
});

test('o relatório conta ruas confirmadas, não sugestões enviadas', () => {
  const p = progressoDaMeta(meta(), area(), AGORA);
  const r = relatorioPublico({ meta: meta(), progresso: p, participantes: [] });

  assert.equal(r.produzido.ruasVerificadas, 1);
  assert.equal(r.produzido.ruasNaArea, 4);
});
