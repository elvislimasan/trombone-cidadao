import { useEffect, useMemo, useRef } from 'react';
import { MapContainer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { patrolAvatarHtml, precarregarRenders } from '@/components/patrol/patrolAvatarMarkup';
import { FLORESTA_COORDS } from '@/config/mapConfig';
import 'leaflet/dist/leaflet.css';

// O mapa da Rota do Dia.
//
// POR QUE NÃO É O MapView COMPARTILHADO
//
// O `MapView` serve à consulta, à patrulha, à conferência e ao detalhe da
// bronca. Ele desenha pino por CATEGORIA e traço de RASTRO — duas coisas que a
// rota não quer: aqui o pino tem de dizer a ORDEM (1, 2, 3…), porque a ordem é
// a única informação que faz a pessoa andar na sequência certa, e o traço é o
// caminho A PERCORRER, não o já percorrido. Espremer isso em mais quatro props
// condicionais custaria mais ao MapView do que este arquivo inteiro custa.
//
// O que continua compartilhado é o que precisa ser igual em todo mapa do app: a
// camada de tiles (`ThemedTileLayer`), com o mesmo cache e o mesmo tratamento
// de tema escuro.
//
// O TRAÇO PONTILHADO É UMA AFIRMAÇÃO
//
// Trecho contínuo = caminho conferido nas ruas mapeadas. Pontilhado = reta
// entre duas paradas, porque a malha não cobre ali. Se os dois fossem iguais, a
// pessoa leria "atravesse por aqui" onde o app não sabe se dá para atravessar —
// ver o cabeçalho de `rotaTracada.js`.

/**
 * O pino numerado de uma parada.
 *
 * Em `divIcon` com SVG inline, e não imagem: é o mesmo motivo do pino do
 * `LocationPickerMap` — asset separado quebra offline, e cor de token não
 * sobrevive a um PNG. Aqui o número ainda tem de ser legível sobre o corpo do
 * pino nos dois temas, e `--text-on-brand` é exatamente o par contrastado de
 * `--brand`.
 */
const iconeDaParada = ({ ordem, estado }) => {
  const fundo =
    estado === 'concluida'
      ? 'rgb(var(--status-resolved-fg))'
      : estado === 'pulada'
        ? 'rgb(var(--text-tertiary))'
        : estado === 'ativa'
          ? 'rgb(var(--brand))'
          : 'rgb(var(--text-secondary))';

  const conteudo =
    estado === 'concluida'
      ? '<path d="M5 10.5l3.2 3.2L15 7" fill="none" stroke="rgb(var(--text-on-brand))" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>'
      : `<text x="10" y="14.2" text-anchor="middle" font-size="11" font-weight="800" fill="rgb(var(--text-on-brand))" font-family="system-ui, sans-serif">${ordem}</text>`;

  return L.divIcon({
    className: '',
    html: `
      <div style="width:28px;height:28px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.35));">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" width="28" height="28">
          <circle cx="10" cy="10" r="9" fill="${fundo}" stroke="rgb(var(--pin-ring))" stroke-width="2"/>
          ${conteudo}
        </svg>
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
};

/** Onde a pessoa está. Ponto, e não seta: sem rumo, seta aponta mentira. */
const iconeDaPosicao = ({ avatar, emMovimento }) => L.divIcon({
  className: 'patrol-nav-leaflet-icon',
  html: `
    <div class="patrol-nav-marker patrol-nav-marker--walking">
      ${patrolAvatarHtml('walking', {
        avatar,
        camera: 'costas',
        emMovimento,
        gpsAtivo: true,
        className: 'patrol-avatar-planted',
      })}
    </div>
  `,
  iconSize: [58, 58],
  iconAnchor: [29, 29],
});

/**
 * Enquadra o percurso inteiro — uma vez.
 *
 * `assinatura` é o que autoriza reenquadrar: a rota é remontada a cada leitura
 * de GPS, e reenquadrar a cada uma arrancaria o mapa da mão de quem acabou de
 * arrastar para olhar a próxima esquina.
 */
const Enquadrar = ({ pontos, assinatura }) => {
  const map = useMap();
  const feito = useRef(null);

  useEffect(() => {
    if (feito.current === assinatura) return;
    if (!pontos || pontos.length === 0) return;

    feito.current = assinatura;
    const bounds = L.latLngBounds(pontos.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 17 });
  }, [map, pontos, assinatura]);

  return null;
};

/** Expõe o mapa para o botão de recentrar, que vive fora do MapContainer. */
const Publicar = ({ mapaRef }) => {
  const map = useMap();
  mapaRef.current = map;
  return null;
};

const RotaMapa = ({
  trechos = [],
  paradas = [],
  posicao = null,
  ativaId = null,
  concluidas = [],
  puladas = [],
  avatar = null,
  onParadaClick,
  mapaRef,
}) => {
  const interno = useRef(null);
  const ref = mapaRef || interno;

  const centro = posicao
    ? [posicao.lat, posicao.lng]
    : paradas[0]
      ? [paradas[0].lat, paradas[0].lng]
      : FLORESTA_COORDS;

  // O enquadramento acontece quando MUDA O PERCURSO — não quando muda a
  // posição. A assinatura é a lista de paradas na ordem: ela só muda quando a
  // rota é outra.
  const assinatura = useMemo(() => paradas.map((p) => p.id).join('|'), [paradas]);

  useEffect(() => {
    precarregarRenders(avatar);
  }, [avatar]);

  const iconePosicao = useMemo(
    () => iconeDaPosicao({ avatar, emMovimento: Boolean(posicao?.emMovimento) }),
    [avatar, posicao?.emMovimento]
  );

  const pontosDoEnquadre = useMemo(
    () => [...(posicao ? [posicao] : []), ...paradas],
    [posicao, paradas]
  );

  const estadoDaParada = (parada) => {
    if (concluidas.includes(String(parada.id))) return 'concluida';
    if (puladas.includes(String(parada.id))) return 'pulada';
    return String(parada.id) === String(ativaId) ? 'ativa' : 'pendente';
  };

  return (
    <MapContainer
      center={centro}
      zoom={16}
      zoomControl={false}
      attributionControl={false}
      className="w-full h-full"
      style={{ background: 'rgb(var(--surface-sunken))' }}
    >
      <ThemedTileLayer />
      <Publicar mapaRef={ref} />
      <Enquadrar pontos={pontosDoEnquadre} assinatura={assinatura} />

      {trechos.map((trecho, i) => (
        <Polyline
          key={`trecho-${i}`}
          positions={trecho.pontos.map((p) => [p.lat, p.lng])}
          pathOptions={{
            color: 'rgb(var(--brand))',
            weight: trecho.tipo === 'ruas' ? 5 : 3,
            opacity: trecho.tipo === 'ruas' ? 0.85 : 0.55,
            dashArray: trecho.tipo === 'ruas' ? null : '6 8',
            lineCap: 'round',
            lineJoin: 'round',
          }}
        />
      ))}

      {paradas.map((parada) => (
        <Marker
          key={parada.id}
          position={[parada.lat, parada.lng]}
          icon={iconeDaParada({ ordem: parada.ordem, estado: estadoDaParada(parada) })}
          eventHandlers={onParadaClick ? { click: () => onParadaClick(parada) } : undefined}
        />
      ))}

      {posicao && (
        <Marker
          position={[posicao.lat, posicao.lng]}
          icon={iconePosicao}
          zIndexOffset={1000}
        />
      )}
    </MapContainer>
  );
};

export default RotaMapa;
