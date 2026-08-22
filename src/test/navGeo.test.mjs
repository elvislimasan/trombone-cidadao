// Testes da geometria do modo navegação.
//   node --test src/test/navGeo.test.mjs
//
// Toda a decisão de alertar é função pura, então os limites (cone, distância,
// wrap de 360°) são verificáveis aqui — sem GPS, sem banco, sem dirigir.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  haversine,
  bearing,
  angleDiff,
  avaliarAlerta,
  selecionarAlertas,
  agruparAlertas,
  estimarMovimento,
  panParaOffsetDeTela,
  deveRegistrarPonto,
  distanciaTotal,
  caixaDeRaio,
  frasear,
  NAV_ALERTA,
  NAV_RASTRO,
  NAV_TRAJETO,
  alturaDoSol,
  ehNoite,
  simplificarRastro,
  rastroParaBanco,
  rastroDoBanco,
  MAX_PONTOS_GRAVADOS,
  enquadrarRastro,
  TOLERANCIA_SIMPLIFICACAO_M,
} from '../lib/navGeo.js';

// Ponto de referência: centro de Floresta-PE.
const BASE = { lat: -8.6017, lng: -38.5686 };

/** Move `metros` na direção `rumo` a partir de `origem`. */
const mover = (origem, rumo, metros) => {
  const R = 6371000;
  const d = metros / R;
  const b = (rumo * Math.PI) / 180;
  const lat1 = (origem.lat * Math.PI) / 180;
  const lng1 = (origem.lng * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b)
  );
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2)
    );
  return { lat: (lat2 * 180) / Math.PI, lng: (lng2 * 180) / Math.PI };
};

const posicao = (extra = {}) => ({
  ...BASE,
  heading: 0,
  speed: 10,
  accuracy: 8,
  ...extra,
});

const bronca = (rumo, metros, extra = {}) => ({
  id: `b-${rumo}-${metros}`,
  status: 'pending',
  ...mover(BASE, rumo, metros),
  ...extra,
});

// ── Primitivas ────────────────────────────────────────────────────────────────

test('haversine mede a distância que o gerador de pontos usou', () => {
  const alvo = mover(BASE, 45, 250);
  assert.ok(Math.abs(haversine(BASE, alvo) - 250) < 1);
});

test('bearing devolve o rumo usado para gerar o ponto', () => {
  assert.ok(Math.abs(bearing(BASE, mover(BASE, 137, 300)) - 137) < 0.5);
});

test('angleDiff atravessa a virada de 360° sem inverter o sinal', () => {
  assert.equal(angleDiff(350, 10), 20);
  assert.equal(angleDiff(10, 350), 20);
  assert.equal(angleDiff(0, 180), 180);
  assert.equal(angleDiff(90, 90), 0);
});

// ── Distância ─────────────────────────────────────────────────────────────────

// Distâncias em função da régua, não do número dela. Quando o raio caiu de
// 120 m para 30 m, oito testes quebraram por terem gravado "119" — todos
// verificavam a REGRA, e nenhum precisava saber o valor.
// Proporcionais à régua, não subtraindo um valor fixo: com o raio em 10 m,
// "régua menos 5" deixaria os pontos de teste espremidos uns sobre os outros e
// a ordenação por distância deixaria de ser verificável.
const DENTRO = NAV_ALERTA.distanciaAlertaM * 0.7;
const PERTINHO = NAV_ALERTA.distanciaAlertaM * 0.2;
const FORA = NAV_ALERTA.distanciaAlertaM * 1.3;

test('alerta dentro do limite de distância', () => {
  const r = avaliarAlerta(posicao(), bronca(0, DENTRO));
  assert.equal(r.alerta, true);
});

test('não alerta além do limite de distância', () => {
  const r = avaliarAlerta(posicao(), bronca(0, FORA));
  assert.equal(r.alerta, false);
  assert.equal(r.motivo, 'longe');
});

// ── Cone de direção ───────────────────────────────────────────────────────────

test('alerta o que está dentro do cone à frente', () => {
  const r = avaliarAlerta(posicao({ heading: 0 }), bronca(44, DENTRO));
  assert.equal(r.alerta, true);
});

test('não alerta o que está fora do cone', () => {
  const r = avaliarAlerta(posicao({ heading: 0 }), bronca(46, DENTRO));
  assert.equal(r.alerta, false);
  assert.equal(r.motivo, 'fora-do-cone');
});

test('não alerta o que ficou para trás', () => {
  const r = avaliarAlerta(posicao({ heading: 0 }), bronca(180, DENTRO));
  assert.equal(r.alerta, false);
  assert.equal(r.motivo, 'fora-do-cone');
});

test('o cone acompanha o rumo na virada de 360°', () => {
  // Rumo 350°, bronca em 10°: 20° de desvio. Com subtração crua daria 340 e a
  // bronca à frente seria descartada.
  const r = avaliarAlerta(posicao({ heading: 350 }), bronca(10, DENTRO));
  assert.equal(r.alerta, true);
});

// ── Guardas de estado ─────────────────────────────────────────────────────────

test('não alerta com o veículo parado', () => {
  const r = avaliarAlerta(posicao({ speed: 0.4 }), bronca(0, DENTRO));
  assert.equal(r.motivo, 'parado');
});

test('não alerta com sinal impreciso', () => {
  const r = avaliarAlerta(posicao({ accuracy: 90 }), bronca(0, DENTRO));
  assert.equal(r.motivo, 'sinal-fraco');
});

test('sinal com erro maior que a régua não decide nada', () => {
  // O teto de precisão acompanha o raio: com 30 m de régua, uma leitura com
  // 40 m de erro diria "está a menos de 30 m" com incerteza maior que a
  // própria medida.
  const r = avaliarAlerta(
    posicao({ accuracy: NAV_ALERTA.distanciaAlertaM + 10 }),
    bronca(0, DENTRO)
  );
  assert.equal(r.motivo, 'sinal-fraco');
});

test('não alerta bronca já resolvida', () => {
  const r = avaliarAlerta(posicao(), bronca(0, DENTRO, { status: 'resolved' }));
  assert.equal(r.motivo, 'status-nao-alertavel');
});

test('não repete alerta da mesma bronca', () => {
  const b = bronca(0, DENTRO);
  const r = avaliarAlerta(posicao(), b, { jaAlertadas: new Set([b.id]) });
  assert.equal(r.motivo, 'ja-alertada');
});

test('não alerta sem rumo conhecido', () => {
  const r = avaliarAlerta(posicao({ heading: null }), bronca(0, DENTRO));
  assert.equal(r.motivo, 'sem-rumo');
});

test('in-progress alerta igual a pending', () => {
  const r = avaliarAlerta(posicao(), bronca(0, DENTRO, { status: 'in-progress' }));
  assert.equal(r.alerta, true);
});

// ── Categoria ─────────────────────────────────────────────────────────────────

// A lista de categorias silenciosas saiu: a patrulha é sempre de UMA categoria
// e o corredor filtra na origem, então uma bronca de categoria indesejada nunca
// chega ao avaliador. O que sobrou aqui é a regra que não é de categoria, e sim
// de física.

test('iluminação continua muda de dia, venha de onde vier', () => {
  // Escuridão é física: nenhuma escolha de tela faz o poste ficar visível ao
  // meio-dia.
  const r = avaliarAlerta(
    posicao(),
    bronca(0, DENTRO, { category: 'iluminacao' }),
    { agora: new Date('2026-08-20T15:00:00Z').getTime() }
  );
  assert.equal(r.motivo, 'so-a-noite');
});

test('categoria sem regra especial alerta normalmente', () => {
  const r = avaliarAlerta(posicao(), bronca(0, DENTRO, { category: 'buracos' }));
  assert.equal(r.alerta, true);
});

test('bronca sem categoria não é silenciada por engano', () => {
  assert.equal(avaliarAlerta(posicao(), bronca(0, DENTRO)).alerta, true);
});

// ── Iluminação só à noite ─────────────────────────────────────────────────────

// Floresta/PE em 20/ago/2026. O pôr do sol local é ~17h31 (UTC-3).
const MEIO_DIA = new Date('2026-08-20T15:00:00Z').getTime();
const NOITE = new Date('2026-08-20T22:00:00Z').getTime();

test('poste apagado não alerta de dia', () => {
  // De dia ninguém consegue confirmar nem desmentir um poste apagado — o
  // alerta pediria um julgamento impossível.
  const r = avaliarAlerta(
    posicao(),
    bronca(0, DENTRO, { category: 'iluminacao' }),
    { agora: MEIO_DIA }
  );
  assert.equal(r.alerta, false);
  assert.equal(r.motivo, 'so-a-noite');
});

test('poste apagado alerta à noite', () => {
  const r = avaliarAlerta(
    posicao(),
    bronca(0, DENTRO, { category: 'iluminacao' }),
    { agora: NOITE }
  );
  assert.equal(r.alerta, true);
});

test('a regra da noite não afeta as outras categorias', () => {
  const r = avaliarAlerta(
    posicao(),
    bronca(0, DENTRO, { category: 'buracos' }),
    { agora: MEIO_DIA }
  );
  assert.equal(r.alerta, true);
});

// ── Seleção ───────────────────────────────────────────────────────────────────

test('selecionarAlertas devolve a mais próxima primeiro', () => {
  const longe = { ...bronca(0, DENTRO), id: 'longe' };
  const perto = { ...bronca(0, PERTINHO), id: 'perto' };
  const atras = { ...bronca(180, PERTINHO), id: 'atras' };
  const r = selecionarAlertas(posicao(), [longe, perto, atras], new Set());
  assert.deepEqual(r.map((x) => x.bronca.id), ['perto', 'longe']);
});

test('selecionarAlertas aceita lista vazia ou nula', () => {
  assert.deepEqual(selecionarAlertas(posicao(), null, new Set()), []);
});

// ── Rumo e velocidade por trajeto ─────────────────────────────────────────────
//
// Estes testes existem porque a primeira versão dependia de `coords.speed` para
// decidir se havia movimento. Num teste a pé o rumo congelou: caminhada fica
// abaixo do limite de 1,5 m/s, então o rumo nunca era recalculado e voltar pela
// mesma rua aparecia como marcha à ré.

/**
 * Gera amostras percorrendo `rumo` a `velocidade` m/s, uma por segundo.
 * `t` em milissegundos, como o Date.now() que o hook grava.
 */
const trajeto = (rumoGraus, velocidadeMs, segundos, inicio = BASE, t0 = 0) => {
  const amostras = [];
  for (let s = 0; s <= segundos; s += 1) {
    amostras.push({ ...mover(inicio, rumoGraus, velocidadeMs * s), t: t0 + s * 1000 });
  }
  return amostras;
};

test('detecta rumo em velocidade de caminhada (o caso que falhou no aparelho)', () => {
  // 1,2 m/s = ~4,3 km/h. A versão antiga tratava isso como "parado".
  const r = estimarMovimento(trajeto(0, 1.2, 6));
  assert.ok(Number.isFinite(r.rumo), 'deveria produzir um rumo caminhando');
  assert.ok(Math.abs(r.rumo - 0) < 5, `rumo ${r.rumo} deveria ser ~0`);
  assert.ok(Math.abs(r.velocidade - 1.2) < 0.2);
});

test('inverter o sentido inverte o rumo — sem "dar ré"', () => {
  // Vai para o norte, depois volta para o sul pela mesma rua. A referência
  // precisa acompanhar: presa na origem, o rumo de volta apontaria para frente.
  const ida = trajeto(0, 1.2, 10);
  const fim = ida[ida.length - 1];
  const volta = trajeto(180, 1.2, 10, fim, fim.t);

  const rIda = estimarMovimento(ida);
  const rVolta = estimarMovimento(volta);

  assert.ok(Math.abs(rIda.rumo - 0) < 5, `ida ${rIda.rumo}`);
  assert.ok(Math.abs(rVolta.rumo - 180) < 5, `volta ${rVolta.rumo}`);
  assert.ok(angleDiff(rIda.rumo, rVolta.rumo) > 170, 'os rumos devem ser opostos');
});

test('a janela descarta amostras velhas — o rumo segue o trecho recente', () => {
  // Trajeto longo para o norte e depois curva para o leste. Com janela curta,
  // só a curva conta; sem janela, a média puxaria para o nordeste.
  const norte = trajeto(0, 2, 30);
  const fim = norte[norte.length - 1];
  const leste = trajeto(90, 2, 6, fim, fim.t);

  const r = estimarMovimento([...norte, ...leste]);
  assert.ok(Math.abs(r.rumo - 90) < 20, `rumo ${r.rumo} deveria seguir a curva para leste`);
});

test('passo lento ainda produz rumo, estendendo a janela', () => {
  // 0,8 m/s: em 6 s são 4,8 m, abaixo do piso de ruído. Em 12 s são ~10 m.
  // Sem a janela estendida, quem anda devagar seria tratado como parado.
  const r = estimarMovimento(trajeto(270, 0.8, 12));
  assert.ok(Number.isFinite(r.rumo), 'deveria produzir rumo em passo lento');
  assert.ok(Math.abs(r.rumo - 270) < 5, `rumo ${r.rumo}`);
});

test('estender a janela não inventa rumo para quem está parado', () => {
  // 20 s parado com tremor: nem a janela longa acumula deslocamento real.
  const amostras = Array.from({ length: 21 }, (_, i) => ({
    ...mover(BASE, (i % 2) * 180, 3),
    t: i * 1000,
  }));
  assert.equal(estimarMovimento(amostras).rumo, null);
});

test('tremor do GPS parado não gera rumo', () => {
  // Cinco leituras oscilando ±3 m em direções opostas: deslocamento líquido
  // abaixo do piso, então não há rumo — a seta congela em vez de rodopiar.
  const amostras = [0, 180, 0, 180, 0].map((g, i) => ({
    ...mover(BASE, g, 3),
    t: i * 1000,
  }));
  const r = estimarMovimento(amostras);
  assert.equal(r.rumo, null);
});

test('menos de duas amostras não produz rumo nem velocidade', () => {
  assert.deepEqual(estimarMovimento([{ ...BASE, t: 0 }]), {
    rumo: null, velocidade: 0, deslocamento: 0,
  });
  assert.equal(estimarMovimento([]).rumo, null);
  assert.equal(estimarMovimento(null).rumo, null);
});

test('velocidade sai do deslocamento, sem depender de coords.speed', () => {
  // O aparelho do teste não informava velocidade confiável; a estimativa não
  // recebe esse campo em momento algum.
  const r = estimarMovimento(trajeto(45, 8, 5));
  assert.ok(Math.abs(r.velocidade - 8) < 0.5, `velocidade ${r.velocidade}`);
});

test('limite de movimento cobre a caminhada', () => {
  // 1,2 m/s precisa contar como movimento, senão os alertas também não
  // disparariam para quem anda a pé.
  assert.ok(NAV_ALERTA.velocidadeMinimaMs < 1.2);
});

// ── Velocidade dentro de casa ────────────────────────────────────────────────
//
// O sintoma relatado: aparelho parado sobre a mesa, velocímetro marcando
// 32 km/h. Em ambiente fechado o GPS erra dezenas de metros, e a deriva entre
// duas leituras passava do piso fixo de 6 m como se fosse deslocamento.

/** Série de quem está parado com sinal ruim de ambiente fechado. */
const paradoEmCasa = ({ segundos = 30, accuracy = 45, semente = 3 } = {}) => {
  const rand = aleatorio(semente);
  return Array.from({ length: segundos }, (_, i) => ({
    // Deriva compatível com a precisão informada: é assim que o GPS erra.
    ...mover(BASE, rand() * 360, rand() * accuracy),
    accuracy,
    t: i * 1000,
  }));
};

test('parado em casa, a velocidade é zero', () => {
  const amostras = paradoEmCasa();
  const m = estimarMovimento(amostras);
  assert.equal(m.velocidade, 0, `marcou ${(m.velocidade * 3.6).toFixed(0)} km/h parado`);
  assert.equal(m.rumo, null);
});

test('sem o piso por precisão, a mesma série vira dezenas de km/h', () => {
  // Documenta o comportamento antigo: piso fixo de 6 m, e a deriva de 45 m o
  // atravessa sem esforço. É o número que aparecia na tela.
  const amostras = paradoEmCasa();
  const semPiso = estimarMovimento(amostras, { fatorPrecisao: 0 });
  assert.ok(
    semPiso.velocidade * 3.6 > 20,
    `esperava ruído alto, veio ${(semPiso.velocidade * 3.6).toFixed(0)} km/h`
  );
});

test('o piso acompanha a precisão da leitura', () => {
  // 20 m de deslocamento em 6 s: movimento real na rua (12 km/h), ruído puro
  // com 45 m de erro.
  const comPrecisao = (accuracy) => [
    { ...BASE, accuracy, t: 0 },
    { ...mover(BASE, 0, 20), accuracy, t: 6000 },
  ];
  assert.ok(estimarMovimento(comPrecisao(6)).rumo !== null, 'GPS bom deveria confirmar');
  assert.equal(estimarMovimento(comPrecisao(45)).rumo, null, 'GPS ruim não pode confirmar');
});

test('caminhada lenta na rua continua sendo detectada', () => {
  // O risco da correção: apertar tanto que quem anda devagar com sinal comum
  // deixe de contar. 0,8 m/s por 12 s com 6 m de precisão precisa passar.
  const amostras = Array.from({ length: 13 }, (_, i) => ({
    ...mover(BASE, 0, i * 0.8),
    accuracy: 6,
    t: i * 1000,
  }));
  const m = estimarMovimento(amostras);
  assert.ok(m.rumo !== null, 'caminhada lenta parou de ser detectada');
  assert.ok(m.velocidade > 0.5, `velocidade ${m.velocidade}`);
});

test('sem precisão informada, vale o piso fixo de sempre', () => {
  // Alguns navegadores não informam accuracy; recusar tudo deixaria a seta
  // congelada nesses aparelhos.
  const amostras = [
    { ...BASE, t: 0 },
    { ...mover(BASE, 0, 8), t: 6000 },
  ];
  assert.ok(estimarMovimento(amostras).rumo !== null);
});

// ── Agrupamento ───────────────────────────────────────────────────────────────
//
// Três buracos no mesmo quarteirão são três perguntas idênticas em sequência, e
// a terceira ninguém responde.

const candidato = (rumo, metros, extra = {}) => {
  const b = bronca(rumo, metros, extra);
  return { bronca: b, distancia: metros };
};

test('broncas no mesmo ponto viram um grupo', () => {
  const grupo = agruparAlertas([
    candidato(0, 6, { id: 'a' }),
    candidato(0, 9, { id: 'b' }),
    candidato(10, 8, { id: 'c' }),
  ]);
  assert.equal(grupo.length, 3);
  assert.equal(grupo[0].id, 'a', 'o mais próximo lidera');
});

test('bronca distante do líder fica de fora', () => {
  const grupo = agruparAlertas([
    candidato(0, 5, { id: 'perto' }),
    candidato(180, 8, { id: 'longe' }),   // 13 m do líder
  ], 10);
  assert.deepEqual(grupo.map((b) => b.id), ['perto']);
});

test('o grupo nunca vira uma corrente', () => {
  // Proximidade mútua encadearia: A perto de B, B perto de C, e C entraria no
  // grupo mesmo longe de A. Numa rua esburacada isso juntaria o quarteirão
  // inteiro, e a pessoa confirmaria buracos que não viu.
  const a = { bronca: { ...bronca(0, 0), id: 'a' }, distancia: 0 };
  const b = { bronca: { ...bronca(0, 25), id: 'b' }, distancia: 25 };
  const c = { bronca: { ...bronca(0, 50), id: 'c' }, distancia: 50 };

  const grupo = agruparAlertas([a, b, c], 30);
  assert.deepEqual(grupo.map((x) => x.id), ['a', 'b'], 'c está a 50 m do líder');
});

test('um candidato só devolve um grupo de um', () => {
  const grupo = agruparAlertas([candidato(0, 5, { id: 'unico' })]);
  assert.deepEqual(grupo.map((b) => b.id), ['unico']);
});

test('sem candidatos, grupo vazio', () => {
  assert.deepEqual(agruparAlertas([]), []);
  assert.deepEqual(agruparAlertas(null), []);
});

test('o raio de abandono é maior que o de alerta', () => {
  // Se fosse igual ou menor, o card sumiria no instante seguinte ao de
  // aparecer: basta um passo à frente para a distância crescer.
  assert.ok(NAV_ALERTA.raioAbandonoM > NAV_ALERTA.distanciaAlertaM);
});

// ── Caixa do corredor ─────────────────────────────────────────────────────────

test('caixaDeRaio cobre o raio pedido nas quatro direções', () => {
  const raio = 2000;
  const c = caixaDeRaio(BASE, raio);
  assert.ok(haversine(BASE, { lat: c.maxLat, lng: BASE.lng }) >= raio - 1);
  assert.ok(haversine(BASE, { lat: BASE.lat, lng: c.maxLng }) >= raio - 1);
  assert.ok(c.minLat < BASE.lat && c.minLng < BASE.lng);
});

// ── Deslocamento da seta na tela ──────────────────────────────────────────────
//
// A seta some na lateral quando o deslocamento é aplicado no espaço do mapa em
// vez do da tela: o container está girado, então "para baixo" no mapa aponta
// para outro canto da tela conforme o rumo.

/**
 * Reproduz o que o navegador faz: o container tem `transform: rotate(-rumo)`,
 * então um ponto no espaço do mapa aparece na tela girado por -rumo.
 * Eixos de tela: +x direita, +y baixo. CSS rotate() é horário.
 */
const paraTela = ({ x, y }, rumo) => {
  const t = (-rumo * Math.PI) / 180;
  return {
    x: x * Math.cos(t) - y * Math.sin(t),
    y: x * Math.sin(t) + y * Math.cos(t),
  };
};

for (const rumo of [0, 45, 90, 137, 180, 270, 359]) {
  test(`a seta fica abaixo do centro da tela com rumo ${rumo}°`, () => {
    const d = 100;
    const pan = panParaOffsetDeTela(d, rumo);

    // panBy([x, y]) coloca o ponto central em (-x, -y) no espaço do mapa.
    const noMapa = { x: -pan.x, y: -pan.y };
    const naTela = paraTela(noMapa, rumo);

    assert.ok(Math.abs(naTela.x) < 0.001, `desviou ${naTela.x}px para a lateral`);
    assert.ok(Math.abs(naTela.y - d) < 0.001, `ficou em ${naTela.y}px, esperado ${d}`);
  });
}

test('sem rumo conhecido, o deslocamento é puramente vertical', () => {
  assert.deepEqual(panParaOffsetDeTela(100, null), { x: 0, y: -100 });
});

// ── Rastro da inspeção ────────────────────────────────────────────────────────

test('distanciaTotal soma os segmentos do rastro', () => {
  // Três trechos de 100 m formando um L: 200 m no total.
  const a = BASE;
  const b = mover(a, 0, 100);
  const c = mover(b, 90, 100);
  assert.ok(Math.abs(distanciaTotal([a, b, c]) - 200) < 1);
});

test('distanciaTotal é zero sem trajeto', () => {
  assert.equal(distanciaTotal([BASE]), 0);
  assert.equal(distanciaTotal([]), 0);
  assert.equal(distanciaTotal(null), 0);
});

test('o rastro descarta o tremor do GPS parado', () => {
  // Meia hora parado geraria 1.800 leituras a poucos metros uma da outra.
  // Nenhuma pode entrar, senão o traço vira um borrão sobre o ponto de parada.
  assert.equal(deveRegistrarPonto(BASE, mover(BASE, 37, 2)), false);
  assert.equal(deveRegistrarPonto(BASE, mover(BASE, 37, 4.9)), false);
});

test('o rastro aceita o ponto que andou o suficiente', () => {
  // A régua subiu de 5 m para 10 m. Com 5 m ela ficava DENTRO do ruído que
  // deveria filtrar: o GPS parado entrega saltos de 5 a 15 m o tempo todo, e
  // era assim que a patrulha somava quilômetros com o usuário sentado.
  assert.equal(deveRegistrarPonto(BASE, mover(BASE, 37, 5.1)), false);
  assert.equal(deveRegistrarPonto(BASE, mover(BASE, 37, 10.5)), true);
  assert.equal(deveRegistrarPonto(BASE, mover(BASE, 180, 40)), true);
});

test('parado não estende o rastro, por mais que o GPS pule', () => {
  // O freio decisivo: sem movimento confirmado, distância nenhuma vale.
  const longe = mover(BASE, 90, 60);
  assert.equal(deveRegistrarPonto(BASE, longe, { emMovimento: true }), true);
  assert.equal(deveRegistrarPonto(BASE, longe, { emMovimento: false }), false);
});

test('leitura imprecisa fica de fora, mesmo em movimento', () => {
  // Cada leitura ruim injeta o próprio erro na distância total — e o total é
  // o número que a patrulha guarda para sempre.
  const ruim = { ...mover(BASE, 0, 40), accuracy: NAV_RASTRO.precisaoMaximaM + 1 };
  const boa = { ...mover(BASE, 0, 40), accuracy: 10 };
  assert.equal(deveRegistrarPonto(BASE, ruim, { emMovimento: true }), false);
  assert.equal(deveRegistrarPonto(BASE, boa, { emMovimento: true }), true);
});

test('a régua acompanha a precisão da leitura', () => {
  // Duas leituras do MESMO ponto parado podem diferir por até 2 × accuracy sem
  // que ninguém tenha se mexido. Exigir mais que isso é exigir deslocamento
  // que o ruído não explica.
  const comPrecisao = (metros, accuracy) => ({ ...mover(BASE, 0, metros), accuracy });
  assert.equal(deveRegistrarPonto(BASE, comPrecisao(18, 12), { emMovimento: true }), false);
  assert.equal(deveRegistrarPonto(BASE, comPrecisao(26, 12), { emMovimento: true }), true);
  // Com GPS bom a régua volta ao piso fixo de 10 m.
  assert.equal(deveRegistrarPonto(BASE, comPrecisao(12, 4), { emMovimento: true }), true);
});

test('salto impossível é reposicionamento do aparelho, não trajeto', () => {
  // 200 m entre duas leituras a 1 Hz seriam 720 km/h. Acontece quando o
  // aparelho troca de fonte de posição e se recoloca de uma vez.
  const teleporte = { ...mover(BASE, 0, NAV_RASTRO.saltoMaximoM + 100), accuracy: 10 };
  assert.equal(deveRegistrarPonto(BASE, teleporte, { emMovimento: true }), false);
});

test('o primeiro ponto do rastro entra se há movimento', () => {
  assert.equal(deveRegistrarPonto(null, BASE), true);
  assert.equal(deveRegistrarPonto(null, BASE, { emMovimento: false }), false);
});

test('coordenada inválida não entra no rastro', () => {
  assert.equal(deveRegistrarPonto(BASE, { lat: NaN, lng: 0 }), false);
  assert.equal(deveRegistrarPonto(BASE, null), false);
});

// ── O bug do rastro que andava sozinho ───────────────────────────────────────
//
// Reproduz a sessão inteira, não uma chamada: é o acúmulo ao longo de 1.800
// leituras que produzia o sintoma, e nenhuma leitura isolada o revela.

/**
 * Gerador pseudoaleatório com semente.
 *
 * Deriva de GPS é ruído, e ruído com Math.random daria um teste que passa numa
 * execução e falha na seguinte.
 */
const aleatorio = (semente) => {
  let s = semente >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
};

/**
 * Reproduz o caminho de uma leitura no modo patrulha: useNavigationGps calcula
 * `emMovimento` da janela recente, e usePatrolRecorder decide com ele.
 *
 * As duas decisões são das funções puras — os hooks só as encadeiam. Testar o
 * encadeamento exigiria React, DOM e GPS falso para verificar esta mesma
 * aritmética.
 */
const simularRastro = (leituras) => {
  const BUFFER_MS = NAV_TRAJETO.janelaMaxMs + 4000;
  let janela = [];
  const rastro = [];

  for (const leitura of leituras) {
    janela = [...janela, { lat: leitura.lat, lng: leitura.lng, t: leitura.t }]
      .filter((a) => leitura.t - a.t <= BUFFER_MS);

    const emMovimento = Number.isFinite(estimarMovimento(janela).rumo);
    const ultimo = rastro[rastro.length - 1];

    if (deveRegistrarPonto(ultimo, leitura, { emMovimento })) {
      rastro.push({ lat: leitura.lat, lng: leitura.lng });
    }
  }
  return rastro;
};

/** Meia hora parado, com o GPS derivando num raio de 8 m. */
const paradoDerivando = ({ minutos = 30, raioM = 8, accuracy = 12, semente = 7 } = {}) => {
  const rand = aleatorio(semente);
  const leituras = [];
  for (let i = 0; i < minutos * 60; i += 1) {
    leituras.push({
      ...mover(BASE, rand() * 360, rand() * raioM),
      accuracy,
      t: i * 1000,
    });
  }
  return leituras;
};

/** Caminhada em linha reta a `velocidade` m/s. */
const caminhando = ({ segundos = 300, velocidade = 1.4, accuracy = 10 } = {}) =>
  Array.from({ length: segundos }, (_, i) => ({
    ...mover(BASE, 0, i * velocidade),
    accuracy,
    t: i * 1000,
  }));

test('meia hora parado não acumula distância', () => {
  assert.ok(distanciaTotal(simularRastro(paradoDerivando())) < 50);
});

test('com a regra antiga, a mesma série virava quilômetros', () => {
  // Documenta o que o usuário via crescer sentado: espaçamento de 5 m era o
  // único freio, e a deriva passa por ele o tempo todo.
  const antigo = [];
  for (const leitura of paradoDerivando()) {
    const ultimo = antigo[antigo.length - 1];
    if (!ultimo || haversine(ultimo, leitura) >= 5) {
      antigo.push({ lat: leitura.lat, lng: leitura.lng });
    }
  }
  assert.ok(distanciaTotal(antigo) > 1000);
});

test('quem anda de verdade tem a distância medida', () => {
  const rastro = simularRastro(caminhando({ segundos: 300, velocidade: 1.4 }));
  const esperado = 299 * 1.4;
  const medido = distanciaTotal(rastro);
  assert.ok(medido > esperado * 0.9, `mediu ${medido}, esperava perto de ${esperado}`);
  assert.ok(medido < esperado * 1.05, `mediu ${medido}, esperava perto de ${esperado}`);
});

test('o rastro guarda um ponto por régua, não um por segundo', () => {
  // Com accuracy de 10 m a régua é 20 m: 418 m dão ~21 pontos de 300 leituras.
  const rastro = simularRastro(caminhando({ segundos: 300, velocidade: 1.4 }));
  assert.ok(rastro.length > 15 && rastro.length < 40, `guardou ${rastro.length}`);
});

// ── Sol ───────────────────────────────────────────────────────────────────────
//
// Decide se um poste apagado pode ser julgado. Errar aqui é alertar sobre
// iluminação com o sol a pino, ou calar já no escuro.

const FLORESTA = { lat: -8.6021, lng: -37.9855 };   // PE, ~UTC-3
const PORTO_ALEGRE = { lat: -30.0346, lng: -51.2177 };

/** Instante UTC a partir de uma hora local de Brasília (UTC-3). */
const horaDeBrasilia = (iso) => new Date(`${iso}-03:00`).getTime();

test('ao meio-dia o sol está alto', () => {
  const alt = alturaDoSol(horaDeBrasilia('2026-08-20T12:00:00'), FLORESTA.lat, FLORESTA.lng);
  // Latitude -8,6 em agosto: o sol passa perto do zênite.
  assert.ok(alt > 60 && alt < 75, `altura ${alt}`);
});

test('à meia-noite o sol está do outro lado do planeta', () => {
  const alt = alturaDoSol(horaDeBrasilia('2026-08-21T00:00:00'), FLORESTA.lat, FLORESTA.lng);
  assert.ok(alt < -60, `altura ${alt}`);
});

test('meio-dia não é noite, meia-noite é', () => {
  assert.equal(ehNoite(horaDeBrasilia('2026-08-20T12:00:00'), FLORESTA.lat, FLORESTA.lng), false);
  assert.equal(ehNoite(horaDeBrasilia('2026-08-21T00:00:00'), FLORESTA.lat, FLORESTA.lng), true);
});

test('o crepúsculo ainda não é noite', () => {
  // Em Floresta, 20/ago, o sol se põe ~17h31. Às 17h30 ainda se enxerga, e a
  // iluminação pública ainda não é o que decide se a rua está clara.
  assert.equal(ehNoite(horaDeBrasilia('2026-08-20T17:30:00'), FLORESTA.lat, FLORESTA.lng), false);
  // Meia hora depois, sim.
  assert.equal(ehNoite(horaDeBrasilia('2026-08-20T18:00:00'), FLORESTA.lat, FLORESTA.lng), true);
});

test('anoitece em horas diferentes em lugares diferentes', () => {
  // É por isto que a regra não é "depois das 18h".
  //
  // Mesmo relógio (17h50 de Brasília, junho), duas respostas: em Floresta já é
  // noite, em Porto Alegre ainda não. E não é a latitude que manda — é a
  // LONGITUDE. Floresta fica 13° a leste de Porto Alegre, quase 53 minutos de
  // sol adiantado, e no mesmo fuso de relógio. Um corte por horário fixo
  // erraria dos dois lados do país, em direções opostas.
  const t = horaDeBrasilia('2026-06-20T17:50:00');
  assert.equal(ehNoite(t, FLORESTA.lat, FLORESTA.lng), true);
  assert.equal(ehNoite(t, PORTO_ALEGRE.lat, PORTO_ALEGRE.lng), false);
});

test('o mesmo instante dá a mesma resposta, venha como Date ou número', () => {
  const t = horaDeBrasilia('2026-08-20T21:00:00');
  assert.equal(
    alturaDoSol(t, FLORESTA.lat, FLORESTA.lng),
    alturaDoSol(new Date(t), FLORESTA.lat, FLORESTA.lng)
  );
});

test('sem coordenada válida, não se afirma que é noite', () => {
  // No escuro da dúvida é melhor não alertar que acordar alguém às duas da
  // tarde.
  assert.ok(Number.isNaN(alturaDoSol(Date.now(), NaN, 0)));
  assert.equal(ehNoite(Date.now(), NaN, 0), false);
  assert.equal(ehNoite(NaN, FLORESTA.lat, FLORESTA.lng), false);
});

// ── Frase falada ──────────────────────────────────────────────────────────────

test('frasear arredonda a distância', () => {
  assert.equal(frasear('Buraco', 97), 'Buraco a 100 metros');
  assert.equal(frasear('Buraco', 42), 'Buraco a 40 metros');
  assert.equal(frasear('Buraco', 4), 'Buraco a 10 metros');
});

test('parâmetros do alerta são os do design', () => {
  // 30 m: 10 foi testado em campo e ficou pouco — menor que o erro do GPS
  // urbano, o alerta não chegava a aparecer.
  assert.equal(NAV_ALERTA.distanciaAlertaM, 30);
  assert.equal(NAV_ALERTA.coneGraus, 45);
  // O teto de precisão nunca pode ser maior que a régua que ele mede.
  assert.ok(NAV_ALERTA.precisaoMaximaM <= NAV_ALERTA.distanciaAlertaM);
});

// ── Guardar o percurso ──────────────────────────────────────────────────────
//
// A simplificação é a única coisa entre o rastro que o GPS produziu e o traço
// que a pessoa vai ver meses depois. Se ela cortar demais, o percurso passa a
// mentir — corta esquinas que existiram e desenha ruas por onde ninguém andou.

/** Rastro reto, com o espaçamento real do NAV_RASTRO. */
const linhaReta = (n, passoM = 10) =>
  Array.from({ length: n }, (_, i) => ({
    lat: BASE.lat,
    lng: BASE.lng + (i * passoM) / (111320 * Math.cos((BASE.lat * Math.PI) / 180)),
  }));

test('reta longa vira só as duas pontas', () => {
  const reta = linhaReta(120);
  const s = simplificarRastro(reta);

  assert.equal(s.length, 2);
  assert.deepEqual(s[0], { lat: reta[0].lat, lng: reta[0].lng });
  assert.deepEqual(s[1], { lat: reta[119].lat, lng: reta[119].lng });
});

test('a esquina sobrevive — é ela que faz o percurso ser aquele', () => {
  // Leste por 500 m, depois norte por 500 m.
  const metroLng = 111320 * Math.cos((BASE.lat * Math.PI) / 180);
  const leste = linhaReta(50);
  const canto = leste[leste.length - 1];
  const norte = Array.from({ length: 50 }, (_, i) => ({
    lat: canto.lat + ((i + 1) * 10) / 111320,
    lng: canto.lng,
  }));

  const s = simplificarRastro([...leste, ...norte]);

  assert.equal(s.length, 3, 'ponta, esquina, ponta');
  assert.ok(Math.abs(s[1].lat - canto.lat) < 1e-9);
  assert.ok(Math.abs(s[1].lng - canto.lng) < 1e-9);
  assert.ok(metroLng > 0);
});

test('nenhum ponto guardado se afasta mais que a tolerância do traço original', () => {
  // Curva suave de 90°, raio ~300 m: o caso em que RDP mais tende a exagerar.
  const curva = Array.from({ length: 200 }, (_, i) => {
    const t = (i / 199) * (Math.PI / 2);
    return {
      lat: BASE.lat + (300 * Math.sin(t)) / 111320,
      lng: BASE.lng + (300 * (1 - Math.cos(t))) / (111320 * Math.cos((BASE.lat * Math.PI) / 180)),
    };
  });

  const s = simplificarRastro(curva, TOLERANCIA_SIMPLIFICACAO_M);

  assert.ok(s.length < curva.length, 'cortou alguma coisa');
  assert.ok(s.length >= 2);

  // Todo ponto original continua perto de algum ponto guardado. Não é a
  // garantia formal do RDP, mas é a que a tela precisa: nada some do traço.
  for (const p of curva) {
    const maisPerto = Math.min(...s.map((q) => haversine(p, q)));
    assert.ok(
      maisPerto <= 60,
      `ponto ficou a ${maisPerto.toFixed(0)} m do traço simplificado`
    );
  }
});

test('o teto é respeitado mesmo quando a tolerância não corta nada', () => {
  // Zigue-zague de 3 km: cada ponto é uma quina, e nenhuma quina cabe dentro
  // da tolerância. Sem o teto, isto passaria inteiro para o banco.
  const zigue = Array.from({ length: 3000 }, (_, i) => ({
    lat: BASE.lat + (i % 2 === 0 ? 0 : 30) / 111320,
    lng: BASE.lng + (i * 10) / (111320 * Math.cos((BASE.lat * Math.PI) / 180)),
  }));

  const s = simplificarRastro(zigue);

  assert.ok(s.length <= MAX_PONTOS_GRAVADOS, `sobraram ${s.length}`);
  // As pontas continuam sendo as pontas.
  assert.ok(Math.abs(s[0].lng - zigue[0].lng) < 1e-9);
  assert.ok(Math.abs(s[s.length - 1].lng - zigue[zigue.length - 1].lng) < 1e-9);
});

test('rastro curto demais para simplificar passa inteiro', () => {
  assert.deepEqual(simplificarRastro([]), []);
  assert.equal(simplificarRastro([BASE]).length, 1);
  assert.equal(simplificarRastro([BASE, { lat: BASE.lat + 0.01, lng: BASE.lng }]).length, 2);
});

test('lixo no rastro não vira ponto no mapa', () => {
  const sujo = [
    BASE,
    null,
    { lat: NaN, lng: BASE.lng },
    { lat: BASE.lat + 0.01, lng: undefined },
    { lat: BASE.lat + 0.02, lng: BASE.lng },
  ];
  const s = simplificarRastro(sujo);
  assert.equal(s.length, 2);
  assert.ok(s.every((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)));
});

test('ida e volta ao banco preserva o traço', () => {
  const reta = linhaReta(40);
  const gravado = rastroParaBanco(reta);

  // Ordem GeoJSON: [lng, lat]. Trocar isso põe o percurso no oceano.
  assert.ok(Array.isArray(gravado[0]));
  assert.equal(gravado[0].length, 2);
  assert.ok(Math.abs(gravado[0][0] - reta[0].lng) < 1e-4, 'primeiro valor é lng');
  assert.ok(Math.abs(gravado[0][1] - reta[0].lat) < 1e-4, 'segundo valor é lat');

  const devolta = rastroDoBanco(gravado);
  assert.equal(devolta.length, gravado.length);
  assert.ok(haversine(devolta[0], reta[0]) < 2, 'menos de 2 m de perda no arredondamento');
});

test('coluna nula ou corrompida devolve rastro vazio, não quebra a tela', () => {
  assert.deepEqual(rastroDoBanco(null), []);
  assert.deepEqual(rastroDoBanco(undefined), []);
  assert.deepEqual(rastroDoBanco('nada disso'), []);
  assert.deepEqual(rastroDoBanco([[1], 'x', null, [NaN, 2]]), []);
});

// ── Miniatura do traçado ────────────────────────────────────────────────────

test('a miniatura cabe na caixa, com a margem respeitada', () => {
  const curva = Array.from({ length: 60 }, (_, i) => ({
    lat: BASE.lat + Math.sin(i / 8) * 0.004,
    lng: BASE.lng + i * 0.0004,
  }));

  const { pontos } = enquadrarRastro(curva, 120, 64, 4);

  assert.equal(pontos.length, 60);
  for (const p of pontos) {
    assert.ok(p.x >= -0.001 && p.x <= 120.001, `x fora da caixa: ${p.x}`);
    assert.ok(p.y >= -0.001 && p.y <= 64.001, `y fora da caixa: ${p.y}`);
  }
});

test('o norte fica em cima — Y do SVG cresce ao contrário da latitude', () => {
  const sul = { lat: BASE.lat, lng: BASE.lng };
  const norte = { lat: BASE.lat + 0.01, lng: BASE.lng };

  const { pontos } = enquadrarRastro([sul, norte], 100, 100);

  assert.ok(pontos[1].y < pontos[0].y, 'o ponto ao norte precisa ter Y menor');
});

test('a escala é a mesma nos dois eixos — reta não vira quadrado', () => {
  // 10x mais longo em longitude que em latitude.
  const reta = [
    { lat: BASE.lat, lng: BASE.lng },
    { lat: BASE.lat + 0.001, lng: BASE.lng + 0.01 },
  ];

  const { pontos } = enquadrarRastro(reta, 100, 100, 0);

  const dx = Math.abs(pontos[1].x - pontos[0].x);
  const dy = Math.abs(pontos[1].y - pontos[0].y);
  // Esticando cada eixo, dx e dy seriam iguais (100 e 100). Com escala única,
  // dy tem que ser cerca de um décimo de dx.
  assert.ok(dx > 90, `dx=${dx} deveria preencher a caixa`);
  assert.ok(dy < dx / 5, `dy=${dy} deveria ser muito menor que dx=${dx}`);
});

test('percurso de um ponto só fica no centro, sem dividir por zero', () => {
  const { pontos } = enquadrarRastro([BASE], 100, 60);
  assert.equal(pontos.length, 1);
  assert.ok(Number.isFinite(pontos[0].x) && Number.isFinite(pontos[0].y));
  assert.ok(Math.abs(pontos[0].x - 50) < 0.001);
  assert.ok(Math.abs(pontos[0].y - 30) < 0.001);
});

test('as ações usam o mesmo enquadramento do traço', () => {
  const trajeto = [
    { lat: BASE.lat, lng: BASE.lng },
    { lat: BASE.lat + 0.01, lng: BASE.lng + 0.01 },
  ];
  const { pontos, projetar } = enquadrarRastro(trajeto, 100, 100);

  // Uma ação exatamente na ponta do trajeto tem que cair sobre o ponto dela —
  // senão os pontinhos flutuam ao lado da linha.
  const naPonta = projetar({ lat: BASE.lat + 0.01, lng: BASE.lng + 0.01 });
  assert.ok(Math.abs(naPonta.x - pontos[1].x) < 0.001);
  assert.ok(Math.abs(naPonta.y - pontos[1].y) < 0.001);

  assert.equal(projetar(null), null);
  assert.equal(projetar({ lat: NaN, lng: 1 }), null);
});

test('rastro vazio devolve nada em vez de quebrar', () => {
  assert.deepEqual(enquadrarRastro([], 100, 100).pontos, []);
  assert.deepEqual(enquadrarRastro(null, 100, 100).pontos, []);
  assert.equal(enquadrarRastro([], 100, 100).projetar(BASE), null);
});
