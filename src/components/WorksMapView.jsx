import { MapBaseLayer, MAP_LAYER } from '@/components/map/MapDisplayControls';
import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect, useCallback } from 'react';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
import { LocateFixed, Layers, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { useMapScrollLock } from '@/hooks/useMapScrollLock';
import { useMapModeToggle } from '@/contexts/MapModeContext';
import MapModeToggle from '@/components/MapModeToggle';
import { useCityView } from '@/contexts/CityContext';
import { geocodeCity } from '@/lib/geocodeCity';
import { createMapPin, ICON_SIZE } from '@/components/map/pinIcon';

// Status de obra -> sufixo do token --pin-work-*. Fora dessa lista cai em
// 'unknown', o cinza neutro.
const WORK_STATUS_TOKEN = {
  planned: 'planned',
  tendered: 'tendered',
  'in-progress': 'progress',
  stalled: 'stalled',
  unfinished: 'unfinished',
  completed: 'completed',
};

// Capacete de obra, sem equivalente no design system (la os icones sao por
// categoria de bronca). currentColor recebe o token de fg via createMapPin.
const WorkIcon = () => (
  <svg
    width={ICON_SIZE}
    height={ICON_SIZE}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v5Z" />
    <path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" />
  </svg>
);

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

const MapScrollLock = ({ mode }) => {
  useMapScrollLock(mode);
  return null;
};

// Recentraliza o mapa nas obras carregadas sempre que a lista muda
// (ex.: ao trocar a cidade no seletor). Se não houver obras na cidade,
// centraliza na própria cidade selecionada (forward geocode). Sem isso,
// o mapa fica preso no center inicial (Floresta).
const FitToWorks = ({ works, activeCity }) => {
  const map = useMap();
  const lastKeyRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const pts = (works || [])
      .filter((w) => w.location && Number.isFinite(w.location.lat) && Number.isFinite(w.location.lng))
      .map((w) => [w.location.lat, w.location.lng]);

    if (pts.length > 0) {
      const key = 'works:' + pts.map((p) => p.join(',')).sort().join('|');
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      try {
        if (pts.length === 1) {
          map.setView(pts[0], Math.max(map.getZoom(), 15), { animate: true });
        } else {
          map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], animate: true });
        }
      } catch (e) { /* noop */ }
      return;
    }

    // Sem obras: centraliza na cidade ativa (se houver).
    if (activeCity?.name) {
      const key = 'city:' + activeCity.name + '|' + (activeCity.state?.uf || '');
      if (key === lastKeyRef.current) return;
      lastKeyRef.current = key;
      geocodeCity(activeCity.name, activeCity.state?.uf).then((coord) => {
        if (cancelled || !coord) return;
        try { map.setView([coord.lat, coord.lng], 13, { animate: true }); } catch {}
      });
    }
    return () => { cancelled = true; };
  }, [works, activeCity, map]);
  return null;
};

// `mostrarLegenda`: a legenda flutuante é a da tela cheia do celular. Onde a
// página já tem uma coluna com as situações e as cores — o mapa de obras em
// desktop —, ela vira uma segunda cópia da mesma informação no mesmo lugar.
const WorksMapView = forwardRef(({ works, mostrarLegenda = true, podeGerir = false, onEditWork }, ref) => {
  const [camada, setCamada] = useState(MAP_LAYER.STANDARD);
  const mapRef = useRef();
  const navigate = useNavigate();
  const { mode } = useMapModeToggle();
  const { city: activeCity } = useCityView();

  useImperativeHandle(ref, () => ({
    goToLocation: (location) => {
      if (mapRef.current) {
        mapRef.current.flyTo([location.lat, location.lng], 18);
      }
    }
  }));

  /**
   * Centraliza o mapa na posição do usuário.
   *
   * Sem isto, quem abre o mapa de obras cai na vista que enquadra TODAS as
   * obras da cidade (FitToWorks) e tem que arrastar até o próprio bairro para
   * saber o que tem por perto — que é a pergunta que a maioria das pessoas
   * chega fazendo.
   *
   * Não marca posição nem altera filtro: só move a câmera. Falha em silêncio
   * quando a permissão é negada — o mapa continua utilizável, e um toast de
   * erro para uma ação que a pessoa pode simplesmente não repetir só atrapalha.
   */
  const recenterToUser = useCallback(() => {
    if (!mapRef.current || !navigator?.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos?.coords?.latitude;
        const lng = pos?.coords?.longitude;
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
        try {
          mapRef.current.flyTo([lat, lng], Math.max(mapRef.current.getZoom(), 15), { animate: true, duration: 0.6 });
        } catch {}
      },
      () => {},
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }, []);

  const createWorkMarkerIcon = (status) => {
    const token = WORK_STATUS_TOKEN[status] || 'unknown';
    return createMapPin({
      cacheKey: `work|${token}`,
      bgToken: `--pin-work-${token}-bg`,
      fgToken: `--pin-work-${token}-fg`,
      icon: <WorkIcon />,
    });
  };

  return (
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden">
      <MapContainer center={FLORESTA_COORDS} zoom={INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
        <MapController mapRef={mapRef} />
        <MapScrollLock mode={mode} />
        <FitToWorks works={works} activeCity={activeCity} />
        <MapBaseLayer layer={camada} />
        {works.map((work) => (
          work.location &&
          <Marker
            key={work.id}
            position={[work.location.lat, work.location.lng]}
            icon={createWorkMarkerIcon(work.status)}
          >
            {/* O BALÃO ERA SÓ O TÍTULO
                Clicar no pino já levava à página da obra, mas isso não estava
                escrito em lugar nenhum — e quem administra tinha de sair para o
                menu, achar "gerenciar" e procurar a obra na lista para corrigir
                uma data. Os dois caminhos agora começam aqui. */}
            <Popup>
              <div className="min-w-[10rem] p-0.5">
                <p className="text-sm font-bold leading-tight text-tc-red">{work.title}</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    size="sm"
                    className="h-7 px-3 text-xs"
                    onClick={(e) => { e.stopPropagation(); navigate(`/obras-publicas/${work.id}`); }}
                  >
                    Detalhes
                  </Button>
                  {podeGerir && onEditWork && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 px-2 text-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditWork(work);
                      }}
                    >
                      <Pencil className="h-3 w-3" /> Editar
                    </Button>
                  )}
                </div>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Bloco antigo do modal de detalhes, preservado temporariamente enquanto
          a refatoração local do mapa é concluída.

      */}
      <div className="absolute top-4 right-4 z-[800]">
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
            title="Ir para minha posição"
            aria-label="Ir para minha posição"
          >
            <LocateFixed className="w-4 h-4" />
          </button>
          <div className="h-px w-full bg-border" />
          {/* Entra na mesma pilha dos outros controles, e não como pílula solta:
              o estilo daqui é quadrado e sem sombra, e um botão redondo no meio
              da coluna leria como algo de outro sistema. Por isso não se usa o
              `MapLayerToggle` aqui — só a camada, que é o que precisa ser único. */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setCamada((atual) => (atual === MAP_LAYER.SATELLITE ? MAP_LAYER.STANDARD : MAP_LAYER.SATELLITE));
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            className="w-10 h-10 inline-flex items-center justify-center text-foreground hover:bg-muted/60 transition-colors"
            title={camada === MAP_LAYER.SATELLITE ? 'Mapa padrão' : 'Satélite'}
            aria-label={camada === MAP_LAYER.SATELLITE ? 'Usar mapa padrão' : 'Usar mapa de satélite'}
          >
            <Layers className="w-4 h-4" />
          </button>
          <div className="h-px w-full bg-border" />
          <MapModeToggle className="w-10 h-10 p-0 bg-transparent shadow-none border-0 rounded-none hover:bg-muted/60" />
        </div>
      </div>

      {mostrarLegenda && (
        <div className="absolute left-2 sm:left-4 bottom-2 sm:bottom-3 bg-card/95 backdrop-blur-sm rounded-lg p-3 shadow-lg border border-border z-[700] max-w-[200px] pointer-events-auto">
          <h4 className="font-semibold text-sm mb-2.5">Legenda</h4>
          <div className="space-y-1.5 text-xs">
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-purple-500 rounded-full flex-shrink-0"></div><span className="truncate">Prevista</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-orange-500 rounded-full flex-shrink-0"></div><span className="truncate">Licitada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-blue-500 rounded-full flex-shrink-0"></div><span className="truncate">Em Andamento</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-amber-500 rounded-full flex-shrink-0"></div><span className="truncate">Paralisada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-red-500 rounded-full flex-shrink-0"></div><span className="truncate">Inacabada</span></div>
            <div className="flex items-center space-x-2"><div className="w-3 h-3 bg-green-500 rounded-full flex-shrink-0"></div><span className="truncate">Concluída</span></div>
          </div>
        </div>
      )}
    </div>
  );
});

export default WorksMapView;
