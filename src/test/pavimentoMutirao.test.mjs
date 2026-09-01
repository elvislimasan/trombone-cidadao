// Pavimentação cidadã e mutirão presencial.
//   node --test src/test/pavimentoMutirao.test.mjs
//
// As invariantes que este arquivo protege são de responsabilidade, não de
// funcionalidade:
//
//   • o cidadão SUGERE, e nada aqui altera a base — a alteração é do embaixador;
//   • "não sei" não vira observação — sem saída honesta, colhe-se palpite;
//   • um mutirão incompleto não publica, e um sem relatório não encerra.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PERGUNTA,
  RAIO_DE_OBSERVACAO_M,
  RESPOSTAS_DE_PAVIMENTO,
  envioDaSugestao,
  localConfere,
  prontaParaAprovacao,
} from '../lib/sugestaoPavimento.js';

import {
  REQUISITOS,
  REQUISITO_RELATORIO,
  faltaParaPublicar,
  horarioDiurno,
  podeEncerrar,
  podePublicar,
} from '../lib/mutirao.js';

// Os mesmos três de STATUS_DE_RUA em pavementReport.js. Se divergirem, a
// aprovação grava em `pavement_streets.status` um valor que o mapa não sabe ler.
const STATUS_DO_CADASTRO = ['paved', 'partially_paved', 'unpaved'];

const rua = (extra = {}) => ({ id: 'r1', status: 'unpaved', ...extra });

const sug = (extra = {}) => ({
  user_id: 'u-a',
  resposta: 'paved',
  status: 'pendente',
  local_confere: true,
  ...extra,
});

// ── A pergunta ───────────────────────────────────────────────────────────────

test('a pergunta é cega: pergunta o que se vê, não se confere', () => {
  assert.match(PERGUNTA.texto, /qual pavimento você observa/i);
  assert.doesNotMatch(PERGUNTA.texto, /continua|confirma|ainda é/i);
});

test('as respostas usam o vocabulário do cadastro, sem tradução', () => {
  const ids = RESPOSTAS_DE_PAVIMENTO.map((r) => r.id).filter((id) => id !== 'nao_sei');
  assert.deepEqual(ids, STATUS_DO_CADASTRO);
});

test('existe uma saída honesta', () => {
  assert.ok(RESPOSTAS_DE_PAVIMENTO.some((r) => r.id === 'nao_sei'));
});

// ── A checagem de local ──────────────────────────────────────────────────────

test('estar na rua é mais estreito que o raio da patrulha', () => {
  // 100 m de uma esquina pode ser a rua paralela, com outro pavimento.
  assert.ok(RAIO_DE_OBSERVACAO_M < 100);
});

test('longe não conta como observação de campo', () => {
  assert.equal(localConfere(RAIO_DE_OBSERVACAO_M + 1).ok, false);
  assert.equal(localConfere(RAIO_DE_OBSERVACAO_M).ok, true);
  assert.equal(localConfere(null).ok, false);
});

test('resposta de longe não vira sugestão', () => {
  const r = envioDaSugestao({ respostaId: 'paved', rua: rua(), distanciaM: 500 });
  assert.equal(r.sugestao, null);
  assert.equal(r.motivo, 'longe');
});

// ── O envio ──────────────────────────────────────────────────────────────────

test('resposta na rua vira sugestão, nunca alteração', () => {
  const r = envioDaSugestao({ respostaId: 'paved', rua: rua(), distanciaM: 20 });

  assert.equal(r.sugestao.resposta, 'paved');
  assert.equal(r.sugestao.street_id, 'r1');
  // Nada aqui carrega o status novo da rua: quem altera é o embaixador.
  assert.ok(!('status' in r.sugestao));
});

test('"não sei" não registra observação nenhuma', () => {
  const r = envioDaSugestao({ respostaId: 'nao_sei', rua: rua(), distanciaM: 10 });
  assert.equal(r.sugestao, null);
  assert.equal(r.motivo, 'nao_sei');
});

test('nome, traçado e CEP errados viram auditoria, não edição', () => {
  const r = envioDaSugestao({
    respostaId: 'fora_do_escopo',
    rua: rua(),
    distanciaM: 10,
    observacao: 'O traçado passa na quadra de cima.',
  });

  assert.equal(r.sugestao, null);
  assert.equal(r.auditoria.motivo, 'ponto_errado');
  assert.match(r.auditoria.observacao, /quadra de cima/);
});

test('resposta inventada não passa', () => {
  assert.equal(envioDaSugestao({ respostaId: 'asfaltinho', rua: rua(), distanciaM: 5 }).sugestao, null);
});

// ── A aprovação ──────────────────────────────────────────────────────────────

test('uma pessoa só não leva nada para a fila do embaixador', () => {
  const r = prontaParaAprovacao({ rua: rua(), sugestoes: [sug()] });
  assert.equal(r.pronta, false);
  assert.equal(r.motivo, 'sem_quorum');
});

test('duas pessoas com a mesma resposta diferente do cadastro sobem para aprovação', () => {
  const r = prontaParaAprovacao({
    rua: rua({ status: 'unpaved' }),
    sugestoes: [sug(), sug({ user_id: 'u-b' })],
  });

  assert.equal(r.pronta, true);
  assert.equal(r.resposta, 'paved');
  assert.equal(r.apoios, 2);
});

test('concordar com o cadastro não vira pedido de alteração', () => {
  // Confirmação já vale como cobertura; ocupar a fila do embaixador com ela
  // faria a fila crescer com trabalho que não muda nada.
  const r = prontaParaAprovacao({
    rua: rua({ status: 'paved' }),
    sugestoes: [sug(), sug({ user_id: 'u-b' })],
  });

  assert.equal(r.pronta, false);
  assert.equal(r.motivo, 'ja_confere');
});

test('duas respostas com quórum cada uma é conflito, não média', () => {
  const r = prontaParaAprovacao({
    rua: rua(),
    sugestoes: [
      sug(),
      sug({ user_id: 'u-b' }),
      sug({ user_id: 'u-c', resposta: 'unpaved' }),
      sug({ user_id: 'u-d', resposta: 'unpaved' }),
    ],
  });

  assert.equal(r.pronta, false);
  assert.equal(r.motivo, 'conflito');
});

test('sugestão de longe não conta para o quórum de aprovação', () => {
  const r = prontaParaAprovacao({
    rua: rua(),
    sugestoes: [sug(), sug({ user_id: 'u-b', local_confere: false })],
  });
  assert.equal(r.pronta, false);
});

// ── O mutirão ────────────────────────────────────────────────────────────────

const completo = (extra = {}) => ({
  organizador_id: 'u-org',
  area_descricao: 'Quadras ao redor da Escola Municipal X',
  ponto_de_encontro: 'Portão da escola, saída às 11h no mesmo lugar',
  orientacao: 'Sem rostos e placas nas fotos. Ninguém fotografa na pista.',
  canal_suporte: 'Grupo no WhatsApp + telefone do organizador',
  objetivo_dados: 'Verificar o pavimento de 25 ruas do entorno',
  alternativa_remota: 'Quem não puder caminhar revisa fotos pelo app',
  inicio_em: new Date('2026-10-10T08:00:00'),
  ...extra,
});

test('os sete requisitos do plano estão todos exigidos', () => {
  assert.equal(REQUISITOS.length, 7);
  for (const r of REQUISITOS) {
    assert.ok(r.campo && r.rotulo && r.porque, r.id);
  }
});

test('mutirão completo e diurno publica', () => {
  const r = podePublicar(completo());
  assert.equal(r.ok, true);
  assert.deepEqual(r.faltando, []);
});

test('falta canal de suporte e não publica — não é detalhe', () => {
  // Um mutirão sem canal de suporte é um grupo de pessoas na rua sem para quem
  // ligar.
  const r = podePublicar(completo({ canal_suporte: '  ' }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltando.map((f) => f.id), ['suporte']);
});

test('falta alternativa remota e não publica', () => {
  const r = podePublicar(completo({ alternativa_remota: null }));
  assert.equal(r.ok, false);
  assert.deepEqual(r.faltando.map((f) => f.id), ['remoto']);
});

test('o que falta vem listado, não só negado', () => {
  const r = faltaParaPublicar({});
  assert.equal(r.faltando.length, REQUISITOS.length);
  assert.match(r.rotulo, /0 de 7/);
});

test('mutirão de fim de tarde não publica', () => {
  const r = podePublicar(completo({ inicio_em: new Date('2026-10-10T17:00:00') }));
  assert.equal(r.ok, false);
  assert.equal(r.horario.ok, false);
});

test('mutirão de madrugada não publica', () => {
  assert.equal(horarioDiurno(new Date('2026-10-10T04:00:00')).ok, false);
});

test('sem relatório público, não encerra', () => {
  assert.equal(podeEncerrar(completo()).ok, false);
  assert.match(podeEncerrar(completo()).texto, /relatório público/i);
});

test('com relatório, encerra', () => {
  const r = podeEncerrar(completo({ [REQUISITO_RELATORIO.campo]: '25 ruas verificadas.' }));
  assert.equal(r.ok, true);
});
