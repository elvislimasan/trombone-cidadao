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

export const TILE_LIGHT = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  subdomains: 'abc',
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
};

export const TILE_DARK = {
  url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
  subdomains: 'abcd',
  maxZoom: 20,
  attribution:
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
};

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
