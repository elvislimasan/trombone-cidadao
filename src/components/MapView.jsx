import React, { useEffect, useMemo, useCallback, useState } from "react";
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  useMap,
  Circle,
} from "react-leaflet";
import { ThumbsUp, Calendar, Layers, Grid3X3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
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

const ClusterZoomHandler = ({ clusterToZoom, onZoomComplete }) => {
  const map = useMap();

  useEffect(() => {
    if (
      clusterToZoom &&
      clusterToZoom.items &&
      clusterToZoom.items.length > 0
    ) {
      const bounds = L.latLngBounds(
        clusterToZoom.items.map((r) => [r.location.lat, r.location.lng])
      );
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 18 });
      if (onZoomComplete) onZoomComplete();
    }
  }, [clusterToZoom, map, onZoomComplete]);

  return null;
};

const MapView = ({
  reports,
  onReportClick,
  onUpvote,
  showLegend = true,
  showModeToggle = true,
  interactive = true,
}) => {
  const { mode } = useMapModeToggle();
  const [clusterToZoom, setClusterToZoom] = useState(null);
  const [expandedCluster, setExpandedCluster] = useState(null);

  // Load cluster preference from localStorage, default to false (individual view)
  const [clusterModeEnabled, setClusterModeEnabled] = useState(() => {
    const saved = localStorage.getItem("map-cluster-mode");
    return saved ? JSON.parse(saved) : false;
  });

  // Save preference to localStorage when changed
  useEffect(() => {
    localStorage.setItem(
      "map-cluster-mode",
      JSON.stringify(clusterModeEnabled)
    );
  }, [clusterModeEnabled]);

  const toggleClusterMode = useCallback(() => {
    setClusterModeEnabled((prev) => !prev);
    setExpandedCluster(null);
  }, []);

  const formatDate = (dateString) => {
    if (!dateString || isNaN(new Date(dateString))) return "Data inválida";
    return new Date(dateString).toLocaleDateString("pt-BR");
  };

  const handleClusterClick = useCallback((cluster) => {
    setClusterToZoom(cluster);
    setExpandedCluster(cluster);
  }, []);

  const handleZoomComplete = useCallback(() => {
    setClusterToZoom(null);
  }, []);

  const handleCloseExpanded = useCallback(() => {
    setExpandedCluster(null);
  }, []);

  const MapScrollLock = () => {
    useMapScrollLock(mode);
    useEffect(() => {}, [mode]);
    return null;
  };

  const clusterSize = 0.003; // ~300-350m dependendo da latitude
  const clustered = useMemo(() => {
    const list = Array.isArray(reports) ? reports : [];
    // Only cluster if clusterModeEnabled is true
    if (!clusterModeEnabled) return null;
    const buckets = new Map();
    for (const r of list) {
      const loc = r.location;
      if (!loc || typeof loc.lat !== "number" || typeof loc.lng !== "number")
        continue;
      const keyLat = Math.floor(loc.lat / clusterSize);
      const keyLng = Math.floor(loc.lng / clusterSize);
      const key = `${keyLat}:${keyLng}`;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(r);
    }
    const clusters = [];
    for (const arr of buckets.values()) {
      if (arr.length === 1) {
        const r = arr[0];
        clusters.push({
          count: 1,
          lat: r.location.lat,
          lng: r.location.lng,
          items: arr,
        });
      } else {
        const sumLat = arr.reduce((acc, r) => acc + r.location.lat, 0);
        const sumLng = arr.reduce((acc, r) => acc + r.location.lng, 0);
        const lat = sumLat / arr.length;
        const lng = sumLng / arr.length;
        clusters.push({ count: arr.length, lat, lng, items: arr });
      }
    }
    return clusters;
  }, [reports, clusterModeEnabled]);

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
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden flex flex-col">
      <div className="relative flex-1">
        <MapContainer
          center={FLORESTA_COORDS}
          zoom={INITIAL_ZOOM}
          scrollWheelZoom={interactive}
          dragging={interactive}
          doubleClickZoom={interactive}
          zoomControl={interactive}
          className="w-full h-full"
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapScrollLock />
          <ClusterZoomHandler
            clusterToZoom={clusterToZoom}
            onZoomComplete={handleZoomComplete}
          />
          {expandedCluster &&
            expandedCluster.count > 1 &&
            (() => {
              const cluster = expandedCluster;
              const radius =
                Math.max(
                  ...cluster.items.map((r) => {
                    const dLat = r.location.lat - cluster.lat;
                    const dLng = r.location.lng - cluster.lng;
                    return Math.sqrt(dLat * dLat + dLng * dLng) * 111000;
                  }),
                  50
                ) * 1.3;
              const intensity =
                cluster.count >= 50
                  ? "#ef4444"
                  : cluster.count >= 10
                  ? "#f59e0b"
                  : "#3b82f6";
              return (
                <Circle
                  key={`circle-${cluster.lat}-${cluster.lng}`}
                  center={[cluster.lat, cluster.lng]}
                  radius={radius}
                  pathOptions={{
                    color: intensity,
                    fillColor: intensity,
                    fillOpacity: 0.15,
                    weight: 2,
                    opacity: 0.6,
                    dashArray: "5, 5",
                  }}
                />
              );
            })()}
          {expandedCluster &&
            expandedCluster.items.map((report) => {
              const location = report.location;
              if (
                !location ||
                typeof location.lat !== "number" ||
                typeof location.lng !== "number"
              ) {
                return null;
              }
              return (
                <Marker
                  key={`expanded-${report.id}`}
                  position={[location.lat, location.lng]}
                  icon={createMarkerIcon(report.category, report.status)}
                  eventHandlers={{
                    click: (e) => {
                      e.originalEvent.stopPropagation();
                    },
                    dblclick: (e) => {
                      e.originalEvent.stopPropagation();
                      onReportClick(report);
                    },
                  }}
                >
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
                      <div className="flex items-center justify-between">
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
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onReportClick(report);
                          }}
                          className="bg-primary hover:bg-primary/90"
                          style={{ pointerEvents: "auto", touchAction: "auto" }}
                        >
                          Ver Detalhes
                        </Button>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          {(clustered ? clustered : reports).map((item) => {
            const isCluster = !!item.items;
            const isThisClusterExpanded =
              expandedCluster &&
              isCluster &&
              expandedCluster.lat === item.lat &&
              expandedCluster.lng === item.lng;

            if (isThisClusterExpanded) return null;

            const location = isCluster
              ? { lat: item.lat, lng: item.lng }
              : item.location;
            const report = isCluster ? null : item;
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
                <Popup>
                  <div className="w-64">
                    {isCluster ? (
                      <>
                        <h3 className="font-bold text-base mb-2">
                          Broncas nesta área ({item.count})
                        </h3>
                        <p className="text-xs text-muted-foreground mb-3">
                          Clique no cluster para expandir a área
                        </p>
                        <ul className="space-y-1 mb-3 max-h-48 overflow-y-auto">
                          {item.items.map((r) => (
                            <li
                              key={r.id}
                              className="text-sm line-clamp-1 cursor-pointer hover:text-primary hover:underline py-1 border-b border-border/50 last:border-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReportClick(r);
                              }}
                              style={{ pointerEvents: "auto" }}
                            >
                              {r.title}
                            </li>
                          ))}
                        </ul>
                        <Button
                          size="sm"
                          variant="outline"
                          className="w-full"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleClusterClick(item);
                          }}
                        >
                          Expandir área
                        </Button>
                      </>
                    ) : (
                      <>
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
                        <div className="flex items-center justify-between">
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
                            Ver Detalhes
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                </Popup>
              </Marker>
            );
          })}
        </MapContainer>
        {expandedCluster && clusterModeEnabled && (
          <div className="absolute top-2 left-2 z-[800]">
            <Button
              size="sm"
              variant="secondary"
              className="shadow-lg h-7 px-2 py-0 text-xs gap-1"
              onClick={handleCloseExpanded}
            >
              ← <span className="hidden sm:inline">Voltar ao agrupamento</span>
              <span className="sm:hidden">Agrupar</span>
            </Button>
          </div>
        )}
        {showModeToggle && (
          <div className="absolute top-4 right-4 z-[800] flex gap-2 items-center">
            <MapModeToggle />
            <Toggle
              pressed={clusterModeEnabled}
              onPressedChange={toggleClusterMode}
              className="bg-white/95 backdrop-blur-sm shadow-lg border border-border px-3 py-2 h-auto data-[state=on]:bg-primary data-[state=on]:text-primary-foreground"
              title={
                clusterModeEnabled
                  ? "Ver broncas individuais"
                  : "Ver agrupamentos"
              }
            >
              {clusterModeEnabled ? (
                <>
                  <Grid3X3 className="w-4 h-4 " />{" "}
                  <span className="text-xs font-medium"></span>
                </>
              ) : (
                <>
                  <Layers className="w-4 h-4" />{" "}
                  <span className="text-xs font-medium"></span>
                </>
              )}
            </Toggle>
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
