import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import {
  MapContainer,

  Marker,
  Popup,
  useMap,
  Circle,
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

// Nivel de zoom ao enquadrar o usuario - na abertura da tela e no botao de
// recentrar. Os dois usavam valores diferentes (16 e 17): o mapa abria mais
// afastado do que ficava depois de tocar no botao.
const USER_ZOOM = 17;

// A legenda usa os mesmos tokens do corpo do pin, entao as bolinhas e os pins
// nunca divergem de cor. Agora lista categorias, nao status: e a categoria que
// define a cor no mapa.
const LEGEND_CATEGORIES = [
  { id: "buracos", token: "--pin-pothole-bg", label: "Buracos" },
  { id: "iluminacao", token: "--pin-lighting-bg", label: "Iluminação" },
  { id: "esgoto", token: "--pin-sewage-bg", label: "Esgoto" },
  { id: "limpeza", token: "--pin-cleaning-bg", label: "Limpeza" },
  { id: "poda", token: "--pin-greenery-bg", label: "Poda" },
  { id: "seguranca", token: "--pin-security-bg", label: "Segurança" },
  { id: "outros", token: "--pin-other-bg", label: "Outros" },
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
      map.setView([userLocation.lat, userLocation.lng], USER_ZOOM, { animate: false });
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

  return (
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden">
      <div className="absolute inset-0">
        <MapContainer
          // Monta ja no ponto do usuario quando a pagina conseguiu o GPS antes
          // de renderizar o mapa. Sem isso o Leaflet montava em Floresta e so
          // depois saltava - o usuario via a tela pular na abertura.
          center={
            initialCenter
              ? [initialCenter.lat, initialCenter.lng]
              : FLORESTA_COORDS
          }
          zoom={initialCenter ? USER_ZOOM : INITIAL_ZOOM}
          scrollWheelZoom={interactive}
          dragging={interactive}
          doubleClickZoom={interactive}
          zoomControl={interactive}
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
          {userLocation && (
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
                {!isCluster && (
                  <Popup>
                    <div className="w-64">
                      <h3 className="font-bold text-base mb-1">
                        {report.title}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2 line-clamp-2">
                        {report.description}
                      </p>
                      <div className="flex items-center text-xs text-muted-foreground mb-3">
                        <Calendar className="w-3 h-3 mr-1" />
                        {formatDate(report.created_at)}
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onUpvote(report.id);
                          }}
                          className="flex items-center space-x-1"
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
                            className="flex items-center gap-1 border-[#b61722]/30 text-[#b61722] hover:bg-[#fff7f7] text-xs"
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
                          className="bg-primary hover:bg-primary/90"
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
        {/* Controles no alto da lateral direita: embaixo colidiam com os chips
            de categoria e com o carrossel, que ocupam o rodape do mapa. */}
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
              {LEGEND_CATEGORIES.map(({ id, token, label }) => (
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
            {LEGEND_CATEGORIES.map(({ id, token, label }) => (
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
