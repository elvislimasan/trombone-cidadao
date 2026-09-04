// Pontos, nível e detecção de avanço.
//   node --test src/test/scoring.test.mjs
//
// A conta saiu do SQL para cá porque as missões passaram a valer pontos e o
// catálogo delas é JavaScript. O risco dessa mudança é um só, e é o que os
// primeiros testes guardam: os pesos daqui divergirem dos da migração 174, e o
// mesmo usuário passar a ter dois totais diferentes conforme a tela.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  pontosDeAcoes,
  pontosDeMissoes,
  nivelDe,
  proximaFaixa,
  placar,
  PONTOS_POR_ETAPA,
  FAIXAS,
  minimoDoNivel,
} from '../lib/scoring.js';
import { PONTOS } from '../lib/patrolGame.js';
import { PONTOS_DIARIA, PONTOS_DIA_PERFEITO } from '../lib/dailies.js';
import { avancosEntre } from '../lib/missions.js';

// ── Pesos ─────────────────────────────────────────────────────────────────────

test('os pesos são os da migração 174', () => {
  // Se alguém mudar um lado sem o outro, o perfil e a central mostram totais
  // diferentes para a mesma pessoa.
  assert.equal(PONTOS.bronca, 10);
  assert.equal(PONTOS.missao, 12);
  assert.equal(PONTOS.sinal, 3);
  assert.equal(PONTOS.atualizacao, 5);
  assert.equal(PONTOS.comentario, 2);
  assert.equal(PONTOS.apoio, 1);
});

test('soma as ações com o peso de cada uma', () => {
  const c = {
    reports_count: 2,      // 20
    missions_count: 1,     // 12
    signals_count: 3,      //  9
    updates_count: 4,      // 20
    comments_count: 5,     // 10
    upvotes_given: 6,      //  6
  };
  assert.equal(pontosDeAcoes(c), 77);
});

test('inclui diárias concluídas e dias perfeitos', () => {
  const c = { dailies_completed: 3, perfect_days: 1 };
  assert.equal(
    pontosDeAcoes(c),
    3 * PONTOS_DIARIA + PONTOS_DIA_PERFEITO
  );
});

test('contadores vazios não viram NaN', () => {
  assert.equal(pontosDeAcoes(), 0);
  assert.equal(pontosDeAcoes({}), 0);
  assert.equal(pontosDeMissoes({}), 0);
});

// ── Bônus de missão ───────────────────────────────────────────────────────────

test('a etapa vale mais que a bronca solta', () => {
  // A etapa exige várias ações do mesmo tipo; o prêmio reconhece a insistência,
  // não o ato — que já foi pago quando aconteceu.
  assert.ok(PONTOS_POR_ETAPA > PONTOS.bronca);
});

test('a etapa é bônus, não substituição', () => {
  // 3 broncas = 30 das broncas + 15 da etapa vencida.
  const c = { reports_count: 3 };
  assert.equal(pontosDeAcoes(c), 30);
  assert.equal(pontosDeMissoes(c), PONTOS_POR_ETAPA);
  assert.equal(placar(c).points, 30 + PONTOS_POR_ETAPA);
});

test('etapas de missões diferentes somam', () => {
  const c = { reports_count: 3, comments_count: 3 };
  assert.equal(pontosDeMissoes(c), PONTOS_POR_ETAPA * 2);
});

test('o bônus não depende do nível', () => {
  // A armadilha que a implementação evita: missão dá ponto, ponto define nível,
  // nível decide o que aparece. Contar só as desbloqueadas faria o total
  // depender do nível que depende do total.
  const c = { shares_count: 5 };   // missão de nível 3
  assert.ok(pontosDeMissoes(c) > 0, 'missão bloqueada precisa contar igual');
});

// ── Nível ─────────────────────────────────────────────────────────────────────

test('as faixas são as da 169', () => {
  assert.equal(nivelDe(0).level, 1);
  assert.equal(nivelDe(19).level, 1);
  assert.equal(nivelDe(20).level, 2);
  assert.equal(nivelDe(99).level, 2);
  assert.equal(nivelDe(100).level, 3);
  assert.equal(nivelDe(299).level, 3);
  assert.equal(nivelDe(300).level, 4);
});

test('nível traz o rótulo junto', () => {
  assert.equal(nivelDe(150).label, 'Voz da comunidade');
  assert.equal(nivelDe(5).label, 'Novo por aqui');
});

test('ponto negativo ou inválido não quebra o nível', () => {
  assert.equal(nivelDe(-50).level, 1);
  assert.equal(nivelDe(undefined).level, 1);
});

test('toda faixa tem nível e rótulo únicos', () => {
  assert.equal(new Set(FAIXAS.map((f) => f.nivel)).size, FAIXAS.length);
  assert.equal(new Set(FAIXAS.map((f) => f.rotulo)).size, FAIXAS.length);
});

// ── Próxima faixa ─────────────────────────────────────────────────────────────

test('diz quanto falta e o quanto do trecho já foi', () => {
  const p = proximaFaixa(60);
  assert.equal(p.nivel, 3);
  assert.equal(p.faltam, 40);
  assert.equal(p.fracao, 0.5);   // 60 de 20→100
});

// O NIVEL 4 DEIXOU DE SER O FIM
//
// Enquanto era, quem mais usava o app perdia a unica medida de progresso que a
// central oferece: chegava em "Guardiao da cidade" e via "nivel maximo
// alcancado" com uma barra sem funcao. Agora sempre ha um proximo alvo.
test('acima do nivel 4 a escada continua', () => {
  assert.equal(nivelDe(500).level, 4);
  assert.equal(nivelDe(800).level, 5);
  assert.equal(nivelDe(800).label, 'Sentinela do bairro');
  assert.equal(nivelDe(1600).level, 6);
  assert.equal(nivelDe(3000).level, 7);
  assert.equal(nivelDe(5200).level, 8);

  const p = proximaFaixa(500);
  assert.equal(p.nivel, 5);
  assert.equal(p.minimo, 800);
  assert.equal(p.faltam, 300);
});

// Passado o ultimo nome, os degraus saem da formula — e nunca acabam.
test('depois do ultimo nome os niveis seguem por formula, sem teto', () => {
  const nono = minimoDoNivel(9);
  assert.ok(nono > 5200, 'o degrau seguinte precisa ser maior que o ultimo nomeado');
  assert.equal(nono % 100, 0, 'degraus arredondados na centena');

  assert.equal(nivelDe(nono).level, 9);
  assert.equal(nivelDe(nono).label, 'Lenda da cidade II');
  assert.equal(nivelDe(minimoDoNivel(12)).level, 12);

  // Cada degrau custa mais que o anterior: sem isso os niveis altos cairiam em
  // sequencia num fim de semana.
  for (let n = 5; n < 14; n += 1) {
    const passo = minimoDoNivel(n + 1) - minimoDoNivel(n);
    const anterior = minimoDoNivel(n) - minimoDoNivel(n - 1);
    assert.ok(passo > anterior, `o degrau ${n + 1} deveria custar mais que o ${n}`);
  }
});

test('proximaFaixa nunca devolve null, em nenhum total', () => {
  for (const total of [0, 19, 500, 5200, minimoDoNivel(11), 900000]) {
    const p = proximaFaixa(total);
    assert.ok(p, `${total} ficou sem proxima faixa`);
    assert.ok(p.faltam > 0, `${total} deveria ter algo a percorrer`);
    assert.ok(p.fracao >= 0 && p.fracao <= 1);
    assert.equal(p.nivel, nivelDe(total).level + 1);
  }
});

test('começando do zero, a fração é zero', () => {
  assert.equal(proximaFaixa(0).fracao, 0);
});

// ── Placar ────────────────────────────────────────────────────────────────────

test('o placar separa ação de missão', () => {
  // Sem a separação, o bônus fica invisível — e quem não vê o prêmio não
  // persegue a etapa.
  const p = placar({ reports_count: 3, comments_count: 1 });
  assert.equal(p.pontosAcoes, 32);
  assert.equal(p.pontosMissoes, PONTOS_POR_ETAPA);
  assert.equal(p.points, 32 + PONTOS_POR_ETAPA);
});

// ── Avanço ────────────────────────────────────────────────────────────────────

test('detecta o avanço e diz de quanto para quanto', () => {
  const avancos = avancosEntre({ reports_count: 0 }, { reports_count: 1 });
  const m = avancos.find((x) => x.id === 'registrar_broncas');
  assert.equal(m.de, 0);
  assert.equal(m.para, 1);
  assert.equal(m.alvo, 3);
  assert.equal(m.venceuEtapa, false);
});

test('marca quando a etapa foi vencida', () => {
  const m = avancosEntre({ reports_count: 2 }, { reports_count: 3 })
    .find((x) => x.id === 'registrar_broncas');
  assert.equal(m.venceuEtapa, true);
  assert.equal(m.completou, false);
});

test('passar do último degrau escrito vence a etapa, mas não "acaba" mais a missão', () => {
  // Com a escada infinita, `completa` só é verdadeira para o caso degenerado
  // (ver missions.test.mjs) — nenhuma missão do catálogo tem escada vazia, então
  // `completou` nunca dispara para elas: vencer o degrau 25 só abre o 50.
  const m = avancosEntre({ reports_count: 24 }, { reports_count: 25 })
    .find((x) => x.id === 'registrar_broncas');
  assert.equal(m.venceuEtapa, true);
  assert.equal(m.completou, false);
});

test('sem mudança, nada a comemorar', () => {
  assert.deepEqual(avancosEntre({ reports_count: 3 }, { reports_count: 3 }), []);
});

test('sem foto anterior, não inventa avanço', () => {
  // Primeira carga da sessão: não há com o que comparar, e mostrar tudo como
  // novidade celebraria o que a pessoa fez semana passada.
  assert.deepEqual(avancosEntre(null, { reports_count: 5 }), []);
});

test('a etapa vencida ganha a vez na tela', () => {
  // Uma ação pode mexer em duas missões; só uma aparece, e é a que mais merece.
  const antes = { reports_count: 2, confirmadasPorCategoria: { buracos: 0 } };
  const depois = { reports_count: 3, confirmadasPorCategoria: { buracos: 1 } };
  const avancos = avancosEntre(antes, depois);
  assert.equal(avancos[0].id, 'registrar_broncas');
  assert.equal(avancos[0].venceuEtapa, true);
});

test('missão bloqueada também aparece no avanço', () => {
  // O cadeado é da vitrine, não do progresso. Esconder o avanço faria a pessoa
  // achar que a ação não contou.
  const m = avancosEntre({ shares_count: 0 }, { shares_count: 1 })
    .find((x) => x.id === 'compartilhar');
  assert.ok(m, 'o avanço da missão bloqueada sumiu');
});
