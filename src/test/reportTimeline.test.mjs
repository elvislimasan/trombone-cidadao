// A linha do tempo com proveniência.
//   node --test src/test/reportTimeline.test.mjs
//
// Três testes importam mais que os outros:
//
//   • "encaminhada" NUNCA aparece sem o aviso de que não é conserto — é a regra
//     literal do plano, e o único fio que separa informar de dar a entender;
//   • o autor NÃO valida a própria bronca — se cair, a etapa "validada" carimba
//     exatamente o que ela existe para checar (mesmo critério da 199);
//   • "antes e depois" só existe com as duas pontas — meia comparação sugere
//     que o depois existe e não carregou.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ETAPAS,
  ETAPAS_OFICIAIS,
  ETAPA_RECUSADA,
  FONTE_COMUNIDADE,
  FONTE_MODERACAO,
  FONTE_ORGAO,
  linhaDoTempo,
  antesEDepois,
} from '../lib/reportTimeline.js';

const AUTOR = 'u-autor';
const VIZINHO = 'u-vizinho';
const OUTRO = 'u-outro';

const bronca = (extra = {}) => ({
  id: 'r1',
  author_id: AUTOR,
  status: 'pending',
  moderation_status: 'approved',
  created_at: '2026-08-01T10:00:00Z',
  author: { name: 'Maria' },
  report_media: [{ id: 'm1', url: 'https://exemplo/antes.jpg' }],
  ...extra,
});

const atualizacao = (extra = {}) => ({
  id: 'u1',
  author_id: VIZINHO,
  update_type: 'still_here',
  status: 'pending',
  created_at: '2026-08-05T10:00:00Z',
  author: { name: 'João' },
  media: [],
  ...extra,
});

const etapaOficial = (extra = {}) => ({
  id: 'e1',
  etapa: 'encaminhada',
  orgao: 'Secretaria de Obras',
  protocolo: '2026/4471',
  ocorreu_em: '2026-08-10T10:00:00Z',
  ...extra,
});

const etapasDe = (r) => r.eventos.map((e) => e.etapa);

// ── O que a linha do tempo sempre tem ────────────────────────────────────────

test('toda bronca começa com o registro, com autor e evidência', () => {
  const r = linhaDoTempo({ report: bronca() });
  const registro = r.eventos[0];

  assert.equal(registro.etapa, 'registrada');
  assert.equal(registro.autorNome, 'Maria');
  assert.equal(registro.evidencia.length, 1);
});

test('sem bronca não quebra, devolve linha vazia', () => {
  const r = linhaDoTempo({ report: null });
  assert.deepEqual(r.eventos, []);
  assert.equal(r.etapaAtual, 'registrada');
});

test('aguardando moderação não vira evento — vira pendência', () => {
  const r = linhaDoTempo({ report: bronca({ moderation_status: 'pending_approval' }) });

  assert.deepEqual(etapasDe(r), ['registrada']);
  assert.match(r.falta.texto, /moderação/i);
  assert.equal(r.falta.deQuem, 'moderacao');
});

// ── Validação: quem tem interesse não valida ─────────────────────────────────

test('atualização do próprio autor NÃO produz etapa validada', () => {
  const r = linhaDoTempo({
    report: bronca(),
    atualizacoes: [atualizacao({ author_id: AUTOR })],
  });

  assert.ok(!etapasDe(r).includes('validada'));
});

test('atualização de quem completou o sinal também não valida', () => {
  const r = linhaDoTempo({
    report: bronca({ completed_by: OUTRO }),
    atualizacoes: [atualizacao({ author_id: OUTRO })],
  });

  assert.ok(!etapasDe(r).includes('validada'));
});

test('atualização de terceiro valida, e a fonte é a comunidade', () => {
  const r = linhaDoTempo({ report: bronca(), atualizacoes: [atualizacao()] });
  const validada = r.eventos.find((e) => e.etapa === 'validada');

  assert.ok(validada);
  assert.equal(validada.fonte, FONTE_COMUNIDADE);
  assert.equal(validada.autorNome, 'João');
});

test('atualização rejeitada não valida nada', () => {
  const r = linhaDoTempo({
    report: bronca(),
    atualizacoes: [atualizacao({ status: 'rejected' })],
  });

  assert.ok(!etapasDe(r).includes('validada'));
});

test('pendente de moderação valida, igual à 185 e à 199', () => {
  const r = linhaDoTempo({
    report: bronca(),
    atualizacoes: [atualizacao({ status: 'pending_moderation' })],
  });

  assert.ok(etapasDe(r).includes('validada'));
});

// ── Encaminhada nunca é resolvida ────────────────────────────────────────────

test('encaminhada traz o aviso de que não é conserto', () => {
  const r = linhaDoTempo({ report: bronca(), etapasOficiais: [etapaOficial()] });

  assert.equal(r.etapaAtual, 'encaminhada');
  assert.match(r.aviso, /não é resolver|não é conserto/i);
});

test('executada informada pelo órgão ainda pede confirmação no local', () => {
  const r = linhaDoTempo({
    report: bronca(),
    etapasOficiais: [etapaOficial({ id: 'e2', etapa: 'executada' })],
  });

  assert.equal(r.etapaAtual, 'executada');
  assert.ok(r.aviso);
  assert.match(r.falta.texto, /confirmar/i);
  assert.equal(r.falta.deQuem, 'cidadao');
});

test('toda etapa que depende de terceiro está marcada como tal', () => {
  const dependentes = ETAPAS.filter((e) => e.dependeDeTerceiro).map((e) => e.id);
  assert.deepEqual(dependentes, ETAPAS_OFICIAIS);
});

test('verificada pela comunidade apaga o aviso de dependência', () => {
  const r = linhaDoTempo({
    report: bronca({ status: 'resolved', resolved_at: '2026-08-20T10:00:00Z' }),
    atualizacoes: [
      atualizacao({ id: 'u1', author_id: VIZINHO, update_type: 'solved' }),
      atualizacao({ id: 'u2', author_id: OUTRO, update_type: 'solved' }),
    ],
    etapasOficiais: [etapaOficial()],
  });

  assert.equal(r.etapaAtual, 'verificada');
  assert.equal(r.aviso, null);
  assert.equal(r.falta, null);
});

// ── Proveniência e motivo da recusa ──────────────────────────────────────────

test('bronca recusada mostra o motivo e o caminho de correção', () => {
  const r = linhaDoTempo({
    report: bronca({
      moderation_status: 'rejected',
      rejected_at: '2026-08-02T10:00:00Z',
      rejection_title: 'Foto não mostra o problema',
      rejection_description: 'A imagem está desfocada; reenvie mostrando a calçada.',
    }),
  });
  const moderacao = r.eventos.find((e) => e.etapa === 'moderada');

  assert.equal(moderacao.recusa, true);
  assert.equal(moderacao.fonte, FONTE_MODERACAO);
  assert.match(moderacao.motivo, /desfocada/);
  assert.match(r.falta.texto, /correção/i);
  assert.equal(r.falta.deQuem, 'cidadao');
});

test('recusa do órgão é registrada como recusa, com o motivo', () => {
  const r = linhaDoTempo({
    report: bronca(),
    etapasOficiais: [
      etapaOficial({
        id: 'e9',
        etapa: ETAPA_RECUSADA,
        observacao: 'Via sob responsabilidade estadual.',
      }),
    ],
  });
  const recusa = r.eventos.find((e) => e.recusa);

  assert.equal(recusa.fonte, FONTE_ORGAO);
  assert.match(recusa.motivo, /estadual/);
  assert.equal(r.falta.deQuem, 'orgao');
});

test('protocolo e órgão aparecem no detalhe — é o que torna a afirmação checável', () => {
  const r = linhaDoTempo({ report: bronca(), etapasOficiais: [etapaOficial()] });
  const oficial = r.eventos.find((e) => e.fonte === FONTE_ORGAO);

  assert.match(oficial.detalhe, /Secretaria de Obras/);
  assert.match(oficial.detalhe, /2026\/4471/);
});

test('etapa oficial desconhecida é ignorada em vez de virar linha solta', () => {
  const r = linhaDoTempo({
    report: bronca(),
    etapasOficiais: [etapaOficial({ id: 'e5', etapa: 'inventada' })],
  });

  assert.deepEqual(etapasDe(r), ['registrada', 'moderada']);
});

// ── Ordem ────────────────────────────────────────────────────────────────────

test('evento sem data fica na posição da etapa, não no topo', () => {
  // Aprovação sem `approved_at`: se a ordenação usasse só a data, `new Date(null)`
  // valeria zero e a aprovação apareceria antes do registro.
  const r = linhaDoTempo({ report: bronca() });

  assert.deepEqual(etapasDe(r), ['registrada', 'moderada']);
});

test('as etapas saem na ordem do fluxo, não na ordem de chegada', () => {
  const r = linhaDoTempo({
    report: bronca(),
    atualizacoes: [atualizacao()],
    etapasOficiais: [
      etapaOficial({ id: 'e3', etapa: 'recebida', ocorreu_em: '2026-08-12T10:00:00Z' }),
      etapaOficial({ id: 'e2', etapa: 'encaminhada', ocorreu_em: '2026-08-10T10:00:00Z' }),
    ],
  });

  assert.deepEqual(etapasDe(r), [
    'registrada',
    'moderada',
    'validada',
    'encaminhada',
    'recebida',
  ]);
});

// ── Sem integração com a prefeitura ──────────────────────────────────────────

test('sem canal oficial, a ausência de etapa não é atraso do órgão', () => {
  const r = linhaDoTempo({ report: bronca() });
  assert.equal(r.semIntegracao, true);
});

test('com canal oficial declarado, o aviso de ausência some', () => {
  const r = linhaDoTempo({ report: bronca(), integracaoComOrgao: true });
  assert.equal(r.semIntegracao, false);
});

// ── Antes e depois ───────────────────────────────────────────────────────────

test('sem foto do depois não há comparação', () => {
  const r = antesEDepois({
    report: bronca(),
    atualizacoes: [atualizacao({ update_type: 'solved' })],
  });

  assert.equal(r, null);
});

test('sem foto do antes não há comparação', () => {
  const r = antesEDepois({
    report: bronca({ report_media: [] }),
    atualizacoes: [
      atualizacao({ update_type: 'solved', media: [{ id: 'd1', url: 'https://x/d.jpg' }] }),
    ],
  });

  assert.equal(r, null);
});

test('obra em andamento não é o depois de nada', () => {
  const r = antesEDepois({
    report: bronca(),
    atualizacoes: [
      atualizacao({
        update_type: 'being_solved',
        media: [{ id: 'd1', url: 'https://x/andamento.jpg' }],
      }),
    ],
  });

  assert.equal(r, null);
});

test('atualização rejeitada não vira o depois', () => {
  const r = antesEDepois({
    report: bronca(),
    atualizacoes: [
      atualizacao({
        update_type: 'solved',
        status: 'rejected',
        media: [{ id: 'd1', url: 'https://x/d.jpg' }],
      }),
    ],
  });

  assert.equal(r, null);
});

test('com as duas pontas, o par traz data e quem tirou o depois', () => {
  const r = antesEDepois({
    report: bronca(),
    atualizacoes: [
      atualizacao({
        update_type: 'solved',
        media: [{ id: 'd1', url: 'https://x/depois.jpg' }],
      }),
    ],
  });

  assert.equal(r.antes.url, 'https://exemplo/antes.jpg');
  assert.equal(r.depois.url, 'https://x/depois.jpg');
  assert.equal(r.depois.autorNome, 'João');
  assert.ok(r.antes.em < r.depois.em);
});

test('o depois é a confirmação mais recente', () => {
  const r = antesEDepois({
    report: bronca(),
    atualizacoes: [
      atualizacao({
        id: 'u1',
        update_type: 'solved',
        created_at: '2026-08-05T10:00:00Z',
        media: [{ id: 'd1', url: 'https://x/antiga.jpg' }],
      }),
      atualizacao({
        id: 'u2',
        author_id: OUTRO,
        update_type: 'solved',
        created_at: '2026-08-19T10:00:00Z',
        media: [{ id: 'd2', url: 'https://x/recente.jpg' }],
      }),
    ],
  });

  assert.equal(r.depois.url, 'https://x/recente.jpg');
});
