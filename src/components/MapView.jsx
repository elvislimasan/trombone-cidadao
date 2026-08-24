import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import {
  MapContainer,

  Marker,
  Popup,
  useMap,
  Circle,
  Polyline,
} from "react-leaflet";
import {
  ThumbsUp,
  Calendar,
  LocateFixed,
  Megaphone,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/SupabaseAuthContext";
import L from "leaflet";
import { FLORESTA_COORDS, INITIAL_ZOOM } from "@/config/mapConfig";
import { useMapScrollLock } from "@/hooks/useMapScrollLock";
import { useMapModeToggle } from "@/contexts/MapModeContext";
import MapModeToggle from "@/components/MapModeToggle";
import { createPinIcon } from "@/components/map/pinIcon";
import { panParaOffsetDeTela } from "@/lib/navGeo";

// Nivel de zoom ao enquadrar o usuario - na abertura da tela e no botao de
// recentrar. Os dois usavam valores diferentes (16 e 17): o mapa abria mais
// afastado do que ficava depois de tocar no botao.
const USER_ZOOM = 18;

// Zoom coerente com a precisao da leitura de GPS. Abrir sempre no maximo sobre
// uma posicao com centenas de metros de erro (tipico de localizacao por
// Wi-Fi/rede) mostra a quadra errada com aparencia de certeza; melhor abrir um
// pouco mais afastado e deixar o usuario aproximar. Com GPS bom, abre bem
// proximo, no nivel de reconhecer a propria rua.
const zoomParaPrecisao = (accuracy) => {
  const m = Number(accuracy);
  if (!Number.isFinite(m) || m <= 0) return USER_ZOOM;
  if (m <= 50) return USER_ZOOM;   // GPS de satelite: rua, bem proximo
  if (m <= 150) return 17;         // rua/quarteirao
  if (m <= 500) return 16;         // entorno
  return 15;                       // so da para afirmar o bairro
};

// A legenda usa os mesmos tokens do corpo do pin, entao as bolinhas e os pins
// nunca divergem de cor. Agora lista categorias, nao status: e a categoria que
// define a cor no mapa.
// Legenda por STATUS, que e o que a cor do pin diz. A categoria aparece no
// emoji dentro do disco e nos chips de filtro, entao nao precisa de legenda.
const LEGEND_STATUSES = [
  { id: "pending", token: "--pin-pending-bg", label: "Pendente" },
  { id: "in-progress", token: "--pin-progress-bg", label: "Em Andamento" },
  { id: "resolved", token: "--pin-resolved-bg", label: "Resolvido" },
];

// Ponto "voce esta aqui". Os tokens resolvem no proprio no, entao a constante
// de modulo continua valendo para os dois temas.
const userMarkerIcon = L.divIcon({
  html: `
    <div style="
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: rgb(var(--pin-user-bg));
      border: 3px solid rgb(var(--pin-ring));
      box-shadow: 0 6px 14px rgba(0, 0, 0, 0.35);
    "></div>
  `,
  className: "user-leaflet-icon",
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

// ── Modo navegação ────────────────────────────────────────────────────────────

// Zoom de navegação: perto o bastante para reconhecer a esquina que vem.
const NAV_ZOOM = 18;

// A seta fica abaixo do centro, para sobrar tela na direção do movimento — é a
// via à frente que interessa, não a que já ficou para trás. Fração da altura
// VISÍVEL, não a do container ampliado.
const NAV_OFFSET_TELA = 0.16;

// Marcador de navegação: seta, não bolinha. Ela aponta sempre para cima porque
// o mapa inteiro é que gira sob ela.
const navMarkerIcon = L.divIcon({
  html: `
    <div style="width:46px;height:46px;display:flex;align-items:center;justify-content:center;">
      <svg width="34" height="34" viewBox="0 0 24 24" style="filter: drop-shadow(0 3px 6px rgba(0,0,0,0.45));">
        <path d="M12 2 L20.5 21 L12 16.5 L3.5 21 Z"
              fill="rgb(var(--pin-user-bg))"
              stroke="rgb(var(--pin-ring))"
              stroke-width="1.6"
              stroke-linejoin="round" />
      </svg>
    </div>
  `,
  className: 'nav-leaflet-icon',
  iconSize: [46, 46],
  iconAnchor: [23, 23],
});

// Missao: sinal que alguem deixou e que ainda espera cadastro completo.
//
// Contorno tracejado, e nao um pin cheio como o das broncas. A diferenca e
// semantica, nao decorativa: uma bronca e um problema JA documentado, com foto
// e revisao; uma missao e a palavra de quem passou por ali. Desenhar as duas
// iguais faria o mapa afirmar sobre a missao mais do que se sabe.
//
// O CORPO E VERMELHO, E E ELE QUE AVISA
//
// Era azul translucido, e o pin sumia no mapa. Isso importava pouco enquanto o
// aviso de "sinalizado" era um toast — e passou a importar quando o toast saiu:
// o pin virou a UNICA confirmacao de que a marcacao pegou. Ele precisa ser
// achavel de relance, com o celular no suporte e o carro andando.
const missionMarkerIcon = L.divIcon({
  html: `
    <div style="width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
      <div style="
        width:26px;height:26px;border-radius:999px;
        border:2.5px dashed rgb(var(--pin-ring));
        background: rgb(var(--pin-signal-bg));
        color: rgb(var(--pin-signal-fg));
        display:flex;align-items:center;justify-content:center;
        font-size:13px;line-height:1;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
      ">🚩</div>
    </div>
  `,
  className: 'mission-leaflet-icon',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

// Mantém o mapa colado no usuário. Fora do MapView porque precisa do useMap.
const NavFollow = ({ posicao, offsetPx, lado }) => {
  const map = useMap();

  useEffect(() => {
    if (!posicao) return;
    try {
      map.setView([posicao.lat, posicao.lng], NAV_ZOOM, { animate: false });
      // O deslocamento precisa ser contra-rotacionado: o Leaflet trabalha no
      // espaço não girado, e um "para baixo" cru vira "para a lateral" assim
      // que o rumo sai do norte — foi assim que a seta sumiu da tela.
      const pan = panParaOffsetDeTela(offsetPx, posicao.heading);
      if (pan.x || pan.y) map.panBy([pan.x, pan.y], { animate: false });
    } catch {}
  // O rumo entra aqui porque o vetor do deslocamento depende dele; a posição
  // inteira não, senão precisão e timestamp reposicionariam o mapa sem que o
  // usuário tivesse saído do lugar.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, posicao?.lat, posicao?.lng, posicao?.heading, offsetPx]);

  // O container muda de tamanho ao entrar no modo e quando a tela é medida;
  // sem isto o Leaflet segue usando as dimensões antigas e o centro sai do
  // lugar.
  useEffect(() => {
    const t = setTimeout(() => { try { map.invalidateSize(); } catch {} }, 60);
    return () => clearTimeout(t);
  }, [map, lado]);

  return null;
};

/**
 * Ângulo contínuo para animar o giro.
 *
 * Interpolar de 350° para 10° pelo caminho numérico gira 340° para o lado
 * errado — o mapa dá um rodopio a cada volta completa. Acumulando o menor delta
 * a cada leitura, o valor cresce/decresce sem saltos e o CSS anima o caminho
 * curto.
 */
const useAnguloContinuo = (heading) => {
  const acumuladoRef = useRef(0);
  const anteriorRef = useRef(null);

  if (Number.isFinite(heading)) {
    if (anteriorRef.current == null) {
      acumuladoRef.current = heading;
    } else {
      let delta = heading - anteriorRef.current;
      while (delta > 180) delta -= 360;
      while (delta < -180) delta += 360;
      acumuladoRef.current += delta;
    }
    anteriorRef.current = heading;
  }

  return acumuladoRef.current;
};

const ClusterZoomHandler = ({ clusterToZoom, onZoomComplete }) => {
  const map = useMap();

  useEffect(() => {
    if (!clusterToZoom) return;

    const { bounds, lat, lng } = clusterToZoom;

    // Enquadra a extensao real do cluster. O comportamento antigo era zoom fixo
    // (+3) no centroide: como cada nivel corta a area pela metade, tres niveis
    // encolhiam a vista 8x e a maioria das broncas agregadas ficava fora - um
    // pin marcado "20" abria mostrando 2. Com os limites, o que estava no pin e
    // exatamente o que aparece depois do clique.
    const zoomAtual = map.getZoom?.() ?? 4;
    const aproximar = () =>
      map.setView([lat, lng], Math.min(zoomAtual + 2, 18), { animate: true });

    if (bounds) {
      const alturaGraus = Math.abs(bounds.maxLat - bounds.minLat);
      const larguraGraus = Math.abs(bounds.maxLng - bounds.minLng);
      // Broncas praticamente na mesma coordenada (mesma esquina, mesmo poste):
      // o retangulo tem area ~zero e fitBounds nao tem o que enquadrar - o
      // clique nao fazia nada. Aproxima direto nesse caso.
      const degenerado = alturaGraus < 1e-6 && larguraGraus < 1e-6;

      if (!degenerado) {
        try {
          map.fitBounds(
            L.latLngBounds(
              [bounds.minLat, bounds.minLng],
              [bounds.maxLat, bounds.maxLng]
            ),
            { padding: [48, 48], maxZoom: 18, animate: true }
          );
          // fitBounds nao move quando o cluster ja esta enquadrado - dai a
          // sensacao de clique morto. Se o zoom nao mudou, aproxima na marra.
          const depois = map.getZoom?.() ?? zoomAtual;
          if (depois <= zoomAtual && zoomAtual < 18) aproximar();
          onZoomComplete?.();
          return;
        } catch {}
      }
    }

    // Sem limites (payload antigo) ou cluster degenerado: aproxima dois niveis.
    aproximar();
    onZoomComplete?.();
  }, [clusterToZoom, map, onZoomComplete]);

  return null;
};

const MapInstanceBinder = ({ onReady, onBoundsChange }) => {
  const map = useMap();
  useEffect(() => {
    onReady?.(map);
    try {
      const t0 = setTimeout(() => map.invalidateSize?.(), 0);
      const t1 = setTimeout(() => map.invalidateSize?.(), 250);
      map.whenReady?.(() => map.invalidateSize?.());
      return () => {
        clearTimeout(t0);
        clearTimeout(t1);
      };
    } catch {}
  }, [map, onReady]);

  useEffect(() => {
    if (!onBoundsChange) return;
    const emit = () => {
      try { onBoundsChange(map.getBounds(), map.getZoom()); } catch {}
    };
    map.on('moveend', emit);
    map.on('zoomend', emit);
    // emit initial bounds after map is ready
    map.whenReady?.(emit);
    return () => {
      map.off('moveend', emit);
      map.off('zoomend', emit);
    };
  }, [map, onBoundsChange]);

  return null;
};

const MapView = ({
  clusters,
  // Posicao do usuario ja conhecida por quem renderiza. Quando presente, o mapa
  // monta nela em vez de montar em Floresta e saltar quando o GPS responder.
  initialCenter = null,
  onReportClick,
  onUpvote,
  showLegend = true,
  showModeToggle = true,
  flyToTarget,
  interactive = true,
  onBoundsChange,
  onRecenter,
  // Quando fornecido, "Atualizar" abre o modal no proprio container (sem sair
  // do mapa). Sem essa prop, mantem o comportamento antigo de navegar para a
  // pagina da bronca com o modal aberto.
  onUpdateClick,
  // Modo navegacao: o mapa gira com o rumo, segue a posicao recebida de fora e
  // nao aceita toque. A posicao vem por prop de proposito - o modo navegacao ja
  // mantem seu proprio watchPosition, e um segundo aqui dobraria o consumo de
  // GPS por leituras identicas.
  navMode = false,
  navPosition = null,
  // Rastro percorrido na inspecao. Vive so em memoria de quem passa a prop -
  // nao e gravado em lugar nenhum.
  navTrail = null,
  // Missoes abertas no corredor. Chegam prontas do PatrolOverlay - o mapa nao
  // busca nada, so desenha.
  navMissoes = null,
  onNavMissaoClick = null,
}) => {
  const { mode } = useMapModeToggle();
  const navigate = useNavigate();
  const { user } = useAuth();
  const mapRef = useRef(null);
  // Ja montado no ponto certo quando initialCenter veio: marcar aqui evita que
  // o efeito de centralizacao repita o movimento assim que o watchPosition
  // devolver a primeira leitura.
  const hasCenteredRef = useRef(Boolean(initialCenter));
  const [userLocation, setUserLocation] = useState(null);
  const [clusterToZoom, setClusterToZoom] = useState(null);

  const recenterToUser = useCallback(() => {
    if (!interactive) return;
    if (!navigator.geolocation) return;
    const map = mapRef.current;

    const go = (loc) => {
      if (!map) return;
      const nextZoom = Math.max(map.getZoom?.() || INITIAL_ZOOM, USER_ZOOM);
      map.flyTo([loc.lat, loc.lng], nextZoom, { animate: true });
    };

    if (userLocation) {
      go(userLocation);
      onRecenter?.(userLocation);
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          };
          setUserLocation(next);
          go(next);
          onRecenter?.(next);
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch {}
  }, [interactive, userLocation, onRecenter]);

  useEffect(() => {
    if (!interactive) return;
    if (!navigator.geolocation) return;
    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch {}
  }, [interactive]);

  useEffect(() => {
    if (!interactive) return;
    if (!navigator.geolocation) return;
    let watchId = null;
    try {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setUserLocation({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          });
        },
        () => {},
        { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
      );
    } catch {}
    return () => {
      if (watchId != null) navigator.geolocation.clearWatch(watchId);
    };
  }, [interactive]);

  // Ao abrir a tela, enquadra a posicao do usuario no mesmo nivel do botao de
  // recentrar (USER_ZOOM). Estava em 16, que abria mostrando bairros inteiros -
  // longe demais para reconhecer a propria rua, e divergente do que o botao
  // fazia depois.
  useEffect(() => {
    const map = mapRef.current;
    if (!interactive || !map || !userLocation || hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    try {
      map.setView(
        [userLocation.lat, userLocation.lng],
        zoomParaPrecisao(userLocation.accuracy),
        { animate: false }
      );
    } catch {}
  }, [interactive, userLocation]);

  useEffect(() => {
    const map = mapRef.current;
    if (!interactive || !map || !flyToTarget) return;
    const lat = Number(flyToTarget.lat);
    const lng = Number(flyToTarget.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
    hasCenteredRef.current = true;
    try {
      map.flyTo([lat, lng], flyToTarget.zoom ?? 18, { animate: true });
    } catch {}
  }, [interactive, flyToTarget?.lat, flyToTarget?.lng, flyToTarget?.zoom, flyToTarget?.nonce]);

  const formatDate = (dateString) => {
    if (!dateString || isNaN(new Date(dateString))) return "Data inválida";
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  const handleClusterClick = useCallback((cluster) => {
    // Todo clique em cluster aproxima o zoom na área — o próximo fetch
    // (disparado por zoomend) traz um nível de agregação mais aberto ou pins individuais.
    //
    // O nonce faz cada clique ser um valor novo. Sem ele o efeito compara por
    // referencia e ignora o clique quando o objeto do cluster e o mesmo de
    // antes - clicar duas vezes no mesmo pin nao fazia nada na segunda.
    setClusterToZoom({ ...cluster, nonce: Date.now() });
  }, []);

  const handleZoomComplete = useCallback(() => {
    setClusterToZoom(null);
  }, []);

  const MapScrollLock = () => {
    useMapScrollLock(mode);
    useEffect(() => {}, [mode]);
    return null;
  };

  const createClusterIcon = (count) => {
    const size = count >= 50 ? 46 : count >= 10 ? 42 : 38;
    const level = count >= 50 ? "high" : count >= 10 ? "mid" : "low";
    // O no do divIcon fica sob documentElement, que carrega a classe .dark,
    // entao var(--...) herda e acompanha a troca de tema sozinho - sem precisar
    // do readToken nem de chave de cache por tema.
    const html = `
      <div style="
        background: rgb(var(--pin-cluster-${level}-bg));
        width: ${size}px;
        height: ${size}px;
        border-radius: 999px;
        border: 2px solid rgb(var(--pin-ring));
        color: rgb(var(--pin-cluster-${level}-fg));
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 800;
        font-size: 14px;
        box-shadow: 0 4px 8px rgba(0,0,0,0.18);
      ">${count}</div>
    `;
    return L.divIcon({
      html,
      className: "cluster-leaflet-icon",
      iconSize: [size, size],
      iconAnchor: [size / 2, size],
      popupAnchor: [0, -size],
    });
  };

  const anguloContinuo = useAnguloContinuo(navPosition?.heading);

  // Tamanho do container girado, medido da área visível.
  //
  // Precisa ser um QUADRADO de lado igual à diagonal da tela. Um retângulo
  // apenas ampliado não resolve: num celular em pé (400x800, digamos), ampliar
  // 45% dá 580x1160 — girado 90° isso vira 1160 de largura por 580 de altura, e
  // 580 não cobre os 800 de altura da tela. Apareceriam faixas vazias em cima e
  // embaixo justamente ao virar para leste ou oeste. A diagonal é o menor lado
  // que cobre a tela em QUALQUER ângulo.
  const areaRef = useRef(null);
  const [medidas, setMedidas] = useState(null);

  useEffect(() => {
    if (!navMode) return;
    const el = areaRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const medir = () => {
      const { width, height } = el.getBoundingClientRect();
      if (!width || !height) return;
      setMedidas({
        lado: Math.ceil(Math.hypot(width, height)),
        offsetPx: height * NAV_OFFSET_TELA,
      });
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [navMode]);

  // Em navegação o mapa é filho de um container girado e maior que a tela.
  // Fora dela, os dois níveis são transparentes: mesmo `absolute inset-0` de
  // antes. Enquanto a medição não chega, também: o mapa aparece imediatamente e
  // ganha o tamanho de giro no quadro seguinte.
  const estiloGiro = navMode && medidas
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: `${medidas.lado}px`,
        height: `${medidas.lado}px`,
        transform: `translate(-50%, -50%) rotate(${-anguloContinuo}deg)`,
        transformOrigin: 'center center',
        // Linear, não ease: com curva de aceleração o mapa parece derrapar a
        // cada leitura do GPS. 500ms cobre o intervalo típico entre leituras.
        transition: 'transform 500ms linear',
        willChange: 'transform',
      }
    : { position: 'absolute', inset: 0 };

  return (
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden">
      {/* A classe nav-rotating não pinta nada: existe para o CSS contra-girar o
          conteúdo dos pins, que de outro modo ficariam deitados junto com o
          mapa. Ver index.css. */}
      <div
        ref={areaRef}
        className={`absolute inset-0 overflow-hidden ${navMode ? 'nav-rotating' : ''}`}
        style={navMode ? { '--nav-rot': `${anguloContinuo}deg` } : undefined}
      >
       <div style={estiloGiro}>
        <MapContainer
          // Monta ja no ponto do usuario quando a pagina conseguiu o GPS antes
          // de renderizar o mapa. Sem isso o Leaflet montava em Floresta e so
          // depois saltava - o usuario via a tela pular na abertura.
          center={
            initialCenter
              ? [initialCenter.lat, initialCenter.lng]
              : FLORESTA_COORDS
          }
          zoom={initialCenter ? zoomParaPrecisao(initialCenter.accuracy) : INITIAL_ZOOM}
          scrollWheelZoom={interactive}
          // Toque desligado em navegação: com o mapa girado, o ponto tocado não
          // corresponde ao ponto sob o dedo, e arrastar brigaria com o follow.
          dragging={interactive && !navMode}
          doubleClickZoom={interactive && !navMode}
          zoomControl={interactive && !navMode}
          className="absolute inset-0"
          style={{ height: "100%", width: "100%" }}
        >
          <ThemedTileLayer />
          <MapInstanceBinder
            onReady={(map) => { mapRef.current = map; }}
            onBoundsChange={onBoundsChange}
          />
          <MapScrollLock />
          <ClusterZoomHandler
            clusterToZoom={clusterToZoom}
            onZoomComplete={handleZoomComplete}
          />
          {/* Traco do percurso. E camada do Leaflet, entao gira junto com o
              mapa sem tratamento extra - ao contrario dos pins, que precisam da
              contra-rotacao para ficarem de pe. */}
          {navMode && navTrail && navTrail.length > 1 && (
            <Polyline
              positions={navTrail.map((p) => [p.lat, p.lng])}
              pathOptions={{
                color: 'rgb(var(--pin-user-bg))',
                weight: 6,
                opacity: 0.55,
                lineCap: 'round',
                lineJoin: 'round',
              }}
            />
          )}
          {navMode && navPosition && (
            <>
              <NavFollow
                posicao={navPosition}
                offsetPx={medidas?.offsetPx ?? 0}
                lado={medidas?.lado ?? 0}
              />
              <Marker
                position={[navPosition.lat, navPosition.lng]}
                icon={navMarkerIcon}
                zIndexOffset={1000}
              />
            </>
          )}
          {!navMode && userLocation && (
            <>
              <Circle
                center={[userLocation.lat, userLocation.lng]}
                radius={Math.max(40, Math.min(250, Number(userLocation.accuracy || 0)))}
                pathOptions={{
                  color: "#2563eb",
                  fillColor: "#2563eb",
                  fillOpacity: 0.12,
                  weight: 2,
                  opacity: 0.6,
                }}
              />
              <Marker
                position={[userLocation.lat, userLocation.lng]}
                icon={userMarkerIcon}
              />
            </>
          )}
          {navMode && (navMissoes || []).map((missao) => (
            <Marker
              key={`missao-${missao.id}`}
              position={[missao.lat, missao.lng]}
              icon={missionMarkerIcon}
              zIndexOffset={500}
              // O toque funciona mesmo com o mapa sem `dragging`: no Leaflet a
              // interatividade do marcador é independente da do mapa. É o que
              // permite escolher uma missão numa tela que não aceita arrastar.
              eventHandlers={
                onNavMissaoClick
                  ? { click: () => onNavMissaoClick(missao) }
                  : undefined
              }
            />
          ))}

          {(clusters || []).map((item) => {
            const isCluster = !!item.isCluster;
            const location = { lat: item.lat, lng: item.lng };
            const report = isCluster ? null : item.report;
            if (
              !location ||
              typeof location.lat !== "number" ||
              typeof location.lng !== "number"
            ) {
              return null;
            }
            return (
              <Marker
                key={
                  isCluster
                    ? `cluster-${item.lat}-${item.lng}-${item.count}`
                    : report.id
                }
                position={[location.lat, location.lng]}
                icon={
                  isCluster
                    ? createClusterIcon(item.count)
                    : createPinIcon({ report })
                }
                eventHandlers={{
                  click: (e) => {
                    if (isCluster && item.count > 1) {
                      e.originalEvent.stopPropagation();
                      handleClusterClick(item);
                    }
                  },
                  dblclick: (e) => {
                    e.originalEvent.stopPropagation();
                    if (!isCluster) onReportClick(report);
                  },
                }}
              >
                {!isCluster && !navMode && (
                  <Popup>
                    {/* Sem a descricao: o popup e um cartao de identificacao,
                        nao de leitura - o texto completo esta em "Detalhes". */}
                    <div className="w-52">
                      <h3 className="font-bold text-sm leading-snug mb-1 line-clamp-2">
                        {report.title}
                      </h3>
                      <div className="flex items-center text-[11px] text-muted-foreground mb-2">
                        <Calendar className="w-3 h-3 mr-1" />
                        {formatDate(report.created_at)}
                      </div>
                      <div className="flex items-center justify-between gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpvote(report.id);
                          }}
                          className="h-7 px-2 flex items-center gap-1 text-xs"
                        >
                          <ThumbsUp className="w-3 h-3" />
                          <span>{report.upvotes}</span>
                        </Button>
                        {report.status !== "resolved" && report.status !== "duplicate" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!user) {
                                navigate('/login', { state: { from: `/bronca/${report.id}`, openUpdateModal: true } });
                                return;
                              }
                              if (onUpdateClick) {
                                onUpdateClick(report);
                                return;
                              }
                              navigate(`/bronca/${report.id}`, { state: { openUpdateModal: true } });
                            }}
                            className="h-7 px-2 flex items-center gap-1 border-primary/30 text-primary hover:bg-primary/10 text-xs"
                            style={{ pointerEvents: "auto", touchAction: "auto" }}
                          >
                            <Megaphone className="w-3 h-3" />
                            Atualizar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReportClick(report);
                          }}
                          className="h-7 px-3 text-xs bg-primary hover:bg-primary/90"
                          style={{
                            pointerEvents: "auto",
                            touchAction: "auto",
                          }}
                        >
                          Detalhes
                        </Button>
                      </div>
                    </div>
                  </Popup>
                )}
              </Marker>
            );
          })}
        </MapContainer>
       </div>
        {/* Controles no alto da lateral direita: embaixo colidiam com os chips
            de categoria e com o carrossel, que ocupam o rodape do mapa. Ficam
            FORA do container girado: em navegacao eles precisam continuar de pe
            enquanto o mapa gira. */}
        {showModeToggle && (
          <div className="absolute top-24 right-3 z-[800]">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-lg">
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  recenterToUser();
                }}
                onMouseDown={(e) => e.stopPropagation()}
                onTouchStart={(e) => e.stopPropagation()}
                className="w-10 h-10 inline-flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
                title="Voltar para minha posição"
              >
                <LocateFixed className="w-4 h-4" />
              </button>
              <div className="h-px w-full bg-border" />
              <MapModeToggle className="w-10 h-10 p-0 bg-transparent shadow-none border-0 rounded-none hover:bg-muted/60" />
            </div>
          </div>
        )}
        {showLegend && (
          <div className="hidden sm:block absolute left-2 sm:left-4 bottom-2 sm:bottom-3 bg-card/95 backdrop-blur-sm rounded-lg px-2.5 py-2 sm:px-3 sm:py-2.5 shadow-lg border border-border z-[700] max-w-[180px] sm:max-w-[220px] pointer-events-auto">
            <h4 className="font-semibold text-[11px] sm:text-sm mb-1.5 sm:mb-2.5">
              Legenda
            </h4>
            <div className="space-y-1 text-[10px] sm:text-xs">
              {LEGEND_STATUSES.map(({ id, token, label }) => (
                <div key={id} className="flex items-center space-x-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: `rgb(var(${token}))` }}
                  ></div>
                  <span className="truncate">{label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {showLegend && (
        <div className="sm:hidden w-full bg-card/95 border-t border-border/80 px-3 py-2 flex items-center justify-between gap-3 text-[10px]">
          <span className="font-semibold text-[10px] text-foreground whitespace-nowrap mr-1">
            Legenda
          </span>
          <div className="flex items-center gap-3 flex-1 justify-end">
            {LEGEND_STATUSES.map(({ id, token, label }) => (
              <div key={id} className="flex items-center gap-1">
                <span
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: `rgb(var(${token}))` }}
                />
                <span className="truncate">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;
