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

// ── Parâmetros do alerta ──────────────────────────────────────────────────────

export const NAV_ALERTA = {
  /** Distância em que o alerta dispara. */
  distanciaAlertaM: 120,
  /** Abertura do cone à frente, para cada lado do rumo. */
  coneGraus: 45,
  /**
   * Piso de movimento para alertar. 0,7 m/s (~2,5 km/h) fica acima do tremor do
   * GPS parado e abaixo do passo de uma pessoa: quem anda a pé também encontra
   * buracos e postes apagados, e com 1,5 m/s a caminhada ficava de fora.
   */
  velocidadeMinimaMs: 0.7,
  /** Leitura pior que isso confunde a rua paralela com a atual. */
  precisaoMaximaM: 50,
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
export const avaliarAlerta = (pos, bronca, { jaAlertadas } = {}) => {
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
export const selecionarAlertas = (pos, broncas, jaAlertadas) =>
  (broncas || [])
    .map((b) => ({ bronca: b, ...avaliarAlerta(pos, b, { jaAlertadas }) }))
    .filter((r) => r.alerta)
    .sort((a, b) => a.distancia - b.distancia);

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
 * @param {Array<{lat:number,lng:number,t:number}>} amostras  antiga → recente
 * @returns {{rumo:number|null, velocidade:number, deslocamento:number}}
 */
export const estimarMovimento = (amostras, opcoes = {}) => {
  const vazio = { rumo: null, velocidade: 0, deslocamento: 0 };
  if (!Array.isArray(amostras) || amostras.length < 2) return vazio;

  const janelaMs = opcoes.janelaMs ?? NAV_TRAJETO.janelaMs;
  const janelaMaxMs = opcoes.janelaMaxMs ?? NAV_TRAJETO.janelaMaxMs;
  const minDeslocamentoM = opcoes.minDeslocamentoM ?? NAV_TRAJETO.minDeslocamentoM;

  const atual = amostras[amostras.length - 1];

  const medir = (janela) => {
    const naJanela = amostras.filter((a) => atual.t - a.t <= janela);
    if (naJanela.length < 2) return null;
    const referencia = naJanela[0];
    const segundos = (atual.t - referencia.t) / 1000;
    if (segundos <= 0) return null;
    const deslocamento = haversine(referencia, atual);
    return { deslocamento, velocidade: deslocamento / segundos, referencia };
  };

  const curta = medir(janelaMs);
  if (!curta) return vazio;
  if (curta.deslocamento >= minDeslocamentoM) {
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
  if (longa && longa.deslocamento >= minDeslocamentoM) {
    return {
      rumo: bearing(longa.referencia, atual),
      velocidade: longa.velocidade,
      deslocamento: longa.deslocamento,
    };
  }

  return { rumo: null, velocidade: curta.velocidade, deslocamento: curta.deslocamento };
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
 * Espaçamento mínimo entre pontos do rastro.
 *
 * O GPS reporta ~1 leitura por segundo mesmo parado, e cada uma cai alguns
 * metros ao lado da anterior. Sem piso, uma inspeção de meia hora acumularia
 * 1.800 pontos, a maioria só tremor — o traço na tela viraria um borrão no
 * ponto onde a pessoa parou.
 */
export const MIN_ESPACAMENTO_RASTRO_M = 5;

/** O ponto novo está longe o bastante do último para entrar no rastro? */
export const deveRegistrarPonto = (ultimo, novo, minimoM = MIN_ESPACAMENTO_RASTRO_M) => {
  if (!ultimo) return true;
  if (!novo || !Number.isFinite(novo.lat) || !Number.isFinite(novo.lng)) return false;
  return haversine(ultimo, novo) >= minimoM;
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
