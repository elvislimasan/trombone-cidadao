// Regras de jogo do modo patrulha.
//   node --test src/test/patrolGame.test.mjs
//
// Sequência e conquistas são derivadas, não gravadas — então dá para verificar
// todas as bordas (dia pulado, virada de mês, empate no alvo) sem banco.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularSequencia,
  avaliarConquistas,
  conquistasNovas,
  CONQUISTAS,
  PONTOS,
  PONTOS_POR_CONFIRMACAO,
  tituloDoBairro,
  titulosDeBairro,
  faltaParaSubir,
  resumoDeBairros,
  avaliarPatrulha,
} from '../lib/patrolGame.js';

const dia = (ano, mes, d, hora = 12) => new Date(ano, mes - 1, d, hora);

// ── Sequência ─────────────────────────────────────────────────────────────────

test('sem patrulhas, sequência é zero', () => {
  assert.equal(calcularSequencia([], dia(2026, 8, 18)), 0);
  assert.equal(calcularSequencia(null, dia(2026, 8, 18)), 0);
});

test('patrulhou hoje: sequência de 1', () => {
  assert.equal(calcularSequencia([dia(2026, 8, 18, 9)], dia(2026, 8, 18, 20)), 1);
});

test('três dias seguidos terminando hoje', () => {
  const datas = [dia(2026, 8, 16), dia(2026, 8, 17), dia(2026, 8, 18)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18, 21)), 3);
});

test('ordem das datas não importa', () => {
  const datas = [dia(2026, 8, 18), dia(2026, 8, 16), dia(2026, 8, 17)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18)), 3);
});

test('duas patrulhas no mesmo dia contam como um', () => {
  const datas = [dia(2026, 8, 18, 8), dia(2026, 8, 18, 19), dia(2026, 8, 17)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18, 22)), 2);
});

test('ainda não patrulhou hoje, mas patrulhou ontem: sequência viva', () => {
  // Cortar à meia-noite puniria quem saiu às 23h de ontem e ainda não saiu hoje.
  const datas = [dia(2026, 8, 16), dia(2026, 8, 17)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18, 10)), 2);
});

test('um dia inteiro em branco quebra a sequência', () => {
  const datas = [dia(2026, 8, 14), dia(2026, 8, 15)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18)), 0);
});

test('dia pulado no meio conta só o trecho recente', () => {
  const datas = [dia(2026, 8, 10), dia(2026, 8, 11), dia(2026, 8, 17), dia(2026, 8, 18)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18)), 2);
});

test('a sequência atravessa a virada de mês', () => {
  const datas = [dia(2026, 7, 30), dia(2026, 7, 31), dia(2026, 8, 1)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 1, 20)), 3);
});

test('a sequência atravessa a virada de ano', () => {
  const datas = [dia(2025, 12, 31), dia(2026, 1, 1)];
  assert.equal(calcularSequencia(datas, dia(2026, 1, 1, 18)), 2);
});

test('datas inválidas são ignoradas sem quebrar', () => {
  const datas = ['não é data', dia(2026, 8, 18)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18)), 1);
});

// ── Conquistas ────────────────────────────────────────────────────────────────

const stats = (extra = {}) => ({
  patrols_count: 0,
  total_passed: 0,
  total_confirmed: 0,
  total_distance_meters: 0,
  sequencia: 0,
  ...extra,
});

const porId = (lista, id) => lista.find((c) => c.id === id);

test('quem nunca patrulhou não tem conquista desbloqueada', () => {
  const r = avaliarConquistas(stats());
  assert.equal(r.filter((c) => c.desbloqueada).length, 0);
  assert.equal(r.length, CONQUISTAS.length);
});

test('stats ausente não quebra a avaliação', () => {
  assert.equal(avaliarConquistas(null).filter((c) => c.desbloqueada).length, 0);
  assert.equal(avaliarConquistas(undefined).length, CONQUISTAS.length);
});

test('a primeira patrulha desbloqueia a primeira medalha', () => {
  const r = avaliarConquistas(stats({ patrols_count: 1 }));
  assert.equal(porId(r, 'primeira_patrulha').desbloqueada, true);
});

test('atingir exatamente o alvo desbloqueia', () => {
  const r = avaliarConquistas(stats({ total_confirmed: 10 }));
  assert.equal(porId(r, 'confirmacoes_10').desbloqueada, true);
  assert.equal(porId(r, 'confirmacoes_50').desbloqueada, false);
});

test('um a menos que o alvo não desbloqueia', () => {
  const r = avaliarConquistas(stats({ total_confirmed: 9 }));
  assert.equal(porId(r, 'confirmacoes_10').desbloqueada, false);
});

test('progresso é fração de 0 a 1 e não passa de 1', () => {
  const meio = porId(avaliarConquistas(stats({ total_confirmed: 5 })), 'confirmacoes_10');
  assert.equal(meio.progresso, 0.5);
  const estourado = porId(avaliarConquistas(stats({ total_confirmed: 999 })), 'confirmacoes_10');
  assert.equal(estourado.progresso, 1);
});

test('distância aparece em km no rótulo', () => {
  const r = porId(avaliarConquistas(stats({ total_distance_meters: 2500 })), 'distancia_5km');
  assert.equal(r.rotulo, '2,5 km / 5,0 km');
  assert.equal(r.desbloqueada, false);
});

test('a sequência alimenta as conquistas de dias seguidos', () => {
  const r = avaliarConquistas(stats({ sequencia: 3 }));
  assert.equal(porId(r, 'sequencia_3').desbloqueada, true);
  assert.equal(porId(r, 'sequencia_7').desbloqueada, false);
});

test('valores negativos ou inválidos não viram progresso', () => {
  const r = porId(avaliarConquistas(stats({ total_confirmed: -5 })), 'confirmacoes_10');
  assert.equal(r.atual, 0);
  assert.equal(r.progresso, 0);
});

// ── Novidades ─────────────────────────────────────────────────────────────────

test('só comemora o que acabou de desbloquear', () => {
  const antes = stats({ total_confirmed: 9, patrols_count: 4 });
  const depois = stats({ total_confirmed: 12, patrols_count: 5 });
  const novas = conquistasNovas(antes, depois);
  assert.deepEqual(novas.map((c) => c.id), ['confirmacoes_10']);
});

test('medalha antiga não reaparece como novidade', () => {
  // A primeira patrulha já estava desbloqueada; a quinta não pode comemorá-la
  // de novo.
  const antes = stats({ patrols_count: 4 });
  const depois = stats({ patrols_count: 5 });
  assert.deepEqual(conquistasNovas(antes, depois), []);
});

test('uma patrulha pode desbloquear várias de uma vez', () => {
  const antes = stats();
  const depois = stats({ patrols_count: 1, total_confirmed: 10, sequencia: 3 });
  const ids = conquistasNovas(antes, depois).map((c) => c.id).sort();
  assert.deepEqual(ids, ['confirmacoes_10', 'primeira_patrulha', 'sequencia_3']);
});

// ── Pontos ────────────────────────────────────────────────────────────────────

test('a confirmação vale o mesmo que report_updates na migração 169', () => {
  // Divergir faria o "+X" da tela não bater com o nível mostrado depois.
  assert.equal(PONTOS_POR_CONFIRMACAO, 5);
});

test('todo id de conquista é único', () => {
  const ids = CONQUISTAS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ── Fuso horário ──────────────────────────────────────────────────────────────

test('a data que vem do banco não escorrega um dia', () => {
  // `get_patrol_days` devolve 'AAAA-MM-DD' já convertido para America/Sao_Paulo.
  // Passar essa string por `new Date` a lia como meia-noite UTC — 21h do dia
  // ANTERIOR no Brasil —, e a sequência de quem patrulhou ontem zerava.
  const hoje = dia(2026, 8, 19);
  assert.equal(calcularSequencia(['2026-08-18', '2026-08-17'], hoje), 2);
  assert.equal(calcularSequencia(['2026-08-19'], hoje), 1);
});

test('data com hora junto também é lida como dia local', () => {
  const hoje = dia(2026, 8, 19);
  assert.equal(calcularSequencia(['2026-08-19T23:40:00'], hoje), 1);
});

// ── Títulos de bairro ─────────────────────────────────────────────────────────

test('o primeiro lugar do bairro vira Guardião', () => {
  const t = tituloDoBairro({ neighborhood: 'Centro', posicao: 1, participantes: 12 });
  assert.equal(t.titulo, 'Guardião de Centro');
  assert.equal(t.emoji, '👑');
});

test('segundo e terceiro viram Vigia', () => {
  assert.equal(
    tituloDoBairro({ neighborhood: 'Centro', posicao: 2, participantes: 12 }).titulo,
    'Vigia de Centro'
  );
  assert.equal(
    tituloDoBairro({ neighborhood: 'Centro', posicao: 3, participantes: 12 }).titulo,
    'Vigia de Centro'
  );
});

test('fora do top 10 não há título', () => {
  assert.equal(tituloDoBairro({ neighborhood: 'Centro', posicao: 11, participantes: 40 }), null);
});

test('sozinho no bairro é Pioneiro, não Guardião', () => {
  // Liderar um placar de um participante não é liderar nada, e o título
  // perderia o sentido justamente para quem o exibisse primeiro.
  const t = tituloDoBairro({ neighborhood: 'Vila Nova', posicao: 1, participantes: 1 });
  assert.equal(t.titulo, 'Pioneiro de Vila Nova');
});

test('com companhia, o Pioneiro vira Guardião', () => {
  const t = tituloDoBairro({ neighborhood: 'Vila Nova', posicao: 1, participantes: 2 });
  assert.equal(t.titulo, 'Guardião de Vila Nova');
});

test('sem bairro ou com posição inválida, nenhum título é inventado', () => {
  assert.equal(tituloDoBairro({ neighborhood: null, posicao: 1, participantes: 5 }), null);
  assert.equal(tituloDoBairro({ neighborhood: 'Centro', posicao: 0, participantes: 5 }), null);
  assert.equal(tituloDoBairro(null), null);
});

test('titulosDeBairro descarta os bairros sem título', () => {
  const lugares = [
    { neighborhood: 'Centro', posicao: 1, participantes: 9 },
    { neighborhood: 'Alto', posicao: 30, participantes: 50 },
    { neighborhood: 'Beira Rio', posicao: 2, participantes: 9 },
  ];
  assert.deepEqual(
    titulosDeBairro(lugares).map((t) => t.bairro),
    ['Centro', 'Beira Rio']
  );
  assert.deepEqual(titulosDeBairro(null), []);
});

// ── Quanto falta para subir ───────────────────────────────────────────────────

const PLACAR = [
  { posicao: 1, pontos: 120 },
  { posicao: 2, pontos: 80 },
  { posicao: 3, pontos: 45 },
];

test('a meta é quem está logo à frente, não o líder', () => {
  // De 45 para 81 move alguém; de 45 para 121 não.
  assert.deepEqual(faltaParaSubir({ posicao: 3, pontos: 45 }, PLACAR), {
    pontos: 36,
    posicaoAlvo: 2,
  });
});

test('quem lidera não tem para onde subir', () => {
  assert.equal(faltaParaSubir({ posicao: 1, pontos: 120 }, PLACAR), null);
  assert.equal(faltaParaSubir({ posicao: 3, pontos: 45 }, []), null);
  assert.equal(faltaParaSubir(null, PLACAR), null);
});

test('empate exige ao menos um ponto para desempatar', () => {
  const empate = [{ posicao: 1, pontos: 50 }, { posicao: 2, pontos: 50 }];
  assert.equal(faltaParaSubir({ posicao: 2, pontos: 50 }, empate).pontos, 1);
});

// ── Resumo dos bairros ────────────────────────────────────────────────────────

test('resumoDeBairros conta ativos e liderados', () => {
  const lugares = [
    { neighborhood: 'Centro', pontos: 90, acoes: 12, posicao: 1 },
    { neighborhood: 'Alto', pontos: 30, acoes: 10, posicao: 4 },
    { neighborhood: 'Beira Rio', pontos: 15, acoes: 5, posicao: 1 },
  ];
  const r = resumoDeBairros(lugares);
  assert.equal(r.bairros_ativos, 3);
  assert.equal(r.bairros_liderados, 2);
  assert.equal(r.melhor_bairro, 'Centro');
});

test('o melhor bairro é o de mais PONTOS, não o de mais ações', () => {
  // Um bairro com poucas missões (12 pts cada) pode valer mais que outro com
  // muitos sinais (3 pts cada) — e é o de mais pontos que dá o título.
  const lugares = [
    { neighborhood: 'Missões', pontos: 60, acoes: 5, posicao: 1 },
    { neighborhood: 'Sinais', pontos: 30, acoes: 10, posicao: 1 },
  ];
  const r = resumoDeBairros(lugares);
  assert.equal(r.melhor_bairro, 'Missões');
  assert.equal(r.acoes_no_melhor, 5);
});

test('sem bairro nenhum, tudo é zero', () => {
  assert.deepEqual(resumoDeBairros([]), {
    bairros_ativos: 0,
    bairros_liderados: 0,
    acoes_no_melhor: 0,
    melhor_bairro: null,
  });
  assert.equal(resumoDeBairros(null).bairros_ativos, 0);
});

// ── Medalhas de sinal e missão ────────────────────────────────────────────────

test('a medalha de sinais cai no décimo', () => {
  const em = (n) => avaliarConquistas({ signals_count: n }).find((c) => c.id === 'sinais_10');
  assert.equal(em(9).desbloqueada, false);
  assert.equal(em(10).desbloqueada, true);
});

test('cumprir a primeira missão desbloqueia, e só uma vez', () => {
  const novas = conquistasNovas({ missions_count: 0 }, { missions_count: 1 });
  assert.deepEqual(novas.map((c) => c.id), ['primeira_missao']);
  assert.deepEqual(conquistasNovas({ missions_count: 1 }, { missions_count: 2 }), []);
});

test('liderar um bairro é medalha', () => {
  const c = avaliarConquistas({ bairros_liderados: 1 }).find((x) => x.id === 'lider_de_bairro');
  assert.equal(c.desbloqueada, true);
});

// ── Escala de pontos ──────────────────────────────────────────────────────────

test('a missão paga mais que a bronca própria', () => {
  // Sem esse prêmio, cumprir missão seria estritamente pior que registrar o que
  // se encontrou no próprio caminho — e ninguém cumpriria nenhuma.
  assert.ok(PONTOS.missao > PONTOS.bronca);
});

test('o sinal paga menos que o cadastro completo, e mais que nada', () => {
  assert.ok(PONTOS.sinal < PONTOS.bronca);
  assert.ok(PONTOS.sinal > 0);
});

// ── Guardar ou descartar ──────────────────────────────────────────────────────

test('qualquer ação salva a patrulha, por menor que ela seja', () => {
  // Uma saída de trinta segundos que rendeu uma bronca vale mais que uma hora
  // de carro sem nada.
  const r = avaliarPatrulha({
    duracaoS: 30,
    distanciaM: 0,
    contagens: { passadas: 1, confirmadas: 1 },
    feitos: { sinais: 0, missoes: 0, broncas: 0 },
  });
  assert.equal(r.houveAcao, true);
  assert.equal(r.descartavel, false);
});

test('sinal, missão e bronca contam como ação igual', () => {
  for (const feitos of [
    { sinais: 1, missoes: 0, broncas: 0 },
    { sinais: 0, missoes: 1, broncas: 0 },
    { sinais: 0, missoes: 0, broncas: 1 },
  ]) {
    const r = avaliarPatrulha({
      duracaoS: 10,
      distanciaM: 0,
      contagens: { confirmadas: 0 },
      feitos,
    });
    assert.equal(r.descartavel, false, JSON.stringify(feitos));
  }
});

test('sem ação e curta, sugere descartar', () => {
  const r = avaliarPatrulha({
    duracaoS: 40,
    distanciaM: 900,
    contagens: { confirmadas: 0 },
    feitos: {},
  });
  assert.equal(r.descartavel, true);
  assert.equal(r.motivo, 'curta');
});

test('sem ação e parada, sugere descartar mesmo tendo durado', () => {
  // Dez minutos no mesmo lugar produziram tanto quanto trinta segundos.
  const r = avaliarPatrulha({
    duracaoS: 600,
    distanciaM: 40,
    contagens: { confirmadas: 0 },
    feitos: {},
  });
  assert.equal(r.descartavel, true);
  assert.equal(r.motivo, 'parada');
});

test('sem ação, mas longa e percorrida, guarda', () => {
  // Andou de verdade: conta para a sequência e para as medalhas de distância,
  // mesmo que não tenha encontrado nada pelo caminho.
  const r = avaliarPatrulha({
    duracaoS: 1800,
    distanciaM: 4000,
    contagens: { confirmadas: 0 },
    feitos: {},
  });
  assert.equal(r.houveAcao, false);
  assert.equal(r.descartavel, false);
});

test('sessão vazia não quebra a avaliação', () => {
  const r = avaliarPatrulha();
  assert.equal(r.descartavel, true);
});
