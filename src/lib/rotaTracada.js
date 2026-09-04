// O desenho da Rota do Dia no mapa — o caminho, e não a reta.
//
// POR QUE A RETA NÃO SERVE
//
// `montarRota` (rotaDoDia.js) escolhe as paradas e a ordem, e mede tudo em
// distância de pássaro. Isso basta para ORÇAR a caminhada, e não basta para
// DESENHÁ-LA: uma reta ligando duas paradas atravessa quarteirão, muro e rio, e
// quem olha o mapa entende "corte caminho por aqui" — que é a única leitura
// possível de uma linha reta sobre um mapa de ruas.
//
// POR QUE ISTO NÃO CHAMA UM SERVIÇO DE ROTEAMENTO
//
// Porque o traçado das ruas JÁ ESTÁ NO BANCO. `pavement_streets.path` guarda o
// MULTILINESTRING de cada rua desde a migração 203, alimentado pelo mapa de
// pavimentação. Onde a cidade tem esse cadastro, o grafo de caminhada sai dele
// sem rede, sem chave de API, sem limite de requisição e sem mandar a posição
// de ninguém para um terceiro.
//
// A CIDADE SEM CADASTRO NÃO PERDE A ROTA
//
// Nem toda cidade tem pavimentação mapeada — e a rota tem de funcionar no dia
// em que a cidade entra no app, não seis meses depois. Sem geometria (ou com
// uma parada longe demais de qualquer via conhecida) o trecho vira reta
// pontilhada, e o mapa diz isso em vez de fingir precisão. As paradas seguem
// numeradas na ordem da rota, que é o que a pessoa realmente usa para andar.
//
// POR QUE OS TRECHOS SÃO INDEPENDENTES
//
// Cada perna do percurso é traçada sozinha. Uma parada dentro de um condomínio
// sem via cadastrada estraga o trecho dela, não o percurso inteiro — e
// `tracado: 'parcial'` é uma informação honesta que a tela sabe mostrar.

// Import relativo, não pelo alias '@/': os testes rodam em `node --test`, que
// não conhece o alias do Vite.
import { haversine } from './navGeo.js';

/**
 * Quão longe uma parada pode estar da via mais próxima e ainda ser encaixada
 * nela.
 *
 * 80 m é a largura de um quarteirão folgado. Acima disso o "encaixe" começaria
 * a mandar a pessoa para a rua errada — e uma reta honesta é melhor que um
 * caminho errado com cara de caminho certo.
 */
export const TOLERANCIA_ENCAIXE_M = 80;

/**
 * Espaçamento máximo entre vértices do grafo, em metros.
 *
 * O OSM descreve rua reta com dois pontos — os extremos. Sem adensar, uma
 * parada no meio da quadra encaixaria na esquina a 200 m dali, e o traçado
 * daria a volta inteira para chegar onde a pessoa já está. Adensar cria o
 * vértice do meio do caminho.
 *
 * 20 m é o passo: menor que isso multiplica o grafo sem melhorar nada visível
 * num mapa de rua; maior deixa o encaixe grosseiro de novo.
 */
const PASSO_M = 20;

/**
 * Teto de vértices do grafo.
 *
 * O adensamento é linear no comprimento total das vias, e uma cidade grande com
 * cadastro completo poderia gerar centenas de milhares de nós num aparelho
 * modesto. Estourado o teto, o grafo para de crescer e o que faltou vira
 * trecho em reta — degradação visível, e não travamento.
 */
const MAX_NOS = 60000;

/** Casas decimais da chave de nó: 6 ≈ 11 cm, fino o bastante para o OSM. */
const PRECISAO = 6;

/**
 * A chave de um vértice.
 *
 * Duas vias que se cruzam no OSM COMPARTILHAM o nó do cruzamento — as
 * coordenadas são idênticas na origem, e é isso que liga uma rua à outra aqui.
 * Arredondar demais fundiria esquinas vizinhas; de menos separaria o mesmo nó
 * por erro de ponto flutuante na ida e volta do PostGIS.
 */
export const chaveDoNo = (lat, lng) => `${lat.toFixed(PRECISAO)},${lng.toFixed(PRECISAO)}`;

const numero = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

/** Um ponto qualquer virando `{lat,lng}`, ou `null` se não for um. */
export const comoPonto = (p) => {
  if (!p) return null;
  if (Array.isArray(p)) {
    const [lat, lng] = p;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  const lat = numero(p.lat);
  const lng = numero(p.lng);
  return lat === null || lng === null ? null : { lat, lng };
};

/**
 * A caixa que cobre os pontos, com folga em metros.
 *
 * Serve para descartar via distante ANTES de adensar: o grafo só precisa das
 * ruas que o percurso pode usar, e carregar a cidade inteira num percurso de
 * 1,5 km é pagar memória por nada.
 */
export const caixaDaRota = (pontos, folgaM = 400) => {
  const uteis = (pontos || []).map(comoPonto).filter(Boolean);
  if (uteis.length === 0) return null;

  const lats = uteis.map((p) => p.lat);
  const lngs = uteis.map((p) => p.lng);
  const centroLat = (Math.min(...lats) + Math.max(...lats)) / 2;

  const folgaLat = folgaM / 111320;
  // O grau de longitude encolhe com o cosseno da latitude. Sem isso, a folga
  // seria estreita demais perto do equador e larga demais longe dele.
  const folgaLng = folgaM / (111320 * Math.max(0.1, Math.cos((centroLat * Math.PI) / 180)));

  return {
    sul: Math.min(...lats) - folgaLat,
    norte: Math.max(...lats) + folgaLat,
    oeste: Math.min(...lngs) - folgaLng,
    leste: Math.max(...lngs) + folgaLng,
  };
};

const dentroDaCaixa = (caixa, { lat, lng }) =>
  !caixa || (lat >= caixa.sul && lat <= caixa.norte && lng >= caixa.oeste && lng <= caixa.leste);

/**
 * Os pontos intermediários de um segmento, a cada `PASSO_M`.
 *
 * Não devolve os extremos: quem chama já os tem, e repeti-los criaria aresta de
 * comprimento zero.
 */
const adensar = (a, b) => {
  const metros = haversine(a, b);
  const partes = Math.floor(metros / PASSO_M);
  if (partes < 2) return [];

  const meio = [];
  for (let i = 1; i < partes; i += 1) {
    const t = i / partes;
    meio.push({ lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t });
  }
  return meio;
};

/**
 * O grafo de caminhada.
 *
 * @param {Array<Array<[number,number]>>} linhas  vias em [lat, lng]
 * @param {{caixa?:object}} [opcoes]
 * @returns {{nos:Map, vizinhos:Map, vazio:boolean}}
 */
export const montarGrafo = (linhas, { caixa = null } = {}) => {
  const nos = new Map();
  const vizinhos = new Map();

  const registrar = (ponto) => {
    const chave = chaveDoNo(ponto.lat, ponto.lng);
    if (!nos.has(chave)) {
      nos.set(chave, ponto);
      vizinhos.set(chave, []);
    }
    return chave;
  };

  const ligar = (chaveA, chaveB, metros) => {
    if (chaveA === chaveB) return;
    vizinhos.get(chaveA).push({ chave: chaveB, metros });
    vizinhos.get(chaveB).push({ chave: chaveA, metros });
  };

  for (const linha of linhas || []) {
    if (!Array.isArray(linha) || linha.length < 2) continue;
    if (nos.size >= MAX_NOS) break;

    const pontos = linha.map(comoPonto).filter(Boolean);
    // Uma via inteiramente fora da caixa não participa do percurso. Basta um
    // vértice dentro: a via que entra e sai da caixa é justamente a que liga o
    // percurso ao resto da malha.
    if (caixa && !pontos.some((p) => dentroDaCaixa(caixa, p))) continue;

    let anterior = null;
    for (const ponto of pontos) {
      if (anterior) {
        let de = anterior;
        for (const meio of adensar(anterior, ponto)) {
          const chaveDe = registrar(de);
          const chaveMeio = registrar(meio);
          ligar(chaveDe, chaveMeio, haversine(de, meio));
          de = meio;
        }
        const chaveDe = registrar(de);
        const chaveAte = registrar(ponto);
        ligar(chaveDe, chaveAte, haversine(de, ponto));
      }
      anterior = ponto;
    }
  }

  return { nos, vizinhos, vazio: nos.size === 0 };
};

/**
 * O vértice mais próximo de um ponto, dentro da tolerância.
 *
 * Varredura linear de propósito: o grafo já vem recortado pela caixa do
 * percurso, são poucos milhares de nós, e um índice espacial aqui seria
 * estrutura para manter sem ganho que alguém consiga medir.
 */
export const encaixar = (grafo, ponto, tolerancia = TOLERANCIA_ENCAIXE_M) => {
  const alvo = comoPonto(ponto);
  if (!alvo || !grafo || grafo.vazio) return null;

  let melhor = null;
  for (const [chave, no] of grafo.nos) {
    const metros = haversine(alvo, no);
    if (metros <= tolerancia && (!melhor || metros < melhor.metros)) {
      melhor = { chave, no, metros };
    }
  }
  return melhor;
};

/**
 * Fila de prioridade mínima.
 *
 * Um `sort()` a cada extração transformaria o Dijkstra em O(n² log n) e daria
 * para sentir no aparelho justamente onde a rota importa: na rua, com o mapa
 * aberto. São trinta linhas para não pagar isso.
 */
class FilaMinima {
  constructor() {
    this.itens = [];
  }

  get tamanho() {
    return this.itens.length;
  }

  inserir(chave, custo) {
    this.itens.push({ chave, custo });
    let i = this.itens.length - 1;
    while (i > 0) {
      const pai = (i - 1) >> 1;
      if (this.itens[pai].custo <= this.itens[i].custo) break;
      [this.itens[pai], this.itens[i]] = [this.itens[i], this.itens[pai]];
      i = pai;
    }
  }

  extrair() {
    const topo = this.itens[0];
    const ultimo = this.itens.pop();
    if (this.itens.length > 0) {
      this.itens[0] = ultimo;
      let i = 0;
      for (;;) {
        const esq = 2 * i + 1;
        const dir = esq + 1;
        let menor = i;
        if (esq < this.itens.length && this.itens[esq].custo < this.itens[menor].custo) menor = esq;
        if (dir < this.itens.length && this.itens[dir].custo < this.itens[menor].custo) menor = dir;
        if (menor === i) break;
        [this.itens[menor], this.itens[i]] = [this.itens[i], this.itens[menor]];
        i = menor;
      }
    }
    return topo;
  }
}

/**
 * O menor caminho entre dois vértices do grafo.
 *
 * @returns {{pontos:Array<{lat,lng}>, metros:number}|null}
 */
export const caminhoNoGrafo = (grafo, chaveOrigem, chaveDestino, { tetoM = 4000 } = {}) => {
  if (!grafo || grafo.vazio) return null;
  if (!grafo.nos.has(chaveOrigem) || !grafo.nos.has(chaveDestino)) return null;
  if (chaveOrigem === chaveDestino) {
    return { pontos: [grafo.nos.get(chaveOrigem)], metros: 0 };
  }

  const custo = new Map([[chaveOrigem, 0]]);
  const veioDe = new Map();
  const fechados = new Set();
  const fila = new FilaMinima();
  fila.inserir(chaveOrigem, 0);

  while (fila.tamanho > 0) {
    const { chave, custo: atual } = fila.extrair();
    if (fechados.has(chave)) continue;
    fechados.add(chave);
    if (chave === chaveDestino) break;
    // O teto não é otimização: é a recusa a desenhar um desvio de 4 km entre
    // duas paradas que estão a 200 m uma da outra. Quando a malha cadastrada
    // não liga as duas, a reta pontilhada é a resposta menos enganosa.
    if (atual > tetoM) break;

    for (const aresta of grafo.vizinhos.get(chave) || []) {
      if (fechados.has(aresta.chave)) continue;
      const novo = atual + aresta.metros;
      if (novo < (custo.get(aresta.chave) ?? Infinity)) {
        custo.set(aresta.chave, novo);
        veioDe.set(aresta.chave, chave);
        fila.inserir(aresta.chave, novo);
      }
    }
  }

  if (!fechados.has(chaveDestino)) return null;

  const pontos = [];
  let cursor = chaveDestino;
  while (cursor !== undefined) {
    pontos.unshift(grafo.nos.get(cursor));
    if (cursor === chaveOrigem) break;
    cursor = veioDe.get(cursor);
  }

  return { pontos, metros: custo.get(chaveDestino) };
};

/**
 * O percurso desenhável da rota.
 *
 * @param {object} args
 * @param {{lat,lng}|null} args.posicao   de onde a pessoa sai; opcional
 * @param {Array<{lat,lng}>} args.paradas na ordem da rota
 * @param {Array<Array<[number,number]>>} [args.linhas] vias em [lat, lng]
 * @returns {{trechos:Array, metros:number, tracado:'ruas'|'parcial'|'reta'}}
 */
export const tracarRota = ({
  posicao = null,
  paradas = [],
  linhas = [],
  detalharAcessos = false,
} = {}) => {
  const pontos = [comoPonto(posicao), ...(paradas || []).map(comoPonto)].filter(Boolean);
  if (pontos.length < 2) return { trechos: [], metros: 0, tracado: 'reta' };

  const caixa = caixaDaRota(pontos);
  const grafo = montarGrafo(linhas, { caixa });
  const encaixes = pontos.map((p) => encaixar(grafo, p));

  const trechos = [];
  let metros = 0;
  let porRua = 0;

  for (let i = 0; i < pontos.length - 1; i += 1) {
    const de = pontos[i];
    const ate = pontos[i + 1];
    const caminho =
      encaixes[i] && encaixes[i + 1]
        ? caminhoNoGrafo(grafo, encaixes[i].chave, encaixes[i + 1].chave)
        : null;

    if (caminho && caminho.pontos.length >= 2) {
      // O trecho começa e termina nos pontos REAIS, não nos vértices em que
      // eles encaixaram: sem isso a linha nasceria na esquina e a parada
      // ficaria solta ao lado dela.
      const total = caminho.metros + encaixes[i].metros + encaixes[i + 1].metros;
      if (detalharAcessos) {
        const primeiro = caminho.pontos[0];
        const ultimo = caminho.pontos[caminho.pontos.length - 1];

        // GPS, broncas e sinais quase nunca caem exatamente sobre o eixo da
        // via. Esses pequenos encaixes sao aproximações, portanto aparecem
        // tracejados; só o miolo calculado no grafo é mostrado como rua.
        if (encaixes[i].metros > 2) {
          trechos.push({
            tipo: 'acesso',
            pontos: [de, primeiro],
            metros: Math.round(encaixes[i].metros),
          });
        }
        trechos.push({
          tipo: 'ruas',
          pontos: caminho.pontos,
          metros: Math.round(caminho.metros),
        });
        if (encaixes[i + 1].metros > 2) {
          trechos.push({
            tipo: 'acesso',
            pontos: [ultimo, ate],
            metros: Math.round(encaixes[i + 1].metros),
          });
        }
      } else {
        const linha = [de, ...caminho.pontos, ate];
        trechos.push({ tipo: 'ruas', pontos: linha, metros: Math.round(total) });
      }
      metros += total;
      porRua += 1;
    } else {
      const total = haversine(de, ate);
      trechos.push({ tipo: 'reta', pontos: [de, ate], metros: Math.round(total) });
      metros += total;
    }
  }

  return {
    trechos,
    metros: Math.round(metros),
    // `trechos` pode conter os acessos tracejados, mas a qualidade é medida
    // por perna solicitada. Um acesso não transforma uma rota viária em rota
    // parcial.
    tracado: porRua === 0 ? 'reta' : porRua === pontos.length - 1 ? 'ruas' : 'parcial',
  };
};

/**
 * O que a tela diz sobre a qualidade do traçado.
 *
 * Sempre há texto: um percurso em reta sem aviso lê como caminho conferido, e
 * essa é a única leitura que este arquivo existe para impedir.
 */
export const rotuloDoTracado = (tracado) => {
  if (tracado === 'ruas') return 'Caminho traçado pelas ruas mapeadas.';
  if (tracado === 'parcial') {
    return 'Parte do caminho segue as ruas mapeadas; o trecho pontilhado é em linha reta.';
  }
  return 'Esta cidade ainda não tem ruas mapeadas: as linhas ligam as paradas em reta, na ordem.';
};
