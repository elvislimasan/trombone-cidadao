// O traçado da rua, vindo do OpenStreetMap.
//
// POR QUE UMA CHAMADA POR CIDADE, E NÃO UMA POR RUA
//
// O caminho óbvio seria pedir ao Overpass o nome de cada rua, uma por vez. É o
// caminho errado por dois motivos:
//
//   • RATE LIMIT. Floresta tem ~400 ruas. Quatrocentas chamadas seguidas é
//     exatamente o padrão que o Overpass bloqueia — e ele é gratuito e mantido
//     por doação.
//
//   • ACENTO. O regex do Overpass tem `,i` para maiúsculas, mas não tem nada
//     para diacrítico: "Damião" e "Damiao" são strings diferentes lá, e metade
//     da base brasileira não casaria.
//
// Então a consulta traz TODA via nomeada da região, e o casamento acontece
// aqui, onde `normalize('NFD')` resolve o acento e um teste cobre cada caso.
//
// O CASADOR NÃO CHUTA
//
// São três degraus: nome idêntico, nome idêntico ignorando o tipo da via, e
// "não casou". Sem distância de edição, sem "melhor aproximação". Errar para
// menos deixa a rua sem desenho, e isso se vê; errar para mais desenha a rua
// errada no mapa oficial de pavimentação, e isso passa por informação.

export const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/** Metros por grau de latitude. Basta para a guarda de distância. */
const METROS_POR_GRAU = 111320;

/** Quão longe do ponto cadastrado uma via pode estar e ainda ser a mesma rua. */
const RAIO_DE_CONFIANCA_M = 2000;

const ABREVIATURAS = [
  [/\bn\.?\s*sra\.?\b/g, 'nossa senhora'],
  [/\br\.\B|\br\.\s/g, 'rua '],
  [/\bav\.?\b/g, 'avenida'],
  [/\btrav\.?\b/g, 'travessa'],
  [/\bpc\.?\b|\bpca\.?\b/g, 'praca'],
  [/\bpe\.?\b/g, 'padre'],
  [/\bdr\.?\b/g, 'doutor'],
  [/\bdra\.?\b/g, 'doutora'],
  [/\bprof\.?\b/g, 'professor'],
  [/\bprofa\.?\b/g, 'professora'],
  [/\bsta\.?\b/g, 'santa'],
  [/\bsto\.?\b/g, 'santo'],
  [/\bcel\.?\b/g, 'coronel'],
  [/\bmal\.?\b/g, 'marechal'],
  [/\bpres\.?\b/g, 'presidente'],
];

/** Os tipos de via, para o segundo degrau do casador. */
const TIPOS = ['rua', 'avenida', 'travessa', 'praca', 'rodovia', 'estrada', 'alameda', 'via', 'largo', 'beco'];

export const normalizarNomeDeRua = (nome) => {
  let texto = String(nome || '')
    // O que está entre parênteses é anotação do cadastro, não nome da via:
    // "(antiga Rua Projetada 4)" nunca vai estar no OSM.
    .replace(/\([^)]*\)/g, ' ')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

  for (const [de, para] of ABREVIATURAS) texto = texto.replace(de, para);

  return texto.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
};

/** O nome sem o tipo da via na frente. */
const semTipo = (normalizado) => {
  for (const tipo of TIPOS) {
    if (normalizado.startsWith(`${tipo} `)) return normalizado.slice(tipo.length + 1);
  }
  return normalizado;
};

const CORPO = 'way["highway"]["name"]';

export const buildOverpassQuery = ({ sul, oeste, norte, leste }) =>
  `[out:json][timeout:60];\n${CORPO}(${sul},${oeste},${norte},${leste});\nout geom;`;

export const buildOverpassQueryAround = ({ lat, lng, raio = 1500 }) =>
  `[out:json][timeout:30];\n${CORPO}(around:${raio},${lat},${lng});\nout geom;`;

/**
 * As vias da resposta, com as coordenadas em [lng, lat].
 *
 * A ordem é a do GeoJSON e a do PostGIS, não a do Leaflet — a inversão para
 * [lat, lng] acontece só na hora de desenhar, num lugar só.
 */
export const parseOverpassWays = (json) => {
  const elements = Array.isArray(json?.elements) ? json.elements : [];
  return elements.flatMap((el) => {
    if (el?.type !== 'way') return [];
    const nome = String(el?.tags?.name || '').trim();
    const geometry = Array.isArray(el?.geometry) ? el.geometry : [];
    if (!nome || geometry.length === 0) return [];
    const coords = geometry
      .filter((p) => Number.isFinite(p?.lat) && Number.isFinite(p?.lon))
      .map((p) => [p.lon, p.lat]);
    if (coords.length === 0) return [];
    return [{ nome, coords }];
  });
};

/** Distância aproximada, em metros, de um ponto até a via. */
const distanciaAteAVia = (ponto, coords) => {
  let menor = Infinity;
  for (const [lng, lat] of coords) {
    const dLat = (lat - ponto.lat) * METROS_POR_GRAU;
    const dLng = (lng - ponto.lng) * METROS_POR_GRAU * Math.cos((ponto.lat * Math.PI) / 180);
    const d = Math.sqrt(dLat * dLat + dLng * dLng);
    if (d < menor) menor = d;
  }
  return menor;
};

/**
 * As linhas do traçado de uma rua. Lista vazia quando não casou.
 *
 * A guarda dos 2 km resolve o homônimo sem nenhuma heurística: duas "Rua São
 * João" na mesma cidade, e a coordenada já cadastrada diz qual delas é.
 *
 * Rua sem coordenada não casa nada — sem a guarda, o casamento vira aposta.
 */
export const casarTracado = (rua, ways) => {
  const ponto = rua?.location;
  if (!ponto || !Number.isFinite(ponto.lat) || !Number.isFinite(ponto.lng)) return [];

  const alvo = normalizarNomeDeRua(rua?.name);
  if (!alvo) return [];
  const alvoSemTipo = semTipo(alvo);

  const perto = (way) => distanciaAteAVia(ponto, way.coords) <= RAIO_DE_CONFIANCA_M;

  const exatas = (ways || []).filter((w) => normalizarNomeDeRua(w.nome) === alvo && perto(w));
  if (exatas.length > 0) return exatas.map((w) => w.coords);

  const porNome = (ways || []).filter(
    (w) => semTipo(normalizarNomeDeRua(w.nome)) === alvoSemTipo && perto(w)
  );
  return porNome.map((w) => w.coords);
};

/** WKT do traçado, ou null quando não há linha utilizável. */
export const toMultiLineStringWkt = (linhas) => {
  // Reta de um ponto não existe: o PostGIS aceita, e o resultado é invisível no
  // mapa — pior que não ter traçado, porque o fallback do ponto não roda.
  const uteis = (linhas || []).filter((l) => Array.isArray(l) && l.length >= 2);
  if (uteis.length === 0) return null;

  const grupos = uteis
    .map((linha) => `(${linha.map(([lng, lat]) => `${lng} ${lat}`).join(',')})`)
    .join(',');
  return `MULTILINESTRING(${grupos})`;
};

/**
 * A coordenada da rua, venha ela na forma que vier.
 *
 * O BANCO E A TELA NÃO CONCORDAM SOBRE O FORMATO
 *
 * `location` sai do banco como GeoJSON do PostGIS — `{ coordinates: [lng, lat] }`
 * — mas o mapa e a página da rua já convertem para `{ lat, lng }` antes de
 * desenhar, que é o que o Leaflet lê. Quem lê a rua não deveria ter que saber
 * qual das duas telas a entregou.
 *
 * Aceitar só número, e não `Number(...)` de qualquer coisa: um texto que
 * chegasse aqui por engano seria coagido a um número plausível e o pino
 * apareceria no lugar errado sem nenhum aviso. `Number.isFinite` rejeita string,
 * `undefined` e GeoJSON truncado do mesmo jeito — todos viram `null`, que é um
 * estado que a tela sabe desenhar vazio, em vez de um pino fantasma.
 */
export const coordenadaDaRua = (location) => {
  if (!location) return null;
  if (Array.isArray(location.coordinates)) {
    const [lng, lat] = location.coordinates;
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if (Number.isFinite(location.lat) && Number.isFinite(location.lng)) {
    return { lat: location.lat, lng: location.lng };
  }
  return null;
};

/** A bbox que cobre as ruas com ponto cadastrado, com folga em graus. */
export const bboxDasRuas = (streets, folga = 0.02) => {
  const pontos = (streets || [])
    .map((s) => s?.location)
    .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng));
  if (pontos.length === 0) return null;

  const lats = pontos.map((p) => p.lat);
  const lngs = pontos.map((p) => p.lng);
  return {
    sul: Math.min(...lats) - folga,
    norte: Math.max(...lats) + folga,
    oeste: Math.min(...lngs) - folga,
    leste: Math.max(...lngs) + folga,
  };
};

/**
 * Chama o Overpass e devolve as vias já lidas.
 *
 * Erro nomeado, e não genérico: o Overpass é gratuito e mantido por doação, e
 * 429 significa "espere", não "quebrou". Quem lê a mensagem precisa saber a
 * diferença para decidir se tenta de novo.
 */
export const buscarVias = async (query) => {
  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
    body: query,
  });

  if (res.status === 429) {
    throw new Error('O OpenStreetMap está limitando as consultas agora. Tente de novo em alguns minutos.');
  }
  if (res.status === 504) {
    throw new Error('A consulta ao OpenStreetMap demorou demais. Tente de novo em alguns minutos.');
  }
  if (!res.ok) {
    throw new Error(`O OpenStreetMap respondeu ${res.status}. Tente de novo mais tarde.`);
  }

  return parseOverpassWays(await res.json());
};
