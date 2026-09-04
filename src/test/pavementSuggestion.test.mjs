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

const STATUS_DO_CADASTRO = ['paved', 'partially_paved', 'unpaved'];
const rua = (extra = {}) => ({ id: 'r1', status: 'unpaved', ...extra });
const sugestao = (extra = {}) => ({
  user_id: 'u-a',
  resposta: 'paved',
  status: 'pendente',
  local_confere: true,
  ...extra,
});

test('a pergunta pede o pavimento observado e oferece uma saída honesta', () => {
  assert.match(PERGUNTA.texto, /qual pavimento você observa/i);
  assert.ok(RESPOSTAS_DE_PAVIMENTO.some((resposta) => resposta.id === 'nao_sei'));
  assert.deepEqual(
    RESPOSTAS_DE_PAVIMENTO.map((resposta) => resposta.id).filter((id) => id !== 'nao_sei'),
    STATUS_DO_CADASTRO
  );
});

test('somente uma observação feita perto da rua pode ser enviada', () => {
  assert.ok(RAIO_DE_OBSERVACAO_M < 100);
  assert.equal(localConfere(RAIO_DE_OBSERVACAO_M).ok, true);
  assert.equal(localConfere(RAIO_DE_OBSERVACAO_M + 1).ok, false);
  assert.equal(envioDaSugestao({ respostaId: 'paved', rua: rua(), distanciaM: 500 }).sugestao, null);
});

test('a resposta vira sugestão e nunca altera diretamente o cadastro', () => {
  const resultado = envioDaSugestao({ respostaId: 'paved', rua: rua(), distanciaM: 20 });
  assert.equal(resultado.sugestao.resposta, 'paved');
  assert.equal(resultado.sugestao.street_id, 'r1');
  assert.ok(!('status' in resultado.sugestao));
});

test('não sei não registra uma observação', () => {
  const resultado = envioDaSugestao({ respostaId: 'nao_sei', rua: rua(), distanciaM: 10 });
  assert.equal(resultado.sugestao, null);
  assert.equal(resultado.motivo, 'nao_sei');
});

test('dois relatos concordantes podem seguir para aprovação', () => {
  const resultado = prontaParaAprovacao({
    rua: rua(),
    sugestoes: [sugestao(), sugestao({ user_id: 'u-b' })],
  });
  assert.equal(resultado.pronta, true);
  assert.equal(resultado.resposta, 'paved');
  assert.equal(resultado.apoios, 2);
});

test('uma pessoa, conflito ou confirmação do cadastro não abre alteração', () => {
  assert.equal(prontaParaAprovacao({ rua: rua(), sugestoes: [sugestao()] }).pronta, false);
  assert.equal(prontaParaAprovacao({
    rua: rua({ status: 'paved' }),
    sugestoes: [sugestao(), sugestao({ user_id: 'u-b' })],
  }).motivo, 'ja_confere');
  assert.equal(prontaParaAprovacao({
    rua: rua(),
    sugestoes: [
      sugestao(),
      sugestao({ user_id: 'u-b' }),
      sugestao({ user_id: 'u-c', resposta: 'unpaved' }),
      sugestao({ user_id: 'u-d', resposta: 'unpaved' }),
    ],
  }).motivo, 'conflito');
});
