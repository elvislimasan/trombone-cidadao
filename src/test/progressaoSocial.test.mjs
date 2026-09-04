// Progressão social leve — fase 4.
//   node --test src/test/progressaoSocial.test.mjs
//
// As invariantes aqui são de contenção, não de funcionalidade. A fase 4 é a que
// tem mais chance de deslizar para o que o roadmap excluiu, e cada teste guarda
// uma dessas portas:
//
//   • nenhum cosmético dá vantagem — o dia em que der, roupa vira build;
//   • qualidade não é volume com nome novo — a taxa de recusa importa;
//   • mentoria conta PESSOAS, não ações;
//   • campanha tem autor e tem fim.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CONQUISTAS,
  LIMITE_DE_RECUSA,
  avaliarConquistas,
  taxaDeRecusa,
} from '../lib/patrolGame.js';

import {
  MARCOS,
  POR_CONQUISTA,
  cosmeticosAbertos,
  marcosDe,
  marcosOrfaos,
} from '../lib/marcosCosmeticos.js';

import {
  DURACAO_MAXIMA_DIAS,
  campanhaVigente,
  chamadaDaCampanha,
  diasRestantes,
  podePublicarCampanha,
  vigente,
} from '../lib/campanhas.js';

const conquista = (id, stats) =>
  avaliarConquistas(stats).find((c) => c.id === id);

// ── Vocabulário (§36.16) ─────────────────────────────────────────────────────

test('nenhuma medalha sugere autoridade oficial ou posse de território', () => {
  // "Fiscal" é citado pelo nome na §36.16; posse de rua contraria o princípio 6.
  for (const c of CONQUISTAS) {
    assert.doesNotMatch(c.nome, /fiscal|xerife|dono|propriet/i, c.id);
  }
});

// ── Qualidade não é volume ───────────────────────────────────────────────────

test('taxa de recusa de quem nunca enviou é zero, não um', () => {
  // Devolver 1 faria quem nunca enviou aparecer como pouco confiável.
  assert.equal(taxaDeRecusa({}), 0);
});

test('a medalha de qualidade não abre para quem envia muito e erra muito', () => {
  const volumoso = conquista('observacao_confiavel', {
    updates_aceitas: 400,
    updates_rejeitadas: 380,
  });

  assert.equal(volumoso.desbloqueada, false);
  assert.equal(volumoso.atual, 0);
});

test('a mesma quantidade de aceitas, com poucas recusas, abre', () => {
  const cuidadoso = conquista('observacao_confiavel', {
    updates_aceitas: 40,
    updates_rejeitadas: 2,
  });

  assert.equal(cuidadoso.desbloqueada, true);
});

test('o limite de recusa acomoda erro honesto, não descuido em série', () => {
  assert.ok(LIMITE_DE_RECUSA >= 0.1, 'estreito demais premiaria só quem envia pouco');
  assert.ok(LIMITE_DE_RECUSA <= 0.25, 'largo demais deixaria de medir qualquer coisa');
});

test('exatamente no limite ainda conta', () => {
  const s = { updates_aceitas: 85, updates_rejeitadas: 15 };
  assert.equal(taxaDeRecusa(s), 0.15);
  assert.equal(conquista('observacao_confiavel', s).desbloqueada, true);
});

// ── Mentoria conta pessoas ───────────────────────────────────────────────────

test('mentoria lê pessoas ajudadas, não ações', () => {
  const c = CONQUISTAS.find((x) => x.id === 'deu_forca');
  assert.equal(c.contador, 'pessoas_ajudadas');
  assert.equal(c.familia, 'mentoria');
});

test('ajudar três pessoas distintas abre a primeira medalha de mentoria', () => {
  assert.equal(conquista('deu_forca', { pessoas_ajudadas: 3 }).desbloqueada, true);
  assert.equal(conquista('deu_forca', { pessoas_ajudadas: 2 }).desbloqueada, false);
});

test('as medalhas antigas continuam na família de campo', () => {
  assert.equal(conquista('primeira_patrulha', {}).familia, 'campo');
});

test('sem os contadores novos, a medalha aparece bloqueada e não quebra', () => {
  // É o estado antes de a 214 ser aplicada.
  const c = conquista('cartografo', {});
  assert.equal(c.desbloqueada, false);
  assert.equal(c.atual, 0);
});

// ── Cosméticos: sem moeda, sem vantagem ──────────────────────────────────────

test('nenhum cosmético tem preço, saldo ou bônus', () => {
  // O dia em que um destes campos aparecer, roupa deixa de ser identidade e
  // vira build — e quem jogou menos passa a contribuir valendo menos.
  for (const m of MARCOS) {
    for (const proibido of ['preco', 'custo', 'moedas', 'bonus', 'multiplicador', 'efeito']) {
      assert.ok(!(proibido in m), `${m.id} tem "${proibido}"`);
    }
  }
});

test('todo marco aponta uma medalha que existe', () => {
  assert.deepEqual(marcosOrfaos(), []);
});

test('todo marco abre por conquista, não por acúmulo', () => {
  for (const m of MARCOS) {
    assert.equal(m.por, POR_CONQUISTA, m.id);
  }
});

test('o marco fechado diz o que falta, com o texto da própria medalha', () => {
  const ms = marcosDe(avaliarConquistas({ total_confirmed: 10 }));
  const faixa = ms.find((m) => m.conquista === 'confirmacoes_50');

  assert.equal(faixa.aberto, false);
  assert.match(faixa.falta, /10 \/ 50/);
  assert.match(faixa.comoAbrir, /50 broncas confirmadas/);
});

test('a medalha desbloqueada abre a peça', () => {
  const abertos = cosmeticosAbertos(avaliarConquistas({ total_confirmed: 50 }));
  assert.ok(abertos.some((c) => c.id === 'faixa_verificador'));
});

test('sem nenhuma medalha, nenhuma peça abre', () => {
  assert.deepEqual(cosmeticosAbertos(avaliarConquistas({})), []);
});

// ── Campanhas ────────────────────────────────────────────────────────────────

const HOJE = new Date('2026-10-15T12:00:00');

const campanha = (extra = {}) => ({
  id: 1,
  titulo: 'Antes da chuva',
  chamada: 'Bueiro entupido agora é rua alagada em janeiro.',
  status: 'publicada',
  inicio: '2026-10-01',
  fim: '2026-10-31',
  city_id: 7,
  editor_id: 'u-editor',
  ...extra,
});

test('campanha publicada dentro do período está no ar', () => {
  assert.equal(vigente(campanha(), HOJE), true);
});

test('rascunho nunca está no ar', () => {
  assert.equal(vigente(campanha({ status: 'rascunho' }), HOJE), false);
});

test('o último dia vale inteiro', () => {
  // Comparar com hora encerraria a campanha um dia antes do que está escrito.
  const c = campanha({ fim: '2026-10-15' });
  assert.equal(vigente(c, new Date('2026-10-15T23:59:00')), true);
  assert.equal(diasRestantes(c, HOJE), 0);
});

test('passou do fim, some sozinha', () => {
  assert.equal(vigente(campanha({ fim: '2026-10-14' }), HOJE), false);
});

test('a campanha da cidade vence a nacional', () => {
  const escolhida = campanhaVigente(
    [
      campanha({ id: 1, city_id: null, titulo: 'Nacional' }),
      campanha({ id: 2, city_id: 7, titulo: 'Da cidade' }),
    ],
    7,
    HOJE
  );

  assert.equal(escolhida.titulo, 'Da cidade');
});

test('campanha de outra cidade não aparece', () => {
  assert.equal(campanhaVigente([campanha({ city_id: 99 })], 7, HOJE), null);
});

test('entre duas da mesma cidade, vale a mais recente', () => {
  const escolhida = campanhaVigente(
    [
      campanha({ id: 1, inicio: '2026-10-01', titulo: 'Antiga' }),
      campanha({ id: 2, inicio: '2026-10-10', titulo: 'Nova' }),
    ],
    7,
    HOJE
  );

  assert.equal(escolhida.titulo, 'Nova');
});

test('a chamada informa o prazo sem inventar pressa', () => {
  const c = chamadaDaCampanha(campanha(), HOJE);
  assert.match(c.prazo, /Termina em 16 dias/);
  assert.doesNotMatch(
    `${c.prazo} ${c.chamada}`,
    /corra|últimas horas|não perca|aproveite/i
  );
});

test('a campanha aponta para fluxo que já existe', () => {
  // Campanha que precisasse de tela própria seria funcionalidade com data de
  // validade.
  const chamada = chamadaDaCampanha(campanha({ categoria_id: 'iluminacao' }), HOJE);
  assert.ok(chamada.acao.para.startsWith('/rota-do-dia?'));
  assert.match(chamada.acao.para, /categoria=iluminacao/);
  assert.match(chamada.acao.para, /campanha=/);
  assert.equal(chamadaDaCampanha(campanha(), HOJE).acao.para, '/missoes');
});

test('campanha sem quem assina não publica', () => {
  const r = podePublicarCampanha({ ...campanha(), editor_id: null });
  assert.equal(r.ok, false);
  assert.ok(r.faltas.includes('Quem assina'));
});

test('campanha sem chamada não publica', () => {
  assert.equal(podePublicarCampanha({ ...campanha(), chamada: '  ' }).ok, false);
});

test('campanha sem fim não é sazonal', () => {
  const r = podePublicarCampanha({ ...campanha(), fim: '2027-06-01' });
  assert.equal(r.ok, false);
  assert.ok(r.faltas.some((f) => f.includes(String(DURACAO_MAXIMA_DIAS))));
});

test('campanha completa publica', () => {
  assert.equal(podePublicarCampanha(campanha()).ok, true);
});
