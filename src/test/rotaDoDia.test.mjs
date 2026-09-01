// A Rota do Dia — piloto a pé.
//   node --test src/test/rotaDoDia.test.mjs
//
// As invariantes do piloto (§36.6, Aposta 3) estão aqui porque são exatamente
// as que somem numa refatoração distraída:
//
//   • a rota NÃO fecha só com pulos — conclusão é por contribuição;
//   • o limite de dois pulos não pode virar ilimitado;
//   • a rota não abre à noite;
//   • a escolha não é do ponto mais próximo.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PILOTO,
  podeIniciarRota,
  estaParado,
  montarRota,
  minutosEstimados,
  estadoDaRota,
  recompensaDaRota,
} from '../lib/rotaDoDia.js';

const CENTRO = { lat: -8.6, lng: -35.42 };
const AGORA = new Date('2026-09-30T13:00:00');

// ~111.320 m por grau de longitude nesta latitude; suficiente para posicionar
// pontos a distâncias conhecidas sem depender da precisão do haversine.
const aLeste = (metros) => ({
  lat: CENTRO.lat,
  lng: CENTRO.lng + metros / 111320,
});

const alvo = (id, metros, atualizacoes = []) => ({
  id,
  ...aLeste(metros),
  author_id: 'u-autor',
  atualizacoes,
});

const obsDe = (autor, quandoDiasAtras = 2) => ({
  author_id: autor,
  update_type: 'still_here',
  status: 'pending',
  created_at: new Date(AGORA.getTime() - quandoDiasAtras * 86400000).toISOString(),
});

// ── Quando dá para sair ──────────────────────────────────────────────────────

test('não abre de madrugada', () => {
  const r = podeIniciarRota({ agora: new Date('2026-09-30T03:00:00'), posicao: CENTRO });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'noite');
});

test('não abre no fim da tarde — a rota levaria a pessoa ao escuro', () => {
  const r = podeIniciarRota({ agora: new Date('2026-09-30T18:30:00'), posicao: CENTRO });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'noite');
});

test('abre de dia, com posição', () => {
  assert.equal(podeIniciarRota({ agora: AGORA, posicao: CENTRO }).ok, true);
});

test('sem posição não há percurso a pé', () => {
  const r = podeIniciarRota({ agora: AGORA, posicao: null });
  assert.equal(r.ok, false);
  assert.equal(r.motivo, 'sem_posicao');
});

test('a recusa sempre explica — botão que some ensina que o app é instável', () => {
  for (const caso of [
    { agora: new Date('2026-09-30T02:00:00'), posicao: CENTRO },
    { agora: AGORA, posicao: null },
  ]) {
    assert.ok(podeIniciarRota(caso).texto?.length > 0);
  }
});

// ── Interação só com a pessoa parada ─────────────────────────────────────────

test('em movimento o app não pede interação', () => {
  assert.equal(estaParado({ speed: 8 }), false);
});

test('sem leitura de velocidade a pessoa é considerada parada', () => {
  // Muitos aparelhos não reportam `speed` parados. Tratar ausência como
  // movimento bloquearia justamente quem parou para responder.
  assert.equal(estaParado({ speed: null }), true);
  assert.equal(estaParado({}), true);
});

test('caminhando devagar ainda conta como parado o bastante', () => {
  assert.equal(estaParado({ speed: 1.2 }), true);
});

// ── A montagem ───────────────────────────────────────────────────────────────

test('monta até o teto de paradas', () => {
  const candidatos = [100, 200, 300, 400, 500, 600, 700].map((m, i) => alvo(`a${i}`, m));
  const r = montarRota({ posicao: CENTRO, candidatos, agora: AGORA });

  assert.equal(r.paradas.length, PILOTO.PARADAS_MAX);
  assert.equal(r.suficiente, true);
});

test('ponto fora do raio a pé não entra', () => {
  const candidatos = [alvo('perto', 200), alvo('longe', PILOTO.RAIO_M + 300)];
  const r = montarRota({ posicao: CENTRO, candidatos, agora: AGORA });

  assert.deepEqual(r.paradas.map((p) => p.id), ['perto']);
});

test('ponto já confirmado por duas pessoas não vira parada', () => {
  const confirmado = alvo('confirmado', 60, [obsDe('u-a'), obsDe('u-b')]);
  const r = montarRota({ posicao: CENTRO, candidatos: [confirmado], agora: AGORA });

  assert.equal(r.paradas.length, 0);
  assert.equal(r.suficiente, false);
});

test('a rota não é a do ponto mais próximo', () => {
  // O vizinho de 80 m já tem uma observação recente; o de 400 m nunca foi
  // conferido. A primeira parada tem que ser a que produz informação.
  const candidatos = [
    alvo('perto_conhecido', 80, [obsDe('u-a')]),
    alvo('longe_sem_dado', 400),
  ];
  const r = montarRota({ posicao: CENTRO, candidatos, agora: AGORA });

  assert.equal(r.paradas[0].id, 'longe_sem_dado');
});

test('menos de três paradas não é rota curta, é rota que não existe', () => {
  const r = montarRota({ posicao: CENTRO, candidatos: [alvo('a', 100)], agora: AGORA });

  assert.equal(r.paradas.length, 1);
  assert.equal(r.suficiente, false);
});

test('o orçamento de metros fecha a rota antes do teto de paradas', () => {
  // Cinco pontos espalhados em linha, cada salto perto do orçamento inteiro.
  const candidatos = [700, 1400, 2100, 2800, 3500].map((m, i) => alvo(`a${i}`, m));
  const r = montarRota({ posicao: CENTRO, candidatos, agora: AGORA });

  assert.ok(r.metros <= PILOTO.METROS_MAX, `${r.metros} passou do orçamento`);
  assert.ok(r.paradas.length < PILOTO.PARADAS_MAX);
});

test('sem posição não há rota', () => {
  const r = montarRota({ posicao: null, candidatos: [alvo('a', 100)] });
  assert.deepEqual(r.paradas, []);
});

test('as paradas saem numeradas na ordem de caminhada', () => {
  const candidatos = [100, 250, 400].map((m, i) => alvo(`a${i}`, m));
  const r = montarRota({ posicao: CENTRO, candidatos, agora: AGORA });

  assert.deepEqual(r.paradas.map((p) => p.ordem), [1, 2, 3]);
});

// ── O tempo ──────────────────────────────────────────────────────────────────

test('a estimativa conta o tempo de parar, não só o de andar', () => {
  const soAndando = minutosEstimados({ metros: 830, paradas: 0 });
  const comParadas = minutosEstimados({ metros: 830, paradas: 4 });

  assert.equal(soAndando, 10);
  assert.equal(comParadas, 22);
});

test('a rota do piloto cabe na meia hora prometida', () => {
  assert.ok(
    minutosEstimados({ metros: PILOTO.METROS_MAX, paradas: PILOTO.PARADAS_MAX }) <= 45
  );
});

// ── O andamento ──────────────────────────────────────────────────────────────

const paradas = ['a', 'b', 'c'].map((id, i) => ({ id, ordem: i + 1 }));

test('a próxima parada é a primeira ainda pendente', () => {
  const e = estadoDaRota(paradas, { concluidas: ['a'] });
  assert.equal(e.proxima.id, 'b');
});

test('rota só de pulos NÃO conclui', () => {
  // A guarda contra conclusão por passagem. Se cair, basta pular tudo para
  // fechar a rota — e a rota deixa de produzir qualquer coisa.
  const e = estadoDaRota(paradas, { puladas: ['a', 'b', 'c'] });
  assert.equal(e.concluida, false);
  assert.equal(recompensaDaRota(e), null);
});

test('contribuição mais pulos dentro do limite conclui', () => {
  const e = estadoDaRota(paradas, { concluidas: ['a'], puladas: ['b', 'c'] });
  assert.equal(e.concluida, true);
  assert.ok(recompensaDaRota(e).xp > 0);
});

test('o limite de dois pulos é respeitado', () => {
  const e = estadoDaRota(paradas, { puladas: ['a', 'b'] });
  assert.equal(e.podePular, false);
  assert.equal(e.pulosRestantes, 0);
});

test('pular não reduz a recompensa', () => {
  const semPulo = estadoDaRota(paradas, { concluidas: ['a', 'b', 'c'] });
  const comPulo = estadoDaRota(paradas, { concluidas: ['a', 'b'], puladas: ['c'] });

  assert.equal(recompensaDaRota(semPulo).xp, recompensaDaRota(comPulo).xp);
});

test('rota vazia não conclui sozinha', () => {
  assert.equal(estadoDaRota([], {}).concluida, false);
});
