// Confirmação cruzada da resolução.
//   node --test src/test/resolution.test.mjs
//
// Dois testes importam mais que todos os outros, e são opostos:
//
//   • parte interessada NÃO confirma a própria resolução — se cair, a
//     verificação carimba exatamente o que ela existe para checar;
//   • moderação FECHA sozinha — se cair, o embaixador perde o poder de
//     encerrar a bronca e a operação da cidade trava.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  QUORUM_CONFIRMACOES,
  VIA_MODERACAO,
  VIA_COMUNIDADE,
  VIA_REGISTRO,
  estadoDaResolucao,
  podeConfirmarResolucao,
  rotuloDaVerificacao,
} from '../lib/resolution.js';

const AUTOR = 'u-autor';
const VIZINHO = 'u-vizinho';
const OUTRO = 'u-outro';
const PREFEITURA = 'u-moderador';

const bronca = (extra = {}) => ({
  id: 'r1',
  author_id: AUTOR,
  completed_by: null,
  status: 'pending',
  ...extra,
});

const resolvido = (author_id, extra = {}) => ({
  author_id,
  update_type: 'solved',
  status: 'pending',
  created_at: '2026-08-01T12:00:00Z',
  ...extra,
});

const comModeracao = { moderadores: [PREFEITURA] };

// ── Moderação fecha sozinha ───────────────────────────────────────────────────

test('a moderação resolve com uma só confirmação', () => {
  // A regra de admin não mudou: é o que enviarAtualizacaoDeBronca já faz hoje.
  const e = estadoDaResolucao(bronca(), [resolvido(PREFEITURA)], comModeracao);
  assert.equal(e.estado, 'verificada');
  assert.equal(e.via, VIA_MODERACAO);
});

test('a moderação não precisa de quórum nenhum', () => {
  const e = estadoDaResolucao(bronca(), [resolvido(PREFEITURA)], comModeracao);
  assert.equal(e.confirmacoes, 0);
  assert.equal(e.estado, 'verificada');
});

test('admin que também é autor fecha como admin', () => {
  // A autoridade é do papel, não da relação com o registro.
  const e = estadoDaResolucao(
    bronca({ author_id: PREFEITURA }),
    [resolvido(PREFEITURA)],
    comModeracao
  );
  assert.equal(e.estado, 'verificada');
  assert.equal(e.via, VIA_MODERACAO);
});

test('sem lista de moderadores, ninguém tem poder especial', () => {
  // A tela que não sabe quem é admin não pode inventar que alguém é.
  const e = estadoDaResolucao(bronca(), [resolvido(PREFEITURA)]);
  assert.equal(e.estado, 'em_verificacao');
  assert.equal(e.confirmacoes, 1);
});

// ── Parte interessada não se autoconfirma ─────────────────────────────────────

test('o autor não confirma a própria resolução', () => {
  const e = estadoDaResolucao(bronca(), [resolvido(AUTOR)]);
  assert.equal(e.confirmacoes, 0);
  assert.equal(e.estado, 'em_verificacao');
  assert.equal(e.reivindicadaPor, 'autor');
});

test('quem completou o sinal também é parte interessada', () => {
  const e = estadoDaResolucao(bronca({ completed_by: OUTRO }), [resolvido(OUTRO)]);
  assert.equal(e.confirmacoes, 0);
});

// ── O quórum comunitário ──────────────────────────────────────────────────────

test('duas pessoas independentes fecham a bronca', () => {
  const e = estadoDaResolucao(bronca(), [
    resolvido(AUTOR),
    resolvido(VIZINHO),
    resolvido(OUTRO),
  ]);
  assert.equal(e.confirmacoes, 2);
  assert.equal(e.estado, 'verificada');
  assert.equal(e.via, VIA_COMUNIDADE);
  assert.equal(e.faltam, 0);
});

test('uma confirmação sozinha não fecha', () => {
  const e = estadoDaResolucao(bronca(), [resolvido(VIZINHO)]);
  assert.equal(e.confirmacoes, 1);
  assert.equal(e.estado, 'em_verificacao');
  assert.equal(e.faltam, QUORUM_CONFIRMACOES - 1);
});

test('a mesma pessoa confirmando duas vezes conta uma', () => {
  // A policy de 7 dias permite reenvio; sem o Set, o quórum cairia sozinho.
  const e = estadoDaResolucao(bronca(), [
    resolvido(VIZINHO, { created_at: '2026-08-01T12:00:00Z' }),
    resolvido(VIZINHO, { created_at: '2026-08-09T12:00:00Z' }),
  ]);
  assert.equal(e.confirmacoes, 1);
  assert.equal(e.estado, 'em_verificacao');
});

test('atualização rejeitada não conta', () => {
  const e = estadoDaResolucao(bronca(), [
    resolvido(VIZINHO, { status: 'rejected' }),
    resolvido(OUTRO),
  ]);
  assert.equal(e.confirmacoes, 1);
});

test('atualização pendente de moderação CONTA', () => {
  // Mesmo critério da 185: ignorá-la faria a barra andar para trás enquanto o
  // moderador não chegasse.
  const e = estadoDaResolucao(bronca(), [
    resolvido(VIZINHO, { status: 'pending_moderation' }),
    resolvido(OUTRO, { status: 'pending_moderation' }),
  ]);
  assert.equal(e.estado, 'verificada');
});

test('"ainda está aqui" não é confirmação de resolução', () => {
  const e = estadoDaResolucao(bronca(), [
    { author_id: VIZINHO, update_type: 'still_here', status: 'pending' },
    { author_id: OUTRO, update_type: 'being_solved', status: 'pending' },
  ]);
  assert.equal(e.confirmacoes, 0);
  assert.equal(e.estado, 'aberta');
});

// ── Estados ───────────────────────────────────────────────────────────────────

test('bronca sem nenhuma fala sobre o fim fica aberta', () => {
  const e = estadoDaResolucao(bronca(), []);
  assert.equal(e.estado, 'aberta');
  assert.equal(e.via, null);
  assert.equal(e.reivindicada, false);
});

test('pending_resolution já conta como reivindicada', () => {
  // É o status que o app grava desde a 104 quando alguém diz "resolvido".
  const e = estadoDaResolucao(bronca({ status: 'pending_resolution' }), []);
  assert.equal(e.estado, 'em_verificacao');
});

test('bronca já resolvida no banco continua resolvida', () => {
  // As antigas não têm confirmação nenhuma. Reabri-las em massa por causa de um
  // critério novo seria reescrever o passado.
  const e = estadoDaResolucao(bronca({ status: 'resolved' }), []);
  assert.equal(e.estado, 'verificada');
  assert.equal(e.via, VIA_REGISTRO);
});

test('lista ausente não quebra', () => {
  assert.equal(estadoDaResolucao(bronca()).estado, 'aberta');
  assert.equal(estadoDaResolucao(bronca(), null).estado, 'aberta');
});

test('atualização sem autor é ignorada', () => {
  const e = estadoDaResolucao(bronca(), [resolvido(null), resolvido(undefined)]);
  assert.equal(e.confirmacoes, 0);
});

// ── Quem pode confirmar ───────────────────────────────────────────────────────

test('o botão não aparece para o autor', () => {
  // Botão que aparece e depois recusa é pior que botão nenhum (185).
  assert.equal(podeConfirmarResolucao({ id: AUTOR }, bronca(), []), false);
});

test('o admin sempre pode fechar, mesmo sendo o autor', () => {
  assert.equal(
    podeConfirmarResolucao({ id: AUTOR, is_admin: true }, bronca(), []),
    true
  );
});

test('o botão aparece para um vizinho', () => {
  assert.equal(podeConfirmarResolucao({ id: VIZINHO }, bronca(), []), true);
});

test('não aparece duas vezes para quem já confirmou', () => {
  const ups = [resolvido(VIZINHO)];
  assert.equal(podeConfirmarResolucao({ id: VIZINHO }, bronca(), ups), false);
  assert.equal(podeConfirmarResolucao({ id: OUTRO }, bronca(), ups), true);
});

test('não aparece em bronca já resolvida', () => {
  assert.equal(
    podeConfirmarResolucao({ id: VIZINHO }, bronca({ status: 'resolved' }), []),
    false
  );
});

test('visitante deslogado não confirma', () => {
  assert.equal(podeConfirmarResolucao(null, bronca(), []), false);
  assert.equal(podeConfirmarResolucao({}, bronca(), []), false);
});

// ── Rótulo ────────────────────────────────────────────────────────────────────

test('bronca aberta não ganha faixa de verificação', () => {
  assert.equal(rotuloDaVerificacao(estadoDaResolucao(bronca(), [])), null);
});

test('a faixa diz quantas faltam, no singular quando é uma', () => {
  const r = rotuloDaVerificacao(estadoDaResolucao(bronca(), [resolvido(VIZINHO)]));
  assert.match(r.detalhe, /Falta 1 confirmação/);
});

test('fechada pela moderação tem redação própria', () => {
  const e = estadoDaResolucao(bronca(), [resolvido(PREFEITURA)], comModeracao);
  assert.match(rotuloDaVerificacao(e).detalhe, /moderação/i);
});

test('fechada pela comunidade diz quantas pessoas foram ao local', () => {
  const e = estadoDaResolucao(bronca(), [resolvido(VIZINHO), resolvido(OUTRO)]);
  const r = rotuloDaVerificacao(e);
  assert.equal(r.tom, 'resolvido');
  assert.match(r.detalhe, /2 pessoas/);
});

test('rótulo de estado ausente não quebra', () => {
  assert.equal(rotuloDaVerificacao(null), null);
});
