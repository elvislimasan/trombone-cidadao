// As fontes de tiles do mapa, num lugar só.
//
// Estavam embutidas no ThemedTileLayer, que é componente React. O prefetch da
// patrulha precisa das MESMAS urls para baixar de véspera o que a camada vai
// pedir depois — e importar um componente só para ler duas strings obrigaria o
// hook a arrastar react-leaflet junto.
//
// Divergir aqui é o pior erro possível: o prefetch guardaria tiles que a camada
// nunca procura, e o mapa offline continuaria cinza sem nenhum sinal de que o
// download aconteceu.
//
// O TEMA ESCURO NÃO TEM MAIS UM SERVIDOR PRÓPRIO
//
// Ele usava o CARTO Dark Matter (`basemaps.cartocdn.com/dark_all`), que era
// gratuito e sem chave. A CARTO passou a exigir chave — e não recusando a
// requisição, o que seria fácil de detectar, mas ESTAMPANDO "API KEY REQUIRED"
// dentro do PNG. O HTTP continuava 200, o tile continuava chegando, e o mapa
// escuro do app ficou coberto de marca d'água.
//
// As alternativas sem chave foram medidas antes da troca:
//
//   - ArcGIS Dark Gray Canvas (mesmo servidor do satélite que já usamos): sem
//     marca d'água, mas sem cobertura em zoom de rua no interior — devolve um
//     tile CLARO dizendo "Map data not yet available", que num mapa escuro lê
//     como falha. Inaceitável para uma patrulha, que vive em z17-19.
//   - Stadia, MapTiler, Mapbox: todos com chave.
//
// Sobrou o caminho que não depende de fornecedor nenhum: o MESMO OSM do tema
// claro, escurecido no navegador. O par `invert` + `hue-rotate(180deg)` inverte
// a luminosidade preservando o matiz — sem o segundo, parque verde vira rosa e
// água azul vira laranja.
//
// De quebra, os dois temas passaram a compartilhar bytes: o cache offline e o
// prefetch da patrulha baixam um conjunto de tiles em vez de dois.

const OSM = {
  // `id` é a identidade no cache. Como os dois temas agora saem da mesma
  // fonte, ele é o que evita guardar o mesmo tile duas vezes.
  id: 'osm',
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  subdomains: 'abc',
  maxZoom: 19,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export const TILE_LIGHT = OSM;

// `classe` é aplicada no contêiner da camada, e só nele: os pinos e o traçado
// da patrulha vivem em outro `pane` do Leaflet e continuam com a cor original.
// Inverter os pinos junto apagaria justamente o que o mapa existe para mostrar.
export const TILE_DARK = { ...OSM, classe: 'map-tiles--dark' };

/** A fonte do tema resolvido ('dark' | 'light'). */
export const fonteDeTiles = (tema) => (tema === 'dark' ? TILE_DARK : TILE_LIGHT);

/**
 * Expande o template numa url concreta.
 *
 * `{s}` gira pelo mesmo critério do Leaflet (`|x + y| % n`) para que a url do
 * prefetch caia no mesmo servidor que a camada pediria — não por exigência do
 * cache, que é indexado por z/x/y, mas para não dobrar a carga nos espelhos.
 *
 * `{r}` sai vazio: `detectRetina` fica desligado em todas as camadas do app, e
 * é o que o Leaflet põe ali nesse caso.
 */
export const montarUrlDeTile = (fonte, { z, x, y }) => {
  const subs = fonte.subdomains || 'abc';
  const s = subs[Math.abs(x + y) % subs.length];
  return fonte.url
    .replace('{s}', s)
    .replace('{z}', String(z))
    .replace('{x}', String(x))
    .replace('{y}', String(y))
    .replace('{r}', '');
};
