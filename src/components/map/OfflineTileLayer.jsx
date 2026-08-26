import { useEffect } from 'react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

import { useTheme } from '@/design-system/theme/ThemeProvider';
import { fonteDeTiles, montarUrlDeTile } from './tileSources';
import { tileDoCache, guardarTile } from '@/lib/tileCache';

// Camada de tiles que lê do cache ANTES da rede.
//
// Não é o ThemedTileLayer com um fallback: a ordem está invertida de propósito.
// Quem chega a esta camada está no modal de registro da patrulha, parado na
// calçada, com o sinal oscilando — ali o tile guardado há dois minutos vale
// mais que uma requisição que pode demorar dez segundos para falhar. Rua não
// muda de lugar; o custo de mostrar um tile de ontem é zero.
//
// Fora da patrulha o mapa continua usando o ThemedTileLayer normal. Trocar
// `img.src` por fetch + blob custa uma volta a mais por tile, e num mapa de
// tela cheia com dezenas deles isso apareceria.

const CamadaOffline = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('img');
    tile.alt = '';
    // Sem isto o Leaflet não consegue desenhar o tile em canvas nem medir
    // corretamente imagens vindas de blob em alguns WebViews.
    tile.setAttribute('role', 'presentation');

    const tema = this.options.temaDoCache;
    const fonte = fonteDeTiles(tema);
    // `coords.z` cru, e não `_getZoomForUrl()`: é o mesmo número que o
    // prefetch usa para montar a chave, e nenhuma camada do app mexe em
    // zoomOffset/zoomReverse, que é o único caso em que os dois divergem.
    const chave = { z: coords.z, x: coords.x, y: coords.y };

    let encerrado = false;
    const mostrar = async (resposta) => {
      const blob = await resposta.blob();
      if (encerrado) return;
      const objectUrl = URL.createObjectURL(blob);
      // Guardado no nó para o 'tileunload' devolver a memória: sem revoke, uma
      // patrulha de meia hora deixa centenas de blobs presos no processo.
      tile._objectUrl = objectUrl;
      tile.src = objectUrl;
    };

    (async () => {
      const doCache = await tileDoCache(tema, chave);
      if (doCache) {
        await mostrar(doCache);
        return;
      }

      try {
        const r = await fetch(montarUrlDeTile(fonte, chave), { mode: 'cors' });
        if (!r.ok) throw new Error(String(r.status));
        // Clone antes de consumir: o corpo de uma Response só se lê uma vez, e
        // os dois destinos — a tela e o cache — precisam dele inteiro.
        guardarTile(tema, chave, r.clone());
        await mostrar(r);
      } catch {
        if (encerrado) return;
        // Sem rede e sem cache: o Leaflet marca o tile como falho e deixa o
        // fundo do mapa aparecer, em vez de pendurar um <img> quebrado.
        done(new Error('tile indisponivel'), tile);
      }
    })();

    tile.onload = () => { encerrado = true; done(null, tile); };
    tile.onerror = () => { encerrado = true; done(new Error('tile'), tile); };

    return tile;
  },

  onRemove(map) {
    // O 'tileunload' cobre o descarte durante a navegação; a remoção da camada
    // inteira (fechar o modal) não passa por ele em todos os caminhos.
    Object.values(this._tiles || {}).forEach(({ el }) => {
      if (el?._objectUrl) URL.revokeObjectURL(el._objectUrl);
    });
    return L.TileLayer.prototype.onRemove.call(this, map);
  },
});

/**
 * @param {object} props
 * @param {number} [props.maxZoom]
 */
export default function OfflineTileLayer({ maxZoom }) {
  const map = useMap();
  const { resolved } = useTheme();

  useEffect(() => {
    const fonte = fonteDeTiles(resolved);
    const camada = new CamadaOffline(fonte.url, {
      attribution: fonte.attribution,
      subdomains: fonte.subdomains,
      maxZoom: maxZoom ?? fonte.maxZoom ?? 19,
      // O escuro é o mesmo OSM invertido em CSS: a classe vai no contêiner da
      // camada, e só nele. Ver o cabeçalho de tileSources.js.
      className: fonte.classe,
      temaDoCache: resolved,
    });

    camada.on('tileunload', (e) => {
      if (e.tile?._objectUrl) URL.revokeObjectURL(e.tile._objectUrl);
    });

    camada.addTo(map);
    return () => { camada.remove(); };
  }, [map, resolved, maxZoom]);

  return null;
}
