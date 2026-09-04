// Cache de tiles do mapa offline.
//   node --test src/test/tileCache.test.mjs
//
// O que se testa aqui é a IDENTIDADE do tile: as coordenadas derivadas de
// lat/lng e a chave montada a partir delas. É a única parte que pode errar em
// silêncio — um off-by-one na conta de Mercator faz o prefetch guardar a
// quadra vizinha, e o mapa continua cinza sem nenhum erro no console.
//
// O Cache Storage em si não é simulado: ele não existe no Node, e as funções
// que o usam já devolvem vazio nesse caso, de propósito.

import test from 'node:test';
import assert from 'node:assert/strict';

import { tileX, tileY, chaveDoTile } from '../lib/tileCache.js';
import { fonteDeTiles, montarUrlDeTile, TILE_DARK } from '../components/map/tileSources.js';

// Floresta-PE, onde o app nasceu.
const FLORESTA = { lat: -7.8567, lng: -38.5687 };

test('lat/lng viram a coluna e a linha do tile no zoom pedido', () => {
  // Conferido contra a fórmula canônica do OSM (slippy map tilenames).
  assert.equal(tileX(FLORESTA.lng, 18), 102987);
  assert.equal(tileY(FLORESTA.lat, 18), 136811);
});

test('cada zoom a mais dobra a grade', () => {
  for (const z of [10, 14, 18]) {
    assert.equal(tileX(FLORESTA.lng, z + 1) >> 1, tileX(FLORESTA.lng, z));
    assert.equal(tileY(FLORESTA.lat, z + 1) >> 1, tileY(FLORESTA.lat, z));
  }
});

test('o meridiano de Greenwich no equador cai na junção central da grade', () => {
  assert.equal(tileX(0, 1), 1);
  assert.equal(tileY(0, 1), 1);
});

// A CHAVE SEGUE A FONTE, E OS DOIS TEMAS AGORA DIVIDEM UMA
//
// Ela separava por tema, quando cada um tinha servidor proprio. O escuro passou
// a ser o MESMO OSM invertido em CSS, e guardar por tema faria o mesmo tile
// ocupar duas entradas — e o prefetch da patrulha baixar a cidade duas vezes,
// num aparelho no meio da rua.
//
// Se um dia o escuro voltar a ter servidor proprio, este teste falha, e falha
// no lugar certo: a chave precisa voltar a separar junto.
test('os dois temas dividem a chave enquanto dividem a fonte', () => {
  const coords = { z: 18, x: 102987, y: 136811 };
  const claro = chaveDoTile('light', coords);
  const escuro = chaveDoTile('dark', coords);

  assert.equal(fonteDeTiles('light').url, fonteDeTiles('dark').url);
  assert.equal(claro, escuro);
  assert.equal(claro, 'https://tiles.local/osm/18/102987/136811.png');
});

// O escuro nao pode virar um segundo pedido de rede: a diferenca dele e uma
// classe de CSS aplicada no conteiner da camada.
test('o tema escuro se distingue por classe, nao por url', () => {
  assert.equal(TILE_DARK.classe, 'map-tiles--dark');
  assert.equal(fonteDeTiles('light').classe, undefined);
});

test('a chave é http(s) absoluta, e não um caminho relativo', () => {
  // Não é preciosismo de formato: no iOS a origem da página é
  // `capacitor://localhost`, um caminho relativo resolveria para lá, e o Cache
  // rejeita com TypeError toda chave fora de http(s). Ver o cabeçalho do módulo.
  const chave = chaveDoTile('light', { z: 18, x: 102987, y: 136811 });
  assert.equal(new URL(chave).protocol, 'https:');
});

test('tema desconhecido cai no claro, que é o padrão do app', () => {
  const coords = { z: 5, x: 1, y: 2 };
  assert.equal(chaveDoTile(undefined, coords), chaveDoTile('light', coords));
});

test('a url do tile não deixa nenhum marcador do template para trás', () => {
  // Marcador que sobra vira 404 em todo tile do tema — que e justamente o que
  // ninguem olha, porque o mapa so fica cinza.
  const url = montarUrlDeTile(TILE_DARK, { z: 18, x: 102987, y: 136811 });
  assert.match(url, /^https:\/\/[a-c]\.tile\.openstreetmap\.org\/18\/102987\/136811\.png$/);
  assert.ok(!url.includes('{'), `sobrou marcador na url: ${url}`);
});

test('o subdomínio é estável: a mesma coordenada sempre pede ao mesmo espelho', () => {
  const coords = { z: 18, x: 102987, y: 136811 };
  const fonte = fonteDeTiles('light');
  assert.equal(montarUrlDeTile(fonte, coords), montarUrlDeTile(fonte, coords));
});

test('o subdomínio sai da lista da fonte, não de uma fixa', () => {
  const claro = new URL(montarUrlDeTile(fonteDeTiles('light'), { z: 3, x: 4, y: 5 }));
  const escuro = new URL(montarUrlDeTile(fonteDeTiles('dark'), { z: 3, x: 4, y: 5 }));

  assert.ok(fonteDeTiles('light').subdomains.includes(claro.hostname[0]));
  assert.ok(fonteDeTiles('dark').subdomains.includes(escuro.hostname[0]));
});
