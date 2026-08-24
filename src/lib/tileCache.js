// Caminho relativo, e não o alias `@/`: assim o arquivo importa igual no Vite e
// no `node --test`, que é onde a matemática dos tiles é verificada.
import { fonteDeTiles, montarUrlDeTile } from '../components/map/tileSources.js';

// Mapa que sobrevive à queda do sinal.
//
// O PROBLEMA
//
// Quem patrulha registra a bronca onde o problema está — e é justamente onde a
// rede costuma faltar. O modal de registro abria o Leaflet num retângulo cinza:
// sem tiles, o pino não tinha o que ajustar, e a tela mais importante do fluxo
// virava um formulário com um buraco no meio.
//
// Não bastava esperar do cache do navegador. O service worker do app IGNORA
// `openstreetmap.org` de propósito (public/sw.js), e o filtro `type === 'basic'`
// que ele aplica descartaria tile de outra origem mesmo se não ignorasse. Nada
// era guardado, nunca.
//
// COMO FUNCIONA
//
// Enquanto há rede, a patrulha baixa de véspera os tiles ao redor da posição
// (usePatrolTilePrefetch) e os guarda aqui. O OfflineTileLayer lê deste cache
// ANTES de tentar a rede — não é fallback, é a fonte primária: rua não muda de
// lugar, e ler do disco é mais rápido que ir ao espelho do OSM.
//
// A CHAVE NÃO É A URL DO TILE
//
// É uma url sintética, `https://tiles.local/<tema>/<z>/<x>/<y>.png`. A url real
// carrega o subdomínio sorteado (`a.`, `b.`, `c.`) e o sufixo retina, que variam
// entre quem grava e quem lê — indexar por ela produziria falha de cache
// silenciosa em parte dos tiles. Aqui as coordenadas são a identidade, que é o
// que elas realmente são.
//
// O HOST FANTASMA EXISTE POR CAUSA DO iOS
//
// A chave seria um caminho relativo, o que é mais simples de ler. Só que caminho
// relativo resolve contra a origem da página, e no iOS a origem é
// `capacitor://localhost` (o Android usa `https://localhost`, por
// `androidScheme` em capacitor.config.json). A especificação do Cache manda
// rejeitar com TypeError qualquer chave que não seja http(s) — o cache de tiles
// funcionaria no Android e falharia calado no iOS.
//
// `tiles.local` não é resolvido nem contatado por ninguém: só o Cache Storage
// olha para essa string, e para ele ela é um identificador.

const CACHE = 'trombone-tiles-v1';

/**
 * Teto de tiles guardados. 800 × ~12 KB ≈ 10 MB — abaixo do que qualquer
 * navegador reserva, e suficiente para o entorno de uma patrulha longa.
 *
 * Sem teto o cache cresce com a quilometragem acumulada de todas as patrulhas
 * já feitas, e o navegador acaba despejando o cache INTEIRO de uma vez quando
 * a cota estoura — o oposto do que este arquivo existe para garantir.
 */
const LIMITE_TILES = 800;

/** Zooms baixados de véspera: o da patrulha (18), um acima e um abaixo. */
const ZOOMS = [17, 18, 19];

/** Tiles de raio em cada zoom — 1 gera a grade 3×3 ao redor da posição. */
const RAIO_TILES = 1;

/** Quanto o usuário precisa andar para valer um novo lote. */
export const DESLOCAMENTO_PREFETCH_M = 100;

const suportado = () =>
  typeof caches !== 'undefined' && typeof fetch !== 'undefined';

/** Longitude → coluna do tile, no esquema Web Mercator do OSM. */
export const tileX = (lng, z) => Math.floor(((lng + 180) / 360) * 2 ** z);

/** Latitude → linha do tile. */
export const tileY = (lat, z) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z
  );
};

export const chaveDoTile = (tema, { z, x, y }) =>
  `https://tiles.local/${tema === 'dark' ? 'dark' : 'light'}/${z}/${x}/${y}.png`;

/** O tile guardado, ou `null`. Nunca levanta: sem cache o mapa só usa a rede. */
export async function tileDoCache(tema, coords) {
  if (!suportado()) return null;
  try {
    const cache = await caches.open(CACHE);
    return (await cache.match(chaveDoTile(tema, coords))) || null;
  } catch {
    return null;
  }
}

/** Guarda a resposta. Recebe um clone — quem chamou ainda precisa do corpo. */
export async function guardarTile(tema, coords, resposta) {
  if (!suportado() || !resposta || !resposta.ok) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(chaveDoTile(tema, coords), resposta);
  } catch {
    // Cota estourada, modo privado, resposta opaca — nenhum deles é motivo
    // para atrapalhar o desenho do tile que já está na tela.
  }
}

/**
 * Descarta os mais antigos quando passa do teto.
 *
 * `cache.keys()` devolve na ordem de inserção, então o começo da lista é o que
 * há de mais velho — LRU aproximado, sem tabela de acesso paralela.
 */
async function aparar() {
  if (!suportado()) return;
  try {
    const cache = await caches.open(CACHE);
    const chaves = await cache.keys();
    const sobrando = chaves.length - LIMITE_TILES;
    if (sobrando <= 0) return;
    await Promise.all(chaves.slice(0, sobrando).map((k) => cache.delete(k)));
  } catch {}
}

/**
 * Baixa e guarda a vizinhança da posição, nos três zooms.
 *
 * Só busca o que ainda não está guardado: em movimento as grades consecutivas
 * se sobrepõem quase inteiras, e sem essa checagem o mesmo tile seria rebaixado
 * a cada cem metros.
 *
 * @param {{lat:number,lng:number}} posicao
 * @param {{tema?: string}} [opts]
 * @returns {Promise<number>} quantos tiles NOVOS entraram no cache
 */
export async function prefetchAoRedor(posicao, { tema = 'light' } = {}) {
  if (!suportado() || !posicao) return 0;

  const fonte = fonteDeTiles(tema);
  const alvos = [];

  for (const z of ZOOMS) {
    const cx = tileX(posicao.lng, z);
    const cy = tileY(posicao.lat, z);
    const max = 2 ** z;
    for (let dx = -RAIO_TILES; dx <= RAIO_TILES; dx++) {
      for (let dy = -RAIO_TILES; dy <= RAIO_TILES; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        // Fora do mundo: acontece nos polos e na borda da antimeridiana.
        if (y < 0 || y >= max) continue;
        alvos.push({ z, x: ((x % max) + max) % max, y });
      }
    }
  }

  let cache;
  try {
    cache = await caches.open(CACHE);
  } catch {
    return 0;
  }

  let novos = 0;

  // Serial de propósito. São 27 tiles por lote, e quem está patrulhando divide
  // a conexão com o envio de fotos e com o corredor de broncas — disparar tudo
  // de uma vez faria o prefetch competir com o que o usuário está esperando.
  for (const coords of alvos) {
    const chave = chaveDoTile(tema, coords);
    try {
      if (await cache.match(chave)) continue;
      const r = await fetch(montarUrlDeTile(fonte, coords), { mode: 'cors' });
      if (!r.ok) continue;
      await cache.put(chave, r);
      novos++;
    } catch {
      // Sinal caiu no meio do lote: para por aqui e tenta no próximo
      // deslocamento. Insistir gastaria bateria numa fila que vai falhar toda.
      break;
    }
  }

  if (novos > 0) await aparar();
  return novos;
}

/** Quantos tiles estão guardados. Usado pela tela de armazenamento e por teste. */
export async function totalGuardado() {
  if (!suportado()) return 0;
  try {
    const cache = await caches.open(CACHE);
    return (await cache.keys()).length;
  } catch {
    return 0;
  }
}

/** Esvazia o cache de tiles. */
export async function limparTiles() {
  if (!suportado()) return;
  try {
    await caches.delete(CACHE);
  } catch {}
}
