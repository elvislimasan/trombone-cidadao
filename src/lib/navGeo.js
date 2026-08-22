// Geometria do modo navegação. Funções puras, sem React e sem rede: a decisão
// de alertar depende só de números, então dá para testar todos os limites
// (cone, distância, wrap de 360°) sem GPS, sem banco e sem dirigir.

const R_TERRA_M = 6371000;
const rad = (g) => (g * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Distância em metros entre dois pontos {lat, lng}. */
export const haversine = (a, b) => {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRA_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

/** Rumo de `a` para `b`, em graus 0-360 (0 = norte, 90 = leste). */
export const bearing = (a, b) => {
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const dLng = rad(b.lng - a.lng);
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (deg(Math.atan2(y, x)) + 360) % 360;
};

/**
 * Menor ângulo entre dois rumos, em graus (0-180).
 *
 * O `%` sozinho não resolve: apontando para 350° com a bronca em 10°, a
 * diferença crua dá 340 e a bronca à frente seria descartada como "atrás".
 */
export const angleDiff = (a, b) =>
  Math.abs((((a - b) % 360) + 540) % 360 - 180);

// ── Sol ───────────────────────────────────────────────────────────────────────

/**
 * Altura do sol acima do horizonte, em graus. Negativo = abaixo.
 *
 * POR QUE NÃO UM HORÁRIO FIXO
 *
 * "Depois das 18h é noite" erra por mais de uma hora no Brasil. O pôr do sol vai
 * de ~17h no Sul em junho a ~19h15 no Centro-Oeste em dezembro, e num app que
 * quer ser nacional isso significa alertar sobre poste apagado com o sol ainda
 * alto num lugar, e deixar de alertar já escuro em outro.
 *
 * Todo o cálculo é em UTC, direto do timestamp. Nenhum fuso é consultado — e é
 * de propósito: o mesmo instante dá a mesma resposta em qualquer aparelho,
 * qualquer que seja o relógio dele. (A sequência de dias já custou um bug de
 * fuso neste projeto; aqui não há onde ele entrar.)
 *
 * Algoritmo de baixa precisão do Astronomical Almanac — erro abaixo de 0,01°,
 * ordem de grandeza irrelevante para decidir se anoiteceu.
 *
 * @param {number|Date} quando
 * @param {number} lat
 * @param {number} lng
 * @returns {number} graus
 */
export const alturaDoSol = (quando, lat, lng) => {
  const ms = quando instanceof Date ? quando.getTime() : Number(quando);
  if (!Number.isFinite(ms) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NaN;
  }

  // Dias desde J2000.0 (2000-01-01 12:00 UTC).
  const n = ms / 86400000 - 10957.5;

  const L = (280.46 + 0.9856474 * n) % 360;          // longitude média
  const g = rad((357.528 + 0.9856003 * n) % 360);    // anomalia média
  // Longitude eclíptica: a órbita não é circular, e estes dois termos são a
  // correção que separa o sol médio do sol real.
  const lambda = rad(L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g));
  const epsilon = rad(23.439 - 0.0000004 * n);       // obliquidade

  const declinacao = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const ascensaoReta = Math.atan2(
    Math.cos(epsilon) * Math.sin(lambda),
    Math.cos(lambda)
  );

  // Tempo sideral: quanto a Terra girou. É o que converte "onde o sol está no
  // céu" em "onde o sol está no céu VISTO DAQUI".
  const gmstHoras = (18.697374558 + 24.06570982441908 * n) % 24;
  const lmstGraus = (gmstHoras * 15 + lng + 360) % 360;
  const anguloHorario = rad(lmstGraus - deg(ascensaoReta));

  const phi = rad(lat);
  return deg(
    Math.asin(
      Math.sin(phi) * Math.sin(declinacao) +
      Math.cos(phi) * Math.cos(declinacao) * Math.cos(anguloHorario)
    )
  );
};

/**
 * Altura do sol a partir da qual a iluminação pública importa.
 *
 * Zero seria o instante do pôr do sol, quando ainda se enxerga bem. −6° é o
 * crepúsculo civil: o ponto em que a luz natural deixa de bastar e as luminárias
 * são o que decide se a rua está iluminada. É também mais ou menos quando os
 * relés fotoelétricos ligam — ou deveriam ligar, que é o que a bronca denuncia.
 */
export const ALTURA_DO_SOL_NOITE = -6;

/** Já está escuro o bastante para julgar um poste? */
export const ehNoite = (quando, lat, lng) => {
  const altura = alturaDoSol(quando, lat, lng);
  // Sem coordenada válida não dá para afirmar que é noite — e no escuro da
  // dúvida o melhor é não alertar, em vez de acordar alguém às duas da tarde.
  if (!Number.isFinite(altura)) return false;
  return altura <= ALTURA_DO_SOL_NOITE;
};

// ── Parâmetros do alerta ──────────────────────────────────────────────────────

export const NAV_ALERTA = {
  /**
   * Distância em que o alerta dispara.
   *
   * 30 m. Passou por 120 (quarteirão inteiro entre o aviso e o problema) e por
   * 10, que foi testado em campo e ficou pouco: a 10 m o raio era menor que o
   * erro típico do GPS urbano, e o alerta simplesmente não chegava.
   *
   * 30 m é o meio-termo que sobreviveu ao uso real — perto o bastante para não
   * haver dúvida sobre qual bronca o card fala, largo o bastante para o GPS
   * conseguir afirmar que você está lá.
   */
  distanciaAlertaM: 30,
  /** Abertura do cone à frente, para cada lado do rumo. */
  coneGraus: 45,
  /**
   * Categorias que só alertam com o sol abaixo do horizonte.
   *
   * Poste apagado de dia é invisível: ninguém consegue confirmar nem desmentir,
   * e o alerta pediria um julgamento impossível. À noite é a única hora em que
   * a informação existe — e é quando o problema de fato atrapalha alguém.
   */
  categoriasNoturnas: ['iluminacao'],
  /**
   * Piso de movimento para alertar. 0,7 m/s (~2,5 km/h) fica acima do tremor do
   * GPS parado e abaixo do passo de uma pessoa: quem anda a pé também encontra
   * buracos e postes apagados, e com 1,5 m/s a caminhada ficava de fora.
   */
  velocidadeMinimaMs: 0.7,
  /**
   * Leitura pior que isso não decide nada.
   *
   * Acompanha o raio, e a regra é uma só: a incerteza da posição nunca pode ser
   * maior que a régua que ela mede. Com 50 m de erro sobre um raio de 30 m, o
   * alerta dispararia e calaria ao acaso.
   *
   * Em 10 m esta regra estrangulava o recurso — o erro urbano comum (5 a 15 m)
   * já reprovava a leitura. Com a régua em 30 m ela volta a filtrar só o que é
   * de fato ruim.
   */
  precisaoMaximaM: 30,
  /**
   * Distância a partir da qual o card some sozinho.
   *
   * O card saía só por tempo (15 s). Andando, 15 s podem ser 200 m — e a pessoa
   * ficava olhando uma pergunta sobre um poste que já não enxerga. Perguntar
   * sobre o que não está mais à vista convida ao palpite, que é justamente o
   * contrário do que a confirmação serve para produzir.
   *
   * 50 m: cinco vezes o raio que fez o card aparecer. Perto o bastante para
   * ainda ser "aquele ali", longe o bastante para não sumir por um passo atrás
   * ou por um tremor do GPS.
   */
  raioAbandonoM: 50,
  /**
   * Broncas a esta distância uma da outra viram um card só.
   *
   * Três buracos no mesmo quarteirão são três perguntas idênticas em sequência,
   * e a terceira ninguém responde. Agrupadas, são uma pergunta com um número.
   */
  raioAgrupamentoM: 30,
  /** Status que ainda têm o que confirmar. */
  statusAlertaveis: ['pending', 'in-progress'],
};

/**
 * Decide se uma bronca deve alertar agora.
 *
 * Devolve `{ alerta: boolean, motivo: string, distancia, desvio }` — o motivo
 * existe para o teste afirmar POR QUE não alertou, em vez de só ver `false` e
 * não saber qual regra pegou.
 *
 * @param {{lat:number,lng:number,heading:number,speed:number,accuracy:number}} pos
 * @param {{id:string,lat:number,lng:number,status:string}} bronca
 */
export const avaliarAlerta = (pos, bronca, { jaAlertadas, agora } = {}) => {
  const nao = (motivo, extra = {}) => ({ alerta: false, motivo, ...extra });

  if (!pos || !Number.isFinite(pos.lat) || !Number.isFinite(pos.lng)) {
    return nao('sem-posicao');
  }
  if (!bronca || !Number.isFinite(bronca.lat) || !Number.isFinite(bronca.lng)) {
    return nao('sem-coordenada');
  }
  if (jaAlertadas?.has?.(bronca.id)) return nao('ja-alertada');
  if (!NAV_ALERTA.statusAlertaveis.includes(bronca.status)) {
    return nao('status-nao-alertavel');
  }

  // A patrulha é sempre de UMA categoria, e o corredor já filtra na origem
  // (useNavCorridor passa `category_filter`). Não existe mais lista de
  // categorias silenciosas: "outros" simplesmente não tem patrulha, então
  // nenhuma bronca dessa categoria chega até aqui.
  //
  // A regra da noite continua, e não é o mesmo tipo de coisa: escolher a
  // patrulha de iluminação não faz o poste ficar visível ao meio-dia.
  if (
    NAV_ALERTA.categoriasNoturnas.includes(bronca.category) &&
    !ehNoite(agora ?? Date.now(), pos.lat, pos.lng)
  ) {
    return nao('so-a-noite');
  }
  if (Number(pos.accuracy) > NAV_ALERTA.precisaoMaximaM) return nao('sinal-fraco');
  if (!(Number(pos.speed) >= NAV_ALERTA.velocidadeMinimaMs)) return nao('parado');
  if (!Number.isFinite(pos.heading)) return nao('sem-rumo');

  const distancia = haversine(pos, bronca);
  if (distancia > NAV_ALERTA.distanciaAlertaM) {
    return nao('longe', { distancia });
  }

  const desvio = angleDiff(bearing(pos, bronca), pos.heading);
  if (desvio > NAV_ALERTA.coneGraus) return nao('fora-do-cone', { distancia, desvio });

  return { alerta: true, motivo: 'ok', distancia, desvio };
};

/**
 * Roda `avaliarAlerta` na lista e devolve as que alertam, mais perto primeiro.
 * A ordem importa: só um card aparece por vez, e deve ser o da bronca que o
 * usuário vai encontrar antes.
 */
export const selecionarAlertas = (pos, broncas, jaAlertadas, opcoes = {}) =>
  (broncas || [])
    .map((b) => ({ bronca: b, ...avaliarAlerta(pos, b, { jaAlertadas, ...opcoes }) }))
    .filter((r) => r.alerta)
    .sort((a, b) => a.distancia - b.distancia);

/**
 * Junta num grupo só as broncas que estão praticamente no mesmo ponto.
 *
 * Recebe os candidatos JÁ ordenados por distância (saída de `selecionarAlertas`).
 * O primeiro é o líder — é dele que o card fala e é a partir dele que a
 * distância é medida; os demais entram se estiverem a menos de `raioM` dele.
 *
 * POR QUE MEDIR A PARTIR DO LÍDER, E NÃO ENTRE TODOS
 *
 * Agrupamento por proximidade mútua (cada um perto de algum outro) encadeia:
 * A perto de B, B perto de C, e C acaba no grupo mesmo estando longe de A. Numa
 * rua esburacada isso juntaria o quarteirão inteiro num card só, e a pessoa
 * confirmaria buracos que não viu. Medindo do líder, o grupo nunca é maior que
 * um círculo de `raioM`.
 *
 * @param {Array<{bronca:object, distancia:number}>} candidatos  perto → longe
 * @param {number} [raioM]
 * @returns {Array<object>} as broncas do grupo, líder primeiro
 */
export const agruparAlertas = (candidatos, raioM = NAV_ALERTA.raioAgrupamentoM) => {
  const lista = Array.isArray(candidatos) ? candidatos.filter(Boolean) : [];
  if (lista.length === 0) return [];

  const lider = lista[0].bronca;
  return [
    lider,
    ...lista
      .slice(1)
      .filter((c) => haversine(lider, c.bronca) <= raioM)
      .map((c) => c.bronca),
  ];
};

export const NAV_TRAJETO = {
  /** Trecho recente considerado para estimar rumo e velocidade. */
  janelaMs: 6000,
  /**
   * Janela máxima quando a curta não acumula deslocamento suficiente.
   *
   * Baixar o piso resolveria o caso do passo lento, mas colocaria o rumo dentro
   * do ruído do GPS e o mapa passaria a rodopiar parado. Esperar mais tempo
   * acumula distância real sem baixar a régua: a 0,8 m/s são ~10 m em 12 s.
   * O custo é o rumo responder mais devagar — só quando já está devagar.
   */
  janelaMaxMs: 12000,
  /**
   * Deslocamento mínimo na janela para afirmar que há uma direção.
   * Abaixo disso o que se mede é o erro do GPS, não movimento: 6 m fica acima
   * do tremor típico (3-5 m) e abaixo do que uma pessoa caminhando percorre em
   * 6 s (~7 m).
   */
  minDeslocamentoM: 6,
  /**
   * Multiplicador da precisão para aceitar o deslocamento como movimento.
   *
   * O piso de 6 m foi calibrado para a rua, onde o GPS erra 4 a 10 m. Dentro de
   * casa ele erra 40, 80 metros — e a deriva entre duas leituras passa dos 6 m
   * sem ninguém se mexer. Foi assim que o velocímetro marcou 32 km/h com o
   * aparelho na mesa: 50 m de salto em 6 s são 30 km/h de "velocidade".
   *
   * `accuracy` é um raio de confiança, então duas leituras do mesmo ponto podem
   * diferir por até 2 × accuracy sem movimento algum. O fator aqui é 1,5 e não
   * 2 como no rastro (NAV_RASTRO.fatorPrecisao), de propósito:
   *
   *   • errar no rastro ACUMULA — cada ponto falso soma distância para sempre,
   *     e vale ser rigoroso;
   *   • errar aqui CONGELA a seta e o velocímetro de quem está mesmo andando,
   *     que foi o problema que a janela longa existe para resolver.
   *
   * 1,5 mata a deriva de ambiente fechado (piso de 45 a 120 m) e ainda deixa
   * passar quem caminha na rua com sinal razoável (piso de 9 a 15 m).
   */
  fatorPrecisao: 1.5,
};

/**
 * Rumo e velocidade a partir do trajeto recente.
 *
 * Deliberadamente NÃO recebe `coords.speed` nem `coords.heading`. Um teste a pé
 * mostrou por quê: o aparelho reportava velocidade abaixo do limite de
 * movimento, o rumo nunca era recalculado e a seta ficava congelada — voltar
 * pela mesma rua aparecia como marcha à ré. Medir o deslocamento entre a
 * amostra mais antiga da janela e a atual não depende de campo opcional algum e
 * funciona igual a pé, de bicicleta ou de carro.
 *
 * A janela também é o que faz a referência avançar: comparar sempre contra o
 * ponto de partida daria o rumo da origem até aqui, não a direção atual.
 *
 * O PISO ACOMPANHA A PRECISÃO
 *
 * Cada amostra pode trazer sua `accuracy`. Quando traz, o deslocamento mínimo
 * deixa de ser fixo e passa a ser o maior entre os 6 m e o que a precisão
 * consegue distinguir de ruído. É o que separa "andei" de "o GPS pulou" dentro
 * de casa, onde ele pula dezenas de metros.
 *
 * @param {Array<{lat:number,lng:number,t:number,accuracy?:number}>} amostras  antiga → recente
 * @returns {{rumo:number|null, velocidade:number, deslocamento:number}}
 */
export const estimarMovimento = (amostras, opcoes = {}) => {
  const vazio = { rumo: null, velocidade: 0, deslocamento: 0 };
  if (!Array.isArray(amostras) || amostras.length < 2) return vazio;

  const janelaMs = opcoes.janelaMs ?? NAV_TRAJETO.janelaMs;
  const janelaMaxMs = opcoes.janelaMaxMs ?? NAV_TRAJETO.janelaMaxMs;
  const minDeslocamentoM = opcoes.minDeslocamentoM ?? NAV_TRAJETO.minDeslocamentoM;

  const atual = amostras[amostras.length - 1];

  const fatorPrecisao = opcoes.fatorPrecisao ?? NAV_TRAJETO.fatorPrecisao;

  const medir = (janela) => {
    const naJanela = amostras.filter((a) => atual.t - a.t <= janela);
    if (naJanela.length < 2) return null;
    const referencia = naJanela[0];
    const segundos = (atual.t - referencia.t) / 1000;
    if (segundos <= 0) return null;
    const deslocamento = haversine(referencia, atual);

    // A incerteza do deslocamento é a da PIOR das duas leituras: uma boa não
    // conserta o salto que a outra introduziu.
    const piorPrecisao = Math.max(
      Number.isFinite(referencia.accuracy) ? referencia.accuracy : 0,
      Number.isFinite(atual.accuracy) ? atual.accuracy : 0
    );
    const piso = Math.max(minDeslocamentoM, piorPrecisao * fatorPrecisao);

    return { deslocamento, velocidade: deslocamento / segundos, referencia, piso };
  };

  const curta = medir(janelaMs);
  if (!curta) return vazio;
  if (curta.deslocamento >= curta.piso) {
    return {
      rumo: bearing(curta.referencia, atual),
      velocidade: curta.velocidade,
      deslocamento: curta.deslocamento,
    };
  }

  // Passo lento: a janela curta não acumulou distância acima do ruído. Antes de
  // declarar "parado", olha mais para trás — é o que separa quem anda devagar
  // de quem está parado com o GPS tremendo.
  const longa = janelaMaxMs > janelaMs ? medir(janelaMaxMs) : null;
  if (longa && longa.deslocamento >= longa.piso) {
    return {
      rumo: bearing(longa.referencia, atual),
      velocidade: longa.velocidade,
      deslocamento: longa.deslocamento,
    };
  }

  // Sem movimento confirmado, a velocidade é ZERO — não a que o ruído sugere.
  //
  // Aqui devolvia `curta.velocidade`, e era esse número que o velocímetro
  // mostrava: dentro de casa, a deriva do GPS virava 32 km/h na tela de quem
  // estava sentado. Dizer zero é a resposta honesta — não conseguimos afirmar
  // que houve deslocamento, então não afirmamos velocidade nenhuma.
  return { rumo: null, velocidade: 0, deslocamento: curta.deslocamento };
};

/**
 * Quadrado em volta do ponto, em graus, para pedir o corredor à RPC.
 * A longitude encolhe com o cosseno da latitude — sem isso a caixa fica
 * estreita demais no norte e larga demais perto do equador.
 */
export const caixaDeRaio = ({ lat, lng }, raioM) => {
  const dLat = (raioM / R_TERRA_M) * (180 / Math.PI);
  const dLng = dLat / Math.max(0.01, Math.cos(rad(lat)));
  return {
    minLat: lat - dLat,
    maxLat: lat + dLat,
    minLng: lng - dLng,
    maxLng: lng + dLng,
  };
};

/**
 * Vetor para `map.panBy` que deixa o usuário `d` pixels abaixo do centro da
 * TELA, num mapa cujo container está girado por `rumo`.
 *
 * O Leaflet não sabe que o container foi girado por CSS: um `panBy([0, -d])`
 * desloca no espaço não girado, que a rotação depois leva para outro lugar da
 * tela — com rumo 90° o deslocamento "para baixo" vira "para a direita" e a
 * seta desaparece na lateral. Contra-rotacionar o vetor aqui faz o
 * deslocamento valer na tela, não no mapa.
 *
 * @returns {{x:number, y:number}} argumento de panBy
 */
export const panParaOffsetDeTela = (d, rumo) => {
  const r = rad(Number.isFinite(rumo) ? rumo : 0);
  return { x: d * Math.sin(r), y: -d * Math.cos(r) };
};

// ── Rastro da inspeção ────────────────────────────────────────────────────────

/**
 * Regras do rastro. Mais rígidas que as do alerta, de propósito.
 *
 * Errar um alerta custa um card indevido, que passa. Errar o rastro ACUMULA:
 * cada ponto falso soma distância que nunca mais sai do total da patrulha.
 *
 * A primeira versão pedia só 5 m de espaçamento e nada mais. Parado, o GPS
 * reporta ~1 leitura/s com erro de 5 a 15 m, e boa parte desses saltos passa de
 * 5 m — o rastro andava sozinho com o usuário sentado, somando quilômetros e
 * desenhando um novelo no ponto onde ele parou.
 */
export const NAV_RASTRO = {
  /**
   * Espaçamento mínimo entre pontos. 10 m fica acima do tremor típico; com 5 m
   * o piso ficava DENTRO do ruído que deveria filtrar.
   */
  espacamentoMinimoM: 10,
  /**
   * Precisão pior que isso não entra no rastro. 30 m, não os 50 m do alerta:
   * lá o número existe para não confundir a rua paralela, aqui cada leitura
   * ruim injeta o próprio erro na distância total.
   */
  precisaoMaximaM: 30,
  /**
   * Multiplicador da precisão para aceitar um deslocamento como real.
   *
   * É o freio que faz o trabalho pesado, e o único que a deriva não consegue
   * burlar. O campo `accuracy` é um raio de confiança: a posição verdadeira
   * está em algum lugar dentro dele. Duas leituras do MESMO ponto parado podem,
   * então, cair em lados opostos e diferir por até 2 × accuracy sem que ninguém
   * tenha se mexido.
   *
   * Exigir mais que isso é exigir um deslocamento que o ruído não explica.
   * Com accuracy de 12 m, o piso vira 24 m — e a deriva, presa ao raio de 12 m,
   * nunca chega lá. Quem anda chega em 17 segundos.
   *
   * Foi medido: com piso fixo de 10 m e só o teste de movimento, meia hora
   * parado ainda somava 2,6 km. Com este fator, zero.
   */
  fatorPrecisao: 2,
  /**
   * Salto entre pontos consecutivos que só pode ser erro de GPS.
   *
   * O rastro roda a ~1 Hz; 200 m entre duas leituras seria 720 km/h. Acontece
   * quando o aparelho troca de fonte (rede → satélite) e reposiciona de uma vez.
   */
  saltoMaximoM: 200,
};

/** @deprecated Use NAV_RASTRO.espacamentoMinimoM. Mantido para não quebrar imports. */
export const MIN_ESPACAMENTO_RASTRO_M = NAV_RASTRO.espacamentoMinimoM;

/**
 * O ponto novo entra no rastro?
 *
 * Três perguntas, nesta ordem — a mais barata primeiro:
 *
 *   1. A leitura é confiável? (precisão)
 *   2. O usuário está de fato se movendo? (emMovimento, vindo de
 *      estimarMovimento: só é verdade com ≥6 m de deslocamento na janela)
 *   3. Andou o bastante desde o último ponto? (espaçamento)
 *
 * A 2 é o freio que faltava. O teste de movimento já existia e alimentava os
 * alertas; o rastro simplesmente não o consultava.
 *
 * @param {{lat:number,lng:number}|null} ultimo   último ponto já no rastro
 * @param {{lat:number,lng:number,accuracy?:number}} novo
 * @param {{emMovimento?:boolean, espacamentoMinimoM?:number, precisaoMaximaM?:number}|number} [opcoes]
 */
export const deveRegistrarPonto = (ultimo, novo, opcoes = {}) => {
  // Assinatura antiga — deveRegistrarPonto(ultimo, novo, 8) — continua
  // significando "só o espaçamento", sem exigir movimento.
  const cfg = typeof opcoes === 'number'
    ? { espacamentoMinimoM: opcoes, emMovimento: true, precisaoMaximaM: Infinity }
    : opcoes;

  const espacamentoMinimoM = cfg.espacamentoMinimoM ?? NAV_RASTRO.espacamentoMinimoM;
  const precisaoMaximaM = cfg.precisaoMaximaM ?? NAV_RASTRO.precisaoMaximaM;
  const emMovimento = cfg.emMovimento ?? true;

  if (!novo || !Number.isFinite(novo.lat) || !Number.isFinite(novo.lng)) return false;

  // Precisão ausente é tratada como aceitável: alguns navegadores não a
  // informam, e recusar tudo deixaria o rastro vazio nesses aparelhos.
  if (Number.isFinite(novo.accuracy) && novo.accuracy > precisaoMaximaM) return false;

  // Primeiro ponto: não há distância a medir, mas parado também não começa.
  if (!ultimo) return emMovimento;

  if (!emMovimento) return false;

  const d = haversine(ultimo, novo);
  if (d > NAV_RASTRO.saltoMaximoM) return false;

  // Sem precisão informada não há como calibrar, e o piso fixo é o que resta.
  const pisoDoRuido = Number.isFinite(novo.accuracy)
    ? novo.accuracy * (cfg.fatorPrecisao ?? NAV_RASTRO.fatorPrecisao)
    : 0;

  return d >= Math.max(espacamentoMinimoM, pisoDoRuido);
};

/** Distância percorrida, somando os segmentos do rastro. */
export const distanciaTotal = (pontos) => {
  if (!Array.isArray(pontos) || pontos.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < pontos.length; i += 1) {
    total += haversine(pontos[i - 1], pontos[i]);
  }
  return total;
};

/** Texto falado do alerta. "100 metros" soa melhor que "97 metros". */
export const frasear = (categoriaLabel, distanciaM) => {
  const passo = distanciaM > 100 ? 50 : 10;
  const arredondado = Math.max(passo, Math.round(distanciaM / passo) * passo);
  return `${categoriaLabel} a ${arredondado} metros`;
};

// ── Guardar o percurso ──────────────────────────────────────────────────────

/** Teto de pontos gravados por patrulha. Ver `simplificarRastro`. */
export const MAX_PONTOS_GRAVADOS = 1200;

/** Desvio tolerado ao simplificar, em metros. */
export const TOLERANCIA_SIMPLIFICACAO_M = 8;

/**
 * Distância de um ponto até o segmento AB, em metros.
 *
 * Projeção plana: nas dezenas de metros que interessam aqui, a curvatura da
 * Terra não muda o resultado o bastante para aparecer. A longitude encolhe por
 * cos(lat) porque um grau de longitude vale menos quanto mais longe do equador
 * — sem isso, um percurso no Brasil ficaria achatado e a simplificação cortaria
 * curvas que existem.
 */
const distanciaAoSegmento = (p, a, b) => {
  const escalaLng = Math.cos(rad((a.lat + b.lat) / 2));
  const x = (p.lng - a.lng) * escalaLng;
  const y = p.lat - a.lat;
  const dx = (b.lng - a.lng) * escalaLng;
  const dy = b.lat - a.lat;

  const comprimento2 = dx * dx + dy * dy;
  // A e B no mesmo lugar: o segmento virou ponto, e a distância é até ele.
  if (comprimento2 === 0) return haversine(p, a);

  // Onde a projeção de P cai sobre AB, presa entre as pontas.
  const t = Math.max(0, Math.min(1, (x * dx + y * dy) / comprimento2));

  return haversine(p, {
    lat: a.lat + t * dy,
    lng: a.lng + (t * dx) / escalaLng,
  });
};

/**
 * Reduz o rastro ao mínimo que ainda desenha o mesmo caminho.
 *
 * POR QUE NÃO GRAVAR O RASTRO INTEIRO
 *
 * O rastro nasce com um ponto a cada 10 m (NAV_RASTRO.espacamentoMinimoM), o
 * que é o que a linha na tela precisa para não ficar angulosa enquanto o carro
 * anda. Guardar tudo é outra conversa: uma patrulha de 15 km vira 1500 pontos,
 * e quase todos estão em cima de retas — quarteirões inteiros descritos por
 * dezenas de pontos que um só par de pontas descreveria igual.
 *
 * Ramer–Douglas–Peucker: mantém a ponta mais distante da reta que liga os
 * extremos, e repete dos dois lados. O que sobra são as esquinas. Numa cidade,
 * corta entre metade e três quartos dos pontos sem mudar um pixel do traço.
 *
 * O TETO EXISTE PARA O CASO QUE NÃO SE PREVÊ
 *
 * Tolerância não garante limite: um percurso longo e cheio de curvas pode
 * sobreviver quase inteiro. Como isto vai para uma coluna do banco a cada
 * patrulha, o teto é a promessa de que a linha nunca cresce sem limite — se
 * ainda passar, joga fora um ponto sim outro não até caber.
 *
 * @param {Array<{lat:number,lng:number}>} pontos
 * @param {number} toleranciaM  desvio máximo aceito, em metros
 * @param {number} maximo       teto de pontos no resultado
 */
export const simplificarRastro = (
  pontos,
  toleranciaM = TOLERANCIA_SIMPLIFICACAO_M,
  maximo = MAX_PONTOS_GRAVADOS
) => {
  if (!Array.isArray(pontos)) return [];

  const limpos = pontos.filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );
  if (limpos.length <= 2) return limpos.map(({ lat, lng }) => ({ lat, lng }));

  // Iterativo, não recursivo: a recursão de RDP tem profundidade igual ao
  // número de pontos no pior caso (um percurso monotonicamente curvo), e
  // 1500 quadros de pilha estouram em aparelho modesto.
  const manter = new Uint8Array(limpos.length);
  manter[0] = 1;
  manter[limpos.length - 1] = 1;

  const pilha = [[0, limpos.length - 1]];
  while (pilha.length > 0) {
    const [inicio, fim] = pilha.pop();
    if (fim - inicio < 2) continue;

    let piorIndice = -1;
    let piorDistancia = 0;
    for (let i = inicio + 1; i < fim; i += 1) {
      const d = distanciaAoSegmento(limpos[i], limpos[inicio], limpos[fim]);
      if (d > piorDistancia) {
        piorDistancia = d;
        piorIndice = i;
      }
    }

    // Ninguém se afasta o bastante: o trecho inteiro é uma reta, e as pontas
    // já a descrevem.
    if (piorIndice === -1 || piorDistancia <= toleranciaM) continue;

    manter[piorIndice] = 1;
    pilha.push([inicio, piorIndice], [piorIndice, fim]);
  }

  let resultado = limpos
    .filter((_, i) => manter[i])
    .map(({ lat, lng }) => ({ lat, lng }));

  // O desbaste do teto preserva as duas pontas: começo e fim são o que dá
  // sentido ao traço, e perdê-los faria a linha nascer e morrer no nada.
  while (resultado.length > maximo) {
    const desbastado = resultado.filter((_, i) => i % 2 === 0);
    const ultimo = resultado[resultado.length - 1];
    if (desbastado[desbastado.length - 1] !== ultimo) desbastado.push(ultimo);
    resultado = desbastado;
  }

  return resultado;
};

/**
 * Rastro no formato que vai para o banco: `[[lng, lat], …]`.
 *
 * Par cru em vez de objeto para não repetir as chaves "lat" e "lng" mil vezes
 * dentro do JSON — em mil pontos, são 10 kB só de nomes de campo.
 *
 * A ordem é `[lng, lat]`, a do GeoJSON. É o contrário da ordem que o Leaflet
 * pede, e é de propósito: quem ler esta coluna amanhã com PostGIS encontra o
 * que espera. Quem desenha faz a inversão, que é uma linha.
 *
 * Cinco casas decimais são ~1 m no equador — mais que isso é gravar ruído do
 * GPS, cujo erro é de metros.
 */
export const rastroParaBanco = (pontos, opcoes = {}) =>
  simplificarRastro(
    pontos,
    opcoes.toleranciaM ?? TOLERANCIA_SIMPLIFICACAO_M,
    opcoes.maximo ?? MAX_PONTOS_GRAVADOS
  ).map(({ lat, lng }) => [
    Math.round(lng * 1e5) / 1e5,
    Math.round(lat * 1e5) / 1e5,
  ]);

/** O caminho de volta: `[[lng, lat], …]` para o que o Leaflet desenha. */
export const rastroDoBanco = (bruto) => {
  if (!Array.isArray(bruto)) return [];
  return bruto
    .filter((p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1]))
    .map(([lng, lat]) => ({ lat, lng }));
};

/**
 * Projeta um percurso numa caixa de `largura` × `altura` pixels.
 *
 * PARA QUE SERVE
 *
 * A miniatura do traçado na lista de patrulhas — a figura que o Strava mostra
 * em cada atividade. Não é mapa: não há tiles, não há zoom, não há Leaflet. É
 * a forma do trajeto, desenhada como um `<polyline>` de SVG.
 *
 * POR QUE A LONGITUDE ENCOLHE
 *
 * Um grau de longitude vale menos quanto mais longe do equador — em Floresta-PE
 * (-8,6°) vale cerca de 99% de um grau de latitude; em Porto Alegre, 87%.
 * Projetando os graus direto, o traçado sairia esticado na horizontal, e a
 * distorção mudaria de cidade para cidade. O `cos(lat)` corrige isso: é a
 * projeção equirretangular, que para o tamanho de uma patrulha é exata o
 * bastante.
 *
 * A ESCALA É A MESMA NOS DOIS EIXOS
 *
 * Esticar cada eixo para preencher a caixa faria um trajeto reto de 3 km virar
 * um quadrado, e dois percursos diferentes ficarem com a mesma cara. Uma escala
 * só, a menor das duas, e o que sobra vira margem centrada.
 *
 * @returns {{pontos: Array<{x:number,y:number}>, projetar: Function}}
 */
export const enquadrarRastro = (pontos, largura, altura, margem = 4) => {
  const limpos = (pontos || []).filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng)
  );
  const vazio = { pontos: [], projetar: () => null };
  if (limpos.length === 0) return vazio;

  let latMin = Infinity, latMax = -Infinity, lngMin = Infinity, lngMax = -Infinity;
  for (const p of limpos) {
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
    if (p.lng < lngMin) lngMin = p.lng;
    if (p.lng > lngMax) lngMax = p.lng;
  }

  const escalaLng = Math.cos(rad((latMin + latMax) / 2)) || 1;
  const larguraGraus = (lngMax - lngMin) * escalaLng;
  const alturaGraus = latMax - latMin;

  const utilX = Math.max(1, largura - margem * 2);
  const utilY = Math.max(1, altura - margem * 2);

  // Percurso de um ponto só, ou perfeitamente reto num dos eixos: a extensão
  // é zero e a divisão seria infinita. Escala 1 e o centramento resolve.
  const escala =
    larguraGraus <= 0 && alturaGraus <= 0
      ? 1
      : Math.min(
          larguraGraus > 0 ? utilX / larguraGraus : Infinity,
          alturaGraus > 0 ? utilY / alturaGraus : Infinity
        );

  const sobraX = (largura - larguraGraus * escala) / 2;
  const sobraY = (altura - alturaGraus * escala) / 2;

  const projetar = (p) => {
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) return null;
    return {
      x: sobraX + (p.lng - lngMin) * escalaLng * escala,
      // Y do SVG cresce para BAIXO e a latitude cresce para o norte: sem esta
      // inversão o percurso sai espelhado, com o norte embaixo.
      y: altura - sobraY - (p.lat - latMin) * escala,
    };
  };

  return { pontos: limpos.map(projetar), projetar };
};
