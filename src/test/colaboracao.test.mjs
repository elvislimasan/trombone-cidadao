// Colaborar em vez de duplicar, e pular com motivo.
//   node --test src/test/colaboracao.test.mjs
//
// Duas invariantes são o desenho inteiro:
//
//   • "não consegui chegar" NÃO vira observação de campo — transformar
//     logística em afirmação sobre o problema contamina o dado que a rota
//     existe para produzir;
//   • "é outro problema" está SEMPRE disponível — um app que recusa registro
//     por proximidade ensina que insistir funciona.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  FORMAS_DE_COLABORAR,
  broncaParecida,
  conviteDeColaboracao,
  envioDaColaboracao,
  opcoesPara,
  raioDaCategoria,
} from '../lib/colaboracao.js';

import {
  MOTIVOS_DE_PULO,
  envioDoPulo,
  motivoDePulo,
  retornoDoPulo,
} from '../lib/pularAlvo.js';

const AUTOR = 'u-autor';
const VIZINHO = 'u-vizinho';

const CENTRO = { lat: -8.6, lng: -35.42 };
const aLeste = (metros) => ({ lat: CENTRO.lat, lng: CENTRO.lng + metros / 111320 });

const existente = (extra = {}) => ({
  id: 'r1',
  title: 'Buraco na esquina',
  author_id: AUTOR,
  category_id: 'buracos',
  status: 'pending',
  ...aLeste(10),
  ...extra,
});

// ── Detecção de bronca parecida ──────────────────────────────────────────────

test('bronca da mesma categoria, dentro do raio, é a candidata', () => {
  const r = broncaParecida({
    posicao: CENTRO,
    categoriaId: 'buracos',
    existentes: [existente()],
  });

  assert.equal(r.report.id, 'r1');
  assert.ok(r.distancia < r.raio);
});

test('categoria diferente é problema diferente, por mais perto que esteja', () => {
  const r = broncaParecida({
    posicao: CENTRO,
    categoriaId: 'iluminacao',
    existentes: [existente()],
  });

  assert.equal(r, null);
});

test('bronca resolvida no mesmo ponto não é duplicata — é o problema voltando', () => {
  const r = broncaParecida({
    posicao: CENTRO,
    categoriaId: 'buracos',
    existentes: [existente({ status: 'resolved' })],
  });

  assert.equal(r, null);
});

test('fora do raio da categoria não sugere nada', () => {
  const r = broncaParecida({
    posicao: CENTRO,
    categoriaId: 'buracos',
    existentes: [existente({ ...aLeste(raioDaCategoria('buracos') + 20) })],
  });

  assert.equal(r, null);
});

test('o raio de um poste é menor que o de uma limpeza de esquina', () => {
  assert.ok(raioDaCategoria('iluminacao') < raioDaCategoria('limpeza'));
});

test('a mais próxima ganha quando há duas', () => {
  const r = broncaParecida({
    posicao: CENTRO,
    categoriaId: 'buracos',
    existentes: [
      existente({ id: 'longe', ...aLeste(35) }),
      existente({ id: 'perto', ...aLeste(5) }),
    ],
  });

  assert.equal(r.report.id, 'perto');
});

// ── As opções ────────────────────────────────────────────────────────────────

test('"é outro problema" nunca some da lista', () => {
  for (const user of [{ id: AUTOR }, { id: VIZINHO }, null]) {
    const ids = opcoesPara({ report: existente(), user }).map((f) => f.id);
    assert.ok(ids.includes('outro_problema'));
  }
});

test('o autor não confirma o próprio registro', () => {
  const ids = opcoesPara({ report: existente(), user: { id: AUTOR } }).map((f) => f.id);
  assert.ok(!ids.includes('continua'));
});

test('o vizinho pode confirmar', () => {
  const ids = opcoesPara({ report: existente(), user: { id: VIZINHO } }).map((f) => f.id);
  assert.ok(ids.includes('continua'));
});

test('todas as cinco formas do plano existem', () => {
  const ids = FORMAS_DE_COLABORAR.map((f) => f.id);
  for (const esperado of [
    'continua',
    'mudou',
    'outro_angulo',
    'nao_existe_mais',
    'auditoria',
  ]) {
    assert.ok(ids.includes(esperado), esperado);
  }
});

// ── O envio ──────────────────────────────────────────────────────────────────

test('confirmar vira observação de campo, não comentário', () => {
  const r = envioDaColaboracao({ formaId: 'continua', report: existente() });

  assert.equal(r.atualizacao.update_type, 'still_here');
  assert.equal(r.registraNova, false);
});

test('"não está mais lá" vira solved e passa pelo quórum da 199', () => {
  const r = envioDaColaboracao({ formaId: 'nao_existe_mais', report: existente() });
  assert.equal(r.atualizacao.update_type, 'solved');
});

test('pedir auditoria não afirma nada sobre o problema', () => {
  const r = envioDaColaboracao({
    formaId: 'auditoria',
    report: existente(),
    mensagem: 'O ponto está na quadra errada.',
  });

  assert.equal(r.atualizacao, null);
  assert.match(r.auditoria.observacao, /quadra errada/);
});

test('"é outro problema" abre o cadastro novo sem tocar na bronca existente', () => {
  const r = envioDaColaboracao({ formaId: 'outro_problema', report: existente() });

  assert.equal(r.registraNova, true);
  assert.equal(r.atualizacao, null);
  assert.equal(r.auditoria, null);
});

test('o convite diz a distância, para dar no que discordar', () => {
  const c = conviteDeColaboracao({ report: existente(), distancia: 12.4 });
  assert.match(c.texto, /12 m/);
});

// ── Pular com motivo ─────────────────────────────────────────────────────────

test('"não existe mais" vira verificação de campo', () => {
  const r = envioDoPulo({ motivoId: 'nao_existe_mais', alvo: { id: 'r1' } });

  assert.equal(r.atualizacao.update_type, 'solved');
  assert.match(r.atualizacao.message, /não estava mais lá/);
});

test('"não consegui chegar" não afirma nada sobre o problema', () => {
  const r = envioDoPulo({ motivoId: 'nao_consegui_chegar', alvo: { id: 'r1' } });

  assert.equal(r.atualizacao, null);
  assert.equal(r.auditoria, null);
  assert.equal(r.pulo.motivo, 'nao_consegui_chegar');
});

test('"ponto errado" pede auditoria e NÃO fecha a bronca', () => {
  // O problema pode existir a duas quadras. Tratar coordenada errada como
  // resolução fecharia uma bronca viva.
  const r = envioDoPulo({ motivoId: 'ponto_errado', alvo: { id: 'r1' } });

  assert.equal(r.atualizacao, null);
  assert.equal(r.auditoria.motivo, 'ponto_errado');
});

test('risco no local vai para a moderação e não para o mural', () => {
  assert.equal(motivoDePulo('risco_no_local').privado, true);
  assert.equal(motivoDePulo('risco_no_local').auditoria, true);
});

test('"sem tempo" não gera nada além do próprio pulo', () => {
  const r = envioDoPulo({ motivoId: 'sem_tempo', alvo: { id: 'r1' } });

  assert.equal(r.atualizacao, null);
  assert.equal(r.auditoria, null);
});

test('nenhum motivo sem updateType inventa afirmação de campo', () => {
  for (const m of MOTIVOS_DE_PULO) {
    if (!m.updateType) {
      const r = envioDoPulo({ motivoId: m.id, alvo: { id: 'r1' } });
      assert.equal(r.atualizacao, null, m.id);
    }
  }
});

test('motivo desconhecido não vira envio', () => {
  assert.equal(envioDoPulo({ motivoId: 'porque_sim', alvo: { id: 'r1' } }), null);
  assert.equal(envioDoPulo({ motivoId: 'sem_tempo', alvo: null }), null);
});

test('todo pulo recebe um retorno — pular não é falhar', () => {
  for (const m of MOTIVOS_DE_PULO) {
    assert.ok(retornoDoPulo(m.id)?.length > 0, m.id);
  }
});

test('o retorno de "não existe mais" reconhece o trabalho', () => {
  assert.match(retornoDoPulo('nao_existe_mais'), /vale tanto quanto/i);
});
