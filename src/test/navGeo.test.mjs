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
  estimarMovimento,
  panParaOffsetDeTela,
  deveRegistrarPonto,
  distanciaTotal,
  caixaDeRaio,
  frasear,
  NAV_ALERTA,
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

test('alerta dentro do limite de distância', () => {
  const r = avaliarAlerta(posicao(), bronca(0, 119));
  assert.equal(r.alerta, true);
});

test('não alerta além do limite de distância', () => {
  const r = avaliarAlerta(posicao(), bronca(0, 121));
  assert.equal(r.alerta, false);
  assert.equal(r.motivo, 'longe');
});

// ── Cone de direção ───────────────────────────────────────────────────────────

test('alerta o que está dentro do cone à frente', () => {
  const r = avaliarAlerta(posicao({ heading: 0 }), bronca(44, 100));
  assert.equal(r.alerta, true);
});

test('não alerta o que está fora do cone', () => {
  const r = avaliarAlerta(posicao({ heading: 0 }), bronca(46, 100));
  assert.equal(r.alerta, false);
  assert.equal(r.motivo, 'fora-do-cone');
});

test('não alerta o que ficou para trás', () => {
  const r = avaliarAlerta(posicao({ heading: 0 }), bronca(180, 60));
  assert.equal(r.alerta, false);
  assert.equal(r.motivo, 'fora-do-cone');
});

test('o cone acompanha o rumo na virada de 360°', () => {
  // Rumo 350°, bronca em 10°: 20° de desvio. Com subtração crua daria 340 e a
  // bronca à frente seria descartada.
  const r = avaliarAlerta(posicao({ heading: 350 }), bronca(10, 100));
  assert.equal(r.alerta, true);
});

// ── Guardas de estado ─────────────────────────────────────────────────────────

test('não alerta com o veículo parado', () => {
  const r = avaliarAlerta(posicao({ speed: 0.4 }), bronca(0, 80));
  assert.equal(r.motivo, 'parado');
});

test('não alerta com sinal impreciso', () => {
  const r = avaliarAlerta(posicao({ accuracy: 90 }), bronca(0, 80));
  assert.equal(r.motivo, 'sinal-fraco');
});

test('não alerta bronca já resolvida', () => {
  const r = avaliarAlerta(posicao(), bronca(0, 80, { status: 'resolved' }));
  assert.equal(r.motivo, 'status-nao-alertavel');
});

test('não repete alerta da mesma bronca', () => {
  const b = bronca(0, 80);
  const r = avaliarAlerta(posicao(), b, { jaAlertadas: new Set([b.id]) });
  assert.equal(r.motivo, 'ja-alertada');
});

test('não alerta sem rumo conhecido', () => {
  const r = avaliarAlerta(posicao({ heading: null }), bronca(0, 80));
  assert.equal(r.motivo, 'sem-rumo');
});

test('in-progress alerta igual a pending', () => {
  const r = avaliarAlerta(posicao(), bronca(0, 80, { status: 'in-progress' }));
  assert.equal(r.alerta, true);
});

// ── Seleção ───────────────────────────────────────────────────────────────────

test('selecionarAlertas devolve a mais próxima primeiro', () => {
  const longe = { ...bronca(0, 110), id: 'longe' };
  const perto = { ...bronca(0, 40), id: 'perto' };
  const atras = { ...bronca(180, 30), id: 'atras' };
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
  assert.equal(deveRegistrarPonto(BASE, mover(BASE, 37, 5.1)), true);
  assert.equal(deveRegistrarPonto(BASE, mover(BASE, 180, 40)), true);
});

test('o primeiro ponto do rastro sempre entra', () => {
  assert.equal(deveRegistrarPonto(null, BASE), true);
});

test('coordenada inválida não entra no rastro', () => {
  assert.equal(deveRegistrarPonto(BASE, { lat: NaN, lng: 0 }), false);
  assert.equal(deveRegistrarPonto(BASE, null), false);
});

// ── Frase falada ──────────────────────────────────────────────────────────────

test('frasear arredonda a distância', () => {
  assert.equal(frasear('Buraco', 97), 'Buraco a 100 metros');
  assert.equal(frasear('Buraco', 42), 'Buraco a 40 metros');
  assert.equal(frasear('Buraco', 4), 'Buraco a 10 metros');
});

test('parâmetros do alerta são os do design', () => {
  assert.equal(NAV_ALERTA.distanciaAlertaM, 120);
  assert.equal(NAV_ALERTA.coneGraus, 45);
});
