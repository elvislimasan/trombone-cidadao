// Explicação de rejeição e caminho de correção.
//   node --test src/test/reportRejection.test.mjs
//
// O teste que mais importa é o da rejeição antiga: as linhas rejeitadas antes
// da 207 não têm motivo, e o app precisa dizer isso em vez de escolher uma
// causa plausível. Inventar o motivo de uma recusa é pior que admitir a lacuna.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MOTIVOS_DE_REJEICAO,
  explicacaoDaRejeicao,
  podeVerRejeicao,
} from '../lib/reportRejection.js';

// Os mesmos valores do CHECK `report_updates_motivo_de_rejeicao_valido` (207).
// Se a lista daqui crescer sem a migração crescer junto, a moderação oferece um
// motivo que o banco recusa — e a rejeição falha no insert.
const CODIGOS_DA_MIGRACAO = [
  'fora_do_local',
  'sem_evidencia',
  'evidencia_ilegivel',
  'nao_corresponde',
  'duplicada',
  'conteudo_improprio',
  'dado_pessoal',
  'outro',
];

const rejeitada = (extra = {}) => ({
  id: 'u1',
  author_id: 'u-joao',
  status: 'rejected',
  rejection_reason: 'evidencia_ilegivel',
  rejected_at: '2026-08-10T10:00:00Z',
  ...extra,
});

test('o catálogo espelha exatamente o CHECK da migração 207', () => {
  assert.deepEqual(
    MOTIVOS_DE_REJEICAO.map((m) => m.id),
    CODIGOS_DA_MIGRACAO
  );
});

test('atualização não rejeitada não tem explicação', () => {
  assert.equal(explicacaoDaRejeicao({ status: 'pending' }), null);
  assert.equal(explicacaoDaRejeicao(null), null);
});

test('a nota do moderador vem junto e é específica do caso', () => {
  const r = explicacaoDaRejeicao(
    rejeitada({ rejection_note: 'A foto está escura demais para ver a calçada.' })
  );

  assert.match(r.nota, /escura/);
  assert.equal(r.rotulo, 'A foto não permite ver');
  assert.equal(r.corrigivel, true);
});

test('rejeição antiga admite a lacuna em vez de inventar motivo', () => {
  const r = explicacaoDaRejeicao(rejeitada({ rejection_reason: null }));

  assert.equal(r.id, null);
  assert.match(r.explicacao, /antes de o app registrar motivos/i);
  assert.equal(r.corrigivel, true);
});

test('conteúdo impróprio não oferece caminho de reenvio', () => {
  const r = explicacaoDaRejeicao(rejeitada({ rejection_reason: 'conteudo_improprio' }));

  assert.equal(r.corrigivel, false);
  assert.equal(r.comoCorrigir, null);
  // Sem correção, mas com recurso: erro de moderação não pode virar decisão
  // final por falta de canal.
  assert.equal(r.podeRecorrer, true);
});

test('duplicada não repreende nem manda reenviar', () => {
  const r = explicacaoDaRejeicao(rejeitada({ rejection_reason: 'duplicada' }));

  assert.equal(r.corrigivel, false);
  assert.match(r.comoCorrigir, /Não há o que corrigir/i);
});

test('todo motivo corrigível diz o que fazer', () => {
  for (const m of MOTIVOS_DE_REJEICAO) {
    if (m.corrigivel && m.id !== 'outro') {
      assert.ok(m.comoCorrigir, `motivo ${m.id} é corrigível e não diz como`);
    }
  }
});

test('data de rejeição inválida não vira Invalid Date na tela', () => {
  const r = explicacaoDaRejeicao(rejeitada({ rejected_at: 'não é data' }));
  assert.equal(r.em, null);
});

// ── Quem enxerga ─────────────────────────────────────────────────────────────

test('só quem enviou vê a própria rejeição', () => {
  const u = rejeitada();

  assert.equal(podeVerRejeicao(u, { id: 'u-joao' }), true);
  assert.equal(podeVerRejeicao(u, { id: 'u-vizinho' }), false);
  assert.equal(podeVerRejeicao(u, null), false);
});

test('a moderação enxerga para poder responder por ela', () => {
  assert.equal(podeVerRejeicao(rejeitada(), { id: 'u-adm', is_admin: true }), true);
});

test('atualização publicada não entra na regra de rejeição', () => {
  assert.equal(
    podeVerRejeicao({ ...rejeitada(), status: 'pending' }, { id: 'u-joao' }),
    false
  );
});
