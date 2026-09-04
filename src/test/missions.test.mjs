// Central de missões: escada progressiva, nível e agrupamento.
//   node --test src/test/missions.test.mjs
//
// A escada é o que faz a central continuar tendo o que oferecer no segundo mês.
// Errar a etapa atual mostra a meta errada; errar o progresso mostra uma barra
// que não corresponde ao esforço — e as duas coisas quebram a única promessa
// que uma central de missões faz.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MISSOES,
  TRILHAS,
  alvoDaEtapa,
  etapaAtual,
  avaliarMissoes,
  missoesPorTrilha,
  etapasConcluidas,
} from '../lib/missions.js';

// ── Escada ────────────────────────────────────────────────────────────────────

test('do zero, a meta é o primeiro degrau', () => {
  const r = etapaAtual([3, 5, 10], 0);
  assert.equal(r.etapa, 1);
  assert.equal(r.alvo, 3);
  assert.equal(r.anterior, 0);
  assert.equal(r.completa, false);
});

test('atingir o degrau abre o próximo', () => {
  // Cumprir 3 não encerra a missão: abre a de 5. É o que a torna progressiva.
  const r = etapaAtual([3, 5, 10], 3);
  assert.equal(r.etapa, 2);
  assert.equal(r.alvo, 5);
  assert.equal(r.anterior, 3);
});

test('no meio de um degrau, a meta continua a mesma', () => {
  const r = etapaAtual([3, 5, 10], 4);
  assert.equal(r.etapa, 2);
  assert.equal(r.alvo, 5);
});

test('escada vazia não quebra', () => {
  const r = etapaAtual([], 5);
  assert.equal(r.completa, true);
  assert.equal(r.alvo, null);
});

// ── Escada infinita ───────────────────────────────────────────────────────────

test('alvoDaEtapa reproduz os degraus escritos', () => {
  assert.equal(alvoDaEtapa([3, 5, 10, 25], 1), 3);
  assert.equal(alvoDaEtapa([3, 5, 10, 25], 4), 25);
});

test('passado o último degrau escrito, o próximo é o dobro arredondado', () => {
  assert.equal(alvoDaEtapa([3, 5, 10, 25], 5), 50);
  assert.equal(alvoDaEtapa([3, 5, 10, 25], 6), 100);
  assert.equal(alvoDaEtapa([3, 5, 10, 25], 7), 200);
});

test('a escada de quilômetros continua em números redondos', () => {
  assert.equal(alvoDaEtapa([5000, 15000, 40000, 100000], 5), 200000);
  assert.equal(alvoDaEtapa([5000, 15000, 40000, 100000], 6), 400000);
});

test('vencida a escada escrita, ainda há próxima meta', () => {
  // Era aqui que a missão virava troféu e o cartão perdia o botão.
  const r = etapaAtual([3, 5, 10, 25], 30);
  assert.equal(r.completa, false);
  assert.equal(r.alvo, 50);
  assert.equal(r.etapa, 5);
  assert.equal(r.anterior, 25);
  assert.equal(r.alemDaEscada, true);
});

test('dentro da escada escrita, alemDaEscada é falso', () => {
  assert.equal(etapaAtual([3, 5, 10, 25], 4).alemDaEscada, false);
});

test('valor absurdo não trava o laço', () => {
  const r = etapaAtual([3, 5, 10, 25], 1e9);
  assert.equal(r.completa, false);
  assert.ok(r.alvo > 1e9);
});

test('escada terminada em zero para em vez de girar para sempre', () => {
  // Nenhuma missão do catálogo é assim; a guarda existe para que uma escada
  // mal escrita falhe num teste em vez de travar o app de quem a abrir.
  const r = etapaAtual([0], 5);
  assert.equal(r.alvo, 0);
});

test('nenhuma missão do catálogo fica sem próximo passo', () => {
  const avaliadas = avaliarMissoes(
    { reports_count: 1e6, patrols_count: 1e6, total_confirmed: 1e6, signals_count: 1e6 },
    99
  );
  for (const m of avaliadas) {
    assert.equal(m.completa, false, `${m.id} ficou completa`);
    assert.ok(m.alvo > 0, `${m.id} ficou sem alvo`);
    assert.ok(m.acao, `${m.id} ficou sem ação`);
  }
});

test('o XP de missões nunca diminui com a escada infinita', () => {
  // A escada infinita paga degraus que antes não existiam. O que não pode
  // acontecer em nenhuma hipótese é alguém ACORDAR com menos XP do que dormiu:
  // isso é perda de progresso, e não há justificativa de produto para isso.
  //
  // O piso é calculado do jeito ANTIGO — quantos dos degraus ESCRITOS o
  // contador já venceu — e é contra ele que o valor novo é comparado. Um teste
  // que só checasse `>= 0` ou uma faixa larga não provaria nada: o número é
  // sempre positivo, e o que está em jogo é a comparação com o que se pagava.
  const casos = [
    {},
    { reports_count: 3 },
    { reports_count: 25 },
    { reports_count: 300 },
    { patrols_count: 10, total_confirmed: 60, signals_count: 200 },
    { total_distance_meters: 1e6 },
  ];

  for (const c of casos) {
    const piso = avaliarMissoes(c, 99).reduce((soma, m) => {
      const escrita = MISSOES.find((x) => x.id === m.id).alvos;
      return soma + escrita.filter((alvo) => m.atual >= alvo).length;
    }, 0);
    const agora = etapasConcluidas(c, 99);
    assert.ok(agora >= piso, `${JSON.stringify(c)}: ${agora} etapas < piso antigo de ${piso}`);
  }
});

test('quem passou muito do último degrau escrito passa a receber pelos gerados', () => {
  // A consequência declarada na spec §4.5, fixada em teste para que ela seja
  // uma decisão e não uma surpresa: 300 broncas numa escada [3,5,10,25] pagavam
  // 4 etapas e passam a pagar 7 — os degraus 50, 100 e 200 também caíram.
  const m = avaliarMissoes({ reports_count: 300 }, 99).find((x) => x.id === 'registrar_broncas');
  assert.equal(m.etapa - 1, 7, 'degraus vencidos: 3, 5, 10, 25, 50, 100, 200');
  assert.equal(m.alvo, 400);
});

// ── Progresso ─────────────────────────────────────────────────────────────────

test('a barra mede o degrau atual, não o caminho inteiro', () => {
  // Quem está em 4 numa escada 3→5 fez metade DESTE degrau. Medindo sobre o
  // total, a barra apareceria quase cheia por causa do que já ficou para trás,
  // e o passo seguinte pareceria um empurrão de nada.
  const m = avaliarMissoes({ reports_count: 4 }, 4).find((x) => x.id === 'registrar_broncas');
  assert.equal(m.alvo, 5);
  assert.equal(m.progresso, 0.5);
  assert.equal(m.faltam, 1);
});

test('progresso zerado no começo de um degrau novo', () => {
  const m = avaliarMissoes({ reports_count: 3 }, 4).find((x) => x.id === 'registrar_broncas');
  assert.equal(m.etapa, 2);
  assert.equal(m.progresso, 0);
});

test('valor muito acima do último degrau escrito continua medindo um degrau', () => {
  const m = avaliarMissoes({ reports_count: 999 }, 4).find((x) => x.id === 'registrar_broncas');
  assert.equal(m.completa, false);
  assert.ok(m.alvo > 999);
  assert.ok(m.progresso >= 0 && m.progresso <= 1);
  assert.match(m.rotulo, /999 \//);
});

// ── Nível ─────────────────────────────────────────────────────────────────────

test('missão acima do nível vem bloqueada, mas vem', () => {
  // Esconder faria a central parecer vazia e não daria motivo para subir.
  const todas = avaliarMissoes({}, 1);
  const compartilhar = todas.find((m) => m.id === 'compartilhar');
  assert.equal(compartilhar.bloqueada, true);
  assert.equal(compartilhar.nivelMinimo, 3);
});

test('subir de nível destrava', () => {
  const m = avaliarMissoes({}, 3).find((x) => x.id === 'compartilhar');
  assert.equal(m.bloqueada, false);
});

test('nível 1 já tem o que fazer', () => {
  // A primeira visita não pode ser uma tela só de cadeados.
  const abertas = avaliarMissoes({}, 1).filter((m) => !m.bloqueada);
  assert.ok(abertas.length >= 4, `só ${abertas.length} missões abertas no nível 1`);
});

// ── Contadores ────────────────────────────────────────────────────────────────

test('investigação lê a categoria certa', () => {
  const c = { confirmadasPorCategoria: { buracos: 4, iluminacao: 1 } };
  const avaliadas = avaliarMissoes(c, 4);
  assert.equal(avaliadas.find((m) => m.id === 'investigar_buracos').atual, 4);
  assert.equal(avaliadas.find((m) => m.id === 'investigar_iluminacao').atual, 1);
});

test('categoria sem nenhuma investigação fica em zero, não quebra', () => {
  const m = avaliarMissoes({ confirmadasPorCategoria: {} }, 4)
    .find((x) => x.id === 'investigar_buracos');
  assert.equal(m.atual, 0);
  assert.equal(m.alvo, 3);
});

test('contadores ausentes viram zero', () => {
  const avaliadas = avaliarMissoes(undefined, 1);
  assert.equal(avaliadas.length, MISSOES.length);
  assert.ok(avaliadas.every((m) => m.atual === 0));
});

test('distância aparece em km no rótulo', () => {
  const m = avaliarMissoes({ total_distance_meters: 2400 }, 4)
    .find((x) => x.id === 'quilometros');
  assert.match(m.rotulo, /2,4 km/);
});

// ── Agrupamento ───────────────────────────────────────────────────────────────

test('agrupa por trilha, na ordem definida', () => {
  const trilhas = missoesPorTrilha({}, 4);
  assert.deepEqual(
    trilhas.map((t) => t.id),
    Object.values(TRILHAS).sort((a, b) => a.ordem - b.ordem).map((t) => t.id)
  );
});

test('dentro da trilha: o que dá para fazer vem antes do cadeado', () => {
  const c = { patrols_count: 999, total_confirmed: 1 };
  const patrulha = missoesPorTrilha(c, 1).find((t) => t.id === 'patrulha');

  // 'patrulhar' está muito além da escada escrita mas continua ativa;
  // 'confirmar_patrulhando' e 'quilometros' pedem nível maior.
  assert.equal(patrulha.missoes[0].id, 'patrulhar');
  assert.equal(patrulha.missoes[0].completa, false);
  assert.ok(patrulha.missoes[0].alvo > 999);
  assert.ok(patrulha.missoes[patrulha.missoes.length - 1].bloqueada);
});

test('toda missão tem id único', () => {
  const ids = MISSOES.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('toda missão aponta para uma trilha que existe', () => {
  for (const m of MISSOES) {
    assert.ok(TRILHAS[m.trilha], `trilha desconhecida em ${m.id}: ${m.trilha}`);
  }
});

test('missão de investigação passa pelo seletor antes de iniciar a patrulha', () => {
  const investigacoes = MISSOES.filter((missao) => missao.trilha === 'investigacao');
  assert.ok(investigacoes.length > 0);
  for (const missao of investigacoes) {
    assert.match(missao.acao.para, /^\/patrulhar\?categoria=/);
    assert.doesNotMatch(missao.acao.para, /^\/patrulhar\//);
  }
});

test('toda escada é crescente', () => {
  // Um degrau menor que o anterior seria alcançado no mesmo instante que ele, e
  // a missão pularia duas etapas de uma vez.
  for (const m of MISSOES) {
    for (let i = 1; i < m.alvos.length; i += 1) {
      assert.ok(m.alvos[i] > m.alvos[i - 1], `escada fora de ordem em ${m.id}`);
    }
  }
});

// ── Total ─────────────────────────────────────────────────────────────────────

test('conta as etapas já vencidas', () => {
  const c = { reports_count: 5, comments_count: 3 };
  // registrar: 3 e 5 vencidos = 2 etapas. comentar: 3 vencido = 1 etapa.
  assert.equal(etapasConcluidas(c, 4), 3);
});

test('sem nada feito, nenhuma etapa vencida', () => {
  assert.equal(etapasConcluidas({}, 4), 0);
});

// ── XP e medalhas no cartão ─────────────────────────────────────────────────

test('a etapa mostra o bônus MAIS o que as ações que faltam já valem', () => {
  // Zerado: "Registre broncas" está em 0/3, e cada bronca vale 10.
  const m = avaliarMissoes({}).find((x) => x.id === 'registrar_broncas');

  assert.equal(m.xpEtapa, 15);
  assert.equal(m.xpPorAcao, 10);
  assert.equal(m.faltam, 3);
  assert.equal(m.xpAteAEtapa, 15 + 3 * 10);
});

test('missão sem ganho próprio mostra só o bônus da etapa', () => {
  // Sair em patrulha não paga por si — o que paga é o que se faz nela.
  const m = avaliarMissoes({}).find((x) => x.id === 'patrulhar');
  assert.equal(m.xpPorAcao, 0);
  assert.equal(m.xpAteAEtapa, 15);
});

test('não há missão sem XP a prometer, por mais alto que esteja o contador', () => {
  const m = avaliarMissoes({ reports_count: 9999 }).find((x) => x.id === 'registrar_broncas');
  assert.equal(m.completa, false);
  assert.ok(m.xpAteAEtapa > 0);
});

test('as medalhas saem do contador compartilhado, não de uma lista à mão', () => {
  const m = avaliarMissoes({}).find((x) => x.id === 'cumprir_missoes');
  const ids = m.medalhas.map((q) => q.id);

  assert.deepEqual(ids.sort(), ['missoes_10', 'primeira_missao']);
  assert.ok(m.medalhas.every((q) => q.conquistada === false));
});

test('medalha já ganha aparece marcada, não some do cartão', () => {
  const m = avaliarMissoes({ missions_count: 3 }).find(
    (x) => x.id === 'cumprir_missoes'
  );
  const porId = Object.fromEntries(m.medalhas.map((q) => [q.id, q]));

  assert.equal(porId.primeira_missao.conquistada, true, '3 ≥ 1');
  assert.equal(porId.missoes_10.conquistada, false, '3 < 10');
});

test('investigar por categoria empurra as medalhas de confirmação, que são gerais', () => {
  // A missão conta buracos; a medalha conta confirmações de qualquer categoria.
  // Ligar as duas pelo contador da medalha é o que faz o cartão dizer a verdade.
  const m = avaliarMissoes({ total_confirmed: 12 }).find(
    (x) => x.id === 'investigar_buracos'
  );
  const porId = Object.fromEntries(m.medalhas.map((q) => [q.id, q]));

  assert.equal(porId.confirmacoes_10.conquistada, true);
  assert.equal(porId.confirmacoes_50.conquistada, false);
});

test('toda missão que declara medalhas encontra pelo menos uma', () => {
  // Um `medalhasPor` com nome errado devolveria lista vazia em silêncio — a
  // missão diria que não vale medalha nenhuma, e ninguém notaria.
  for (const m of avaliarMissoes({})) {
    const declarou = MISSOES.find((x) => x.id === m.id)?.medalhasPor;
    if (!declarou) continue;
    assert.ok(
      m.medalhas.length > 0,
      `${m.id} aponta para o contador "${declarou}", que nenhuma medalha usa`
    );
  }
});
