import React, { useEffect, useMemo, useCallback, useRef, useState } from "react";
import {
  MapContainer,
  TileLayer,
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

const getCategoryIcon = (category) => {
  const icons = {
    iluminacao: "💡",
    buracos: "🕳️",
    esgoto: "🚰",
    limpeza: "🧹",
    poda: "🌳",
    outros: "📍",
  };
  return icons[category] || "📍";
};

const getStatusColor = (status) => {
  const colors = {
    pending: "#f97316",
    "in-progress": "#3b82f6",
    resolved: "#22c55e",
  };
  return colors[status] || "#6b7280";
};

const markerIconCache = new Map();

const createMarkerIcon = (category, status) => {
  const key = `${category || ""}|${status || ""}`;
  const cached = markerIconCache.get(key);
  if (cached) return cached;

  const iconHtml = `
    <div style="
      background-color: ${getStatusColor(status)};
      width: 2.5rem;
      height: 2.5rem;
      border-radius: 50%;
      border: 2px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 1.25rem;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    ">
      ${getCategoryIcon(category)}
    </div>
  `;
  const icon = L.divIcon({
    html: iconHtml,
    className: "custom-leaflet-icon",
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
  markerIconCache.set(key, icon);
  return icon;
};

const userMarkerIcon = L.divIcon({
  html: `
    <div style="
      width: 18px;
      height: 18px;
      border-radius: 999px;
      background: #2563eb;
      border: 3px solid white;
      box-shadow: 0 6px 14px rgba(37, 99, 235, 0.35);
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
    // Cluster grande: sem lista de coordenadas carregada, dá zoom no centróide
    // e deixa o próximo fetch (disparado por zoomend) trazer o próximo nível de agregação.
    map.setView([clusterToZoom.lat, clusterToZoom.lng], Math.min((map.getZoom?.() || 4) + 3, 18), { animate: true });
    if (onZoomComplete) onZoomComplete();
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
  const hasCenteredRef = useRef(false);
  const [userLocation, setUserLocation] = useState(null);
  const [clusterToZoom, setClusterToZoom] = useState(null);

  const recenterToUser = useCallback(() => {
    if (!interactive) return;
    if (!navigator.geolocation) return;
    const map = mapRef.current;

    const go = (loc) => {
      if (!map) return;
      const nextZoom = Math.max(map.getZoom?.() || INITIAL_ZOOM, 17);
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

  useEffect(() => {
    const map = mapRef.current;
    if (!interactive || !map || !userLocation || hasCenteredRef.current) return;
    hasCenteredRef.current = true;
    try {
      map.setView([userLocation.lat, userLocation.lng], 16, { animate: false });
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
    setClusterToZoom(cluster);
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
    const intensity =
      count >= 50 ? "#ef4444" : count >= 10 ? "#f59e0b" : "#3b82f6";
    const html = `
      <div style="
        background: ${intensity};
        width: ${size}px;
        height: ${size}px;
        border-radius: 999px;
        border: 2px solid white;
        color: white;
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
          center={FLORESTA_COORDS}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom={interactive}
          dragging={interactive}
          doubleClickZoom={interactive}
          zoomControl={interactive}
          className="absolute inset-0"
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
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
                    : createMarkerIcon(report.category, report.status)
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
        {showModeToggle && (
          <div className="absolute bottom-3 right-3 z-[800]">
            <div className="flex flex-col overflow-hidden rounded-2xl border border-border bg-white shadow-lg">
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
              <div className="flex items-center space-x-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getStatusColor("pending") }}
                ></div>
                <span className="truncate">Pendente</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getStatusColor("in-progress") }}
                ></div>
                <span className="truncate">Em Andamento</span>
              </div>
              <div className="flex items-center space-x-1.5">
                <div
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: getStatusColor("resolved") }}
                ></div>
                <span className="truncate">Resolvido</span>
              </div>
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
            <div className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getStatusColor("pending") }}
              />
              <span className="truncate">Pendente</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getStatusColor("in-progress") }}
              />
              <span className="truncate">Em Andamento</span>
            </div>
            <div className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: getStatusColor("resolved") }}
              />
              <span className="truncate">Resolvido</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MapView;
