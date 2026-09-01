// A revisita de 28 dias.
//   node --test src/test/reportRevisit.test.mjs
//
// Dois testes carregam as decisões do desenho:
//
//   • "não consigo verificar" NÃO produz observação de campo — um formulário
//     sem saída honesta colhe a resposta mais fácil, não a verdadeira;
//   • a contagem parte do último fato, não do registro — senão o app pergunta
//     "como está agora?" sobre algo respondido ontem, e ensina a ignorar aviso.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DIAS_PARA_REVISITA,
  RESPOSTAS,
  respostaDe,
  envioDaRevisita,
  diasParada,
  cabeRevisita,
  convite,
} from '../lib/reportRevisit.js';

const AUTOR = 'u-autor';
const AGORA = new Date('2026-09-30T12:00:00Z');
const diasAtras = (n) => new Date(AGORA.getTime() - n * 86400000).toISOString();

const bronca = (extra = {}) => ({
  id: 'r1',
  author_id: AUTOR,
  status: 'pending',
  moderation_status: 'approved',
  created_at: diasAtras(40),
  ...extra,
});

// Os mesmos valores do CHECK `report_revisits_resposta_valida` (207).
const RESPOSTAS_DA_MIGRACAO = [
  'igual',
  'piorou',
  'melhorou',
  'resolvido',
  'nao_consigo_verificar',
];

// Os únicos aceitos pelo CHECK de `report_updates.update_type` (102/104).
const TIPOS_DO_BANCO = ['still_here', 'being_solved', 'solved'];

test('as respostas espelham o CHECK da migração 207', () => {
  assert.deepEqual(RESPOSTAS.map((r) => r.id), RESPOSTAS_DA_MIGRACAO);
});

test('nenhuma resposta inventa um update_type que o banco recusa', () => {
  for (const r of RESPOSTAS) {
    if (r.updateType) assert.ok(TIPOS_DO_BANCO.includes(r.updateType), r.id);
  }
});

// ── O que vira observação de campo, e o que não vira ─────────────────────────

test('"não consigo verificar" encerra o convite sem afirmar nada sobre a rua', () => {
  const r = envioDaRevisita({ respostaId: 'nao_consigo_verificar', report: bronca() });

  assert.equal(r.atualizacao, null);
  assert.equal(r.revisita.resposta, 'nao_consigo_verificar');
  assert.ok(r.revisita.respondida_em);
});

test('"continua igual" vira still_here, que é o tipo que não move a bronca', () => {
  const r = envioDaRevisita({ respostaId: 'igual', report: bronca() });

  assert.equal(r.atualizacao.update_type, 'still_here');
  assert.equal(r.atualizacao.message, null);
});

test('"piorou" carrega na nota a diferença que o update_type perde', () => {
  const r = envioDaRevisita({ respostaId: 'piorou', report: bronca() });

  assert.equal(r.atualizacao.update_type, 'still_here');
  assert.match(r.atualizacao.message, /Piorou/);
});

test('"foi resolvido" vira solved — e a 199 decide se fecha ou só reivindica', () => {
  const r = envioDaRevisita({ respostaId: 'resolvido', report: bronca() });
  assert.equal(r.atualizacao.update_type, 'solved');
});

test('o texto da pessoa entra depois da nota, sem apagá-la', () => {
  const r = envioDaRevisita({
    respostaId: 'piorou',
    report: bronca(),
    mensagem: 'O buraco dobrou de tamanho.',
  });

  assert.match(r.atualizacao.message, /Piorou.*dobrou/s);
});

test('resposta desconhecida não vira envio', () => {
  assert.equal(envioDaRevisita({ respostaId: 'talvez', report: bronca() }), null);
  assert.equal(envioDaRevisita({ respostaId: 'igual', report: null }), null);
  assert.equal(respostaDe('talvez'), null);
});

// ── Quantos dias parada ──────────────────────────────────────────────────────

test('conta do registro quando não há atualização', () => {
  assert.equal(diasParada(bronca(), [], AGORA), 40);
});

test('uma atualização recente zera a espera — não se pergunta o que acabou de ser dito', () => {
  const dias = diasParada(
    bronca(),
    [{ created_at: diasAtras(2), status: 'pending' }],
    AGORA
  );

  assert.equal(dias, 2);
});

test('atualização rejeitada não conta como fato conhecido', () => {
  const dias = diasParada(
    bronca(),
    [{ created_at: diasAtras(2), status: 'rejected' }],
    AGORA
  );

  assert.equal(dias, 40);
});

// ── Quando cabe convidar ─────────────────────────────────────────────────────

test('cabe quando a bronca do próprio usuário está parada há 28 dias', () => {
  assert.equal(cabeRevisita({ report: bronca(), user: { id: AUTOR }, agora: AGORA }), true);
});

test('não cabe antes dos 28 dias', () => {
  assert.equal(
    cabeRevisita({
      report: bronca({ created_at: diasAtras(DIAS_PARA_REVISITA - 1) }),
      user: { id: AUTOR },
      agora: AGORA,
    }),
    false
  );
});

test('não se pergunta sobre bronca já resolvida', () => {
  assert.equal(
    cabeRevisita({ report: bronca({ status: 'resolved' }), user: { id: AUTOR }, agora: AGORA }),
    false
  );
});

test('não se pergunta sobre bronca recusada pela moderação', () => {
  assert.equal(
    cabeRevisita({
      report: bronca({ moderation_status: 'rejected' }),
      user: { id: AUTOR },
      agora: AGORA,
    }),
    false
  );
});

test('só o autor é convidado a revisitar', () => {
  assert.equal(
    cabeRevisita({ report: bronca(), user: { id: 'u-outro' }, agora: AGORA }),
    false
  );
});

test('quem pediu para não ser perguntado de novo não é perguntado de novo', () => {
  assert.equal(
    cabeRevisita({
      report: bronca(),
      user: { id: AUTOR },
      recusouLembrete: true,
      agora: AGORA,
    }),
    false
  );
});

test('convite em aberto não gera um segundo convite', () => {
  assert.equal(
    cabeRevisita({ report: bronca(), user: { id: AUTOR }, jaConvidado: true, agora: AGORA }),
    false
  );
});

// ── O texto ──────────────────────────────────────────────────────────────────

test('o convite pergunta, não cobra', () => {
  const c = convite(40);

  assert.match(c.titulo, /Faz mais de um mês/);
  assert.match(c.pergunta, /Como está agora/);
  assert.doesNotMatch(`${c.titulo} ${c.pergunta} ${c.rodape}`, /abandon|esqueceu|deveria/i);
});

test('o convite nunca diz menos que o intervalo real', () => {
  assert.match(convite(3).titulo, /28 dias/);
});
