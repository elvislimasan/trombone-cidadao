import React, { useState, useImperativeHandle, forwardRef, useRef, useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { Route as Road, ThumbsDown, ChevronLeft, ChevronRight, Image as ImageIcon, HardHat, Construction, Info, BookOpen, HelpCircle, Edit } from 'lucide-react';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { useMapScrollLock } from '@/hooks/useMapScrollLock';
import { useMapModeToggle } from '@/contexts/MapModeContext';
import MapModeToggle from '@/components/MapModeToggle';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Link } from 'react-router-dom';
import { useCityView } from '@/contexts/CityContext';
import { geocodeCity } from '@/lib/geocodeCity';
import MapDisplayControls, {
  CurrentLocationMarker,
  MAP_LAYER,
  MapBaseLayer,
} from '@/components/map/MapDisplayControls';
import { formatarDataBr, fotosDaRuaOrdenadas, hasPavementStreetHistory, normalizarFotos } from '@/lib/pavementStreetHistory';

// Status de pavimentacao -> sufixo das classes .via-pav--* e .ponto-pav--*.
const PAVEMENT_STATUS_TOKEN = {
  paved: 'paved',
  partially_paved: 'partial',
  unpaved: 'unpaved',
};

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

const MapScrollLock = ({ mode }) => {
  useMapScrollLock(mode);
  return null;
};

// O ponto encolhe no zoom de cidade e cresce ao aproximar. É o que o disco de
// 40 px não fazia — ele tinha o mesmo tamanho a 3 km e a 30 m, e por isso
// quatrocentos deles cobriam o mapa inteiro.
const ZoomWatcher = ({ onZoom }) => {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
};

// Recentraliza o mapa nas ruas carregadas sempre que a lista muda
// (ex.: ao trocar a cidade no seletor). Se não houver ruas na cidade,
// centraliza na própria cidade selecionada (forward geocode). Sem isso,
// o mapa fica preso no center inicial (Floresta).
const FitToStreets = ({ streets, activeCity }) => {
  const map = useMap();
  const lastKeyRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const pts = (streets || []).flatMap((s) => {
      const daLinha = (Array.isArray(s.linhas) ? s.linhas : []).flat();
      if (daLinha.length > 0) return daLinha;
      return s.location && Number.isFinite(s.location.lat) && Number.isFinite(s.location.lng)
        ? [[s.location.lat, s.location.lng]]
        : [];
    });

    if (pts.length > 0) {
      const key = 'streets:' + pts.map((p) => p.join(',')).sort().join('|');
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
  }, [streets, activeCity, map]);
  return null;
};

const PavementMapView = forwardRef(({ streets, onWorkClick, canManage = false, onEditStreet }, ref) => {
  const [selectedStreet, setSelectedStreet] = useState(null);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const mapRef = useRef();
  const markerRefs = useRef({});
  const [mapLayer, setMapLayer] = useState(MAP_LAYER.STANDARD);
  const [currentLocation, setCurrentLocation] = useState(null);
  const { mode } = useMapModeToggle();
  const { city: activeCity } = useCityView();
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const raioDoPonto = zoom >= 17 ? 9 : zoom >= 15 ? 7 : 5;

  useImperativeHandle(ref, () => ({
    goToLocation: (location) => {
      if (mapRef.current) {
        mapRef.current.flyTo([location.lat, location.lng], 18);
        const street = streets.find(s => s.location && s.location.lat === location.lat && s.location.lng === location.lng);
        if (street && markerRefs.current[street.id]) {
          markerRefs.current[street.id].openPopup();
        }
      }
    }
  }));

  const getStatusInfo = (status, pavementType) => {
    switch (status) {
      case 'paved':
        return { text: `Pavimentada (${pavementType === 'granite' ? 'Granito' : 'Asfalto'})`, color: 'bg-gray-800', icon: <HardHat className="w-3 h-3" /> };
      case 'partially_paved':
        return { text: `Parcialmente Pavimentada (${pavementType === 'granite' ? 'Granito' : 'Asfalto'})`, color: 'bg-gray-500', icon: <Construction className="w-3 h-3" /> };
      case 'unpaved':
        return { text: 'Sem Pavimentação', color: 'bg-amber-600', icon: <ThumbsDown className="w-3 h-3" /> };
      default:
        return { text: 'N/A', color: 'bg-gray-400', icon: <Road className="w-3 h-3" /> };
    }
  };

  const handleDetailsClick = (street) => {
    setSelectedStreet(street);
    setCurrentMediaIndex(0);
    setIsDetailsOpen(true);
  };

  const nextMedia = () => {
    if (fotos.length > 0) setCurrentMediaIndex((i) => (i + 1) % fotos.length);
  };

  const prevMedia = () => {
    if (fotos.length > 0) setCurrentMediaIndex((i) => (i - 1 + fotos.length) % fotos.length);
  };

  const statusInfo = selectedStreet ? getStatusInfo(selectedStreet.status, selectedStreet.pavement_type) : {};

  // AS FOTOS SAEM DE `historical_photos`, QUE É ONDE ELAS SÃO CADASTRADAS.
  //
  // Este visor lia `selectedStreet.media` — um campo que nenhuma migração cria
  // e nenhum formulário preenche. A caixa dizia "Nenhuma mídia disponível" para
  // toda rua do banco, e ia continuar dizendo para sempre.
  //
  // A destacada vem primeiro: é a mesma foto que abre a página da rua, então o
  // popup e a página passam a mostrar a mesma capa.
  const fotos = useMemo(
    () => (selectedStreet ? fotosDaRuaOrdenadas(normalizarFotos(selectedStreet)) : []),
    [selectedStreet]
  );

  return (
    <div className="w-full h-full bg-secondary rounded-lg overflow-hidden relative">
      <MapContainer center={FLORESTA_COORDS} zoom={INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
        <MapController mapRef={mapRef} />
        <MapScrollLock mode={mode} />
        <FitToStreets streets={streets} activeCity={activeCity} />
        <MapBaseLayer layer={mapLayer} />
        <CurrentLocationMarker position={currentLocation} />
        <ZoomWatcher onZoom={setZoom} />
        {streets.map((street) => {
          const token = PAVEMENT_STATUS_TOKEN[street.status] || 'unknown';
          const linhas = Array.isArray(street.linhas) ? street.linhas : [];

          const popup = (
            <Popup className="custom-popup" minWidth={200}>
              <div className="p-1">
                <div className="mb-2">
                  <h3 className="font-bold text-lg text-tc-red leading-tight">{street.name}</h3>
                  {street.is_unnamed && (
                    <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-status-pendingBorder bg-status-pendingBg px-2 py-0.5 text-[10px] font-semibold text-status-pendingFg">
                      <HelpCircle className="h-3 w-3" /> Sem nome oficial
                    </span>
                  )}
                </div>

                <div className="mt-2">
                  <Button size="sm" className="w-full justify-start" onClick={() => handleDetailsClick(street)}>
                    <Info className="w-4 h-4 mr-2" /> Ver mais detalhes
                  </Button>
                  {hasPavementStreetHistory(street) && (
                    <Button asChild size="sm" variant="outline" className="mt-2 w-full">
                      <Link to={`/mapa-pavimentacao/rua/${street.id}`}>
                        <BookOpen className="mr-2 h-4 w-4" /> História da rua
                      </Link>
                    </Button>
                  )}
                  {canManage && onEditStreet && (
                    <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => onEditStreet(street)}>
                      <Edit className="mr-2 h-4 w-4" /> Editar rua
                    </Button>
                  )}
                </div>
              </div>
            </Popup>
          );

          // COM TRAÇADO: a rua é uma linha, que é o que ela é.
          if (linhas.length > 0) {
            return (
              <React.Fragment key={street.id}>
                {/* A área de toque vai por baixo e é invisível: sem ela, acertar
                    5 px com o dedo é impossível. O ref também vai aqui — é a
                    única camada interativa da rua com traçado, e é ela que
                    `goToLocation` precisa abrir. */}
                <Polyline
                  positions={linhas}
                  ref={(el) => { if (el) markerRefs.current[street.id] = el; }}
                  className="via-pav-toque"
                  pathOptions={{ weight: 16, opacity: 0 }}
                >
                  {popup}
                </Polyline>
                <Polyline
                  positions={linhas}
                  className={`via-pav via-pav--${token}`}
                  pathOptions={{ weight: 5 }}
                  interactive={false}
                />
              </React.Fragment>
            );
          }

          // SEM TRAÇADO: um ponto pequeno. Rua sem nome oficial nunca vai ter
          // traçado do OSM, e é aqui que ela vive.
          if (!street.location) return null;
          return (
            <CircleMarker
              key={street.id}
              ref={(el) => { if (el) markerRefs.current[street.id] = el; }}
              center={[street.location.lat, street.location.lng]}
              radius={raioDoPonto}
              className={`ponto-pav ponto-pav--${token}`}
              pathOptions={{ weight: 2 }}
            >
              {popup}
            </CircleMarker>
          );
        })}
      </MapContainer>

      <div className="absolute top-4 right-4 z-[800] flex flex-col gap-2">
        <MapDisplayControls
          mapRef={mapRef}
          layer={mapLayer}
          onLayerChange={setMapLayer}
          onLocated={setCurrentLocation}
        />
        <MapModeToggle className="h-11 w-11 rounded-full p-0" />
      </div>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-card border-border">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-tc-red">{selectedStreet?.name}</DialogTitle>
            <DialogDescription className="text-base text-muted-foreground">
              {selectedStreet?.bairro?.name}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Status Info */}
            <div className="flex flex-wrap items-center gap-3">
              <span className={`flex items-center gap-2 text-sm font-semibold px-3 py-1.5 rounded-full text-white ${statusInfo.color}`}>
                {statusInfo.icon}
                {statusInfo.text}
              </span>
              {selectedStreet?.is_unnamed && (
                <span className="flex items-center gap-2 rounded-full border border-status-pendingBorder bg-status-pendingBg px-3 py-1.5 text-sm font-semibold text-status-pendingFg">
                  <HelpCircle className="h-4 w-4" /> Sem nome oficial
                </span>
              )}
              {selectedStreet?.paving_date && (
                <span className="text-sm bg-secondary text-secondary-foreground px-3 py-1.5 rounded-full font-medium">
                  Realizado em: {new Date(selectedStreet.paving_date).toLocaleDateString()}
                </span>
              )}
              {selectedStreet?.id && hasPavementStreetHistory(selectedStreet) && (
                <Button asChild size="sm" variant="outline">
                  <Link to={`/mapa-pavimentacao/rua/${selectedStreet.id}`}>
                    <BookOpen className="mr-2 h-4 w-4" /> Abrir página da rua
                  </Link>
                </Button>
              )}
               {selectedStreet?.work_id && (
                  <button 
                    onClick={() => {
                      setIsDetailsOpen(false);
                      onWorkClick(selectedStreet.work_id);
                    }} 
                    className="text-sm bg-blue-50 text-blue-600 px-3 py-1.5 rounded-full hover:bg-blue-100 flex items-center gap-2 transition-colors font-medium border border-blue-100"
                  >
                    <HardHat className="w-4 h-4" /> Ver página da obra
                  </button>
                )}
            </div>

            {/* O visor da rua */}
            <div className="relative bg-secondary rounded-lg overflow-hidden aspect-video w-full shadow-inner border border-border/50">
              {fotos.length > 0 ? (
                <>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentMediaIndex}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full relative group"
                    >
                      <img
                        src={fotos[currentMediaIndex]?.url}
                        alt={fotos[currentMediaIndex]?.caption || selectedStreet?.name || ''}
                        className="w-full h-full object-contain bg-black/5"
                      />
                      {(fotos[currentMediaIndex]?.caption || fotos[currentMediaIndex]?.date) && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 pt-16 text-white">
                          <p className="text-lg font-medium truncate">{fotos[currentMediaIndex]?.caption}</p>
                          <p className="text-sm opacity-80">{formatarDataBr(fotos[currentMediaIndex]?.date)}</p>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>

                  {fotos.length > 1 && (
                    <>
                      <button onClick={prevMedia} aria-label="Foto anterior" className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-3 rounded-full transition-colors backdrop-blur-sm">
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button onClick={nextMedia} aria-label="Próxima foto" className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-3 rounded-full transition-colors backdrop-blur-sm">
                        <ChevronRight className="w-6 h-6" />
                      </button>
                      <div className="absolute top-4 right-4 bg-black/50 text-white text-sm px-3 py-1.5 rounded-full backdrop-blur-sm font-medium">
                        {currentMediaIndex + 1} / {fotos.length}
                      </div>
                    </>
                  )}
                </>
              ) : (
                /* O estado vazio FICA, mas agora diz a verdade: esta rua não tem
                   foto cadastrada. Antes descrevia um campo inexistente. */
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                  <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-lg font-medium">Nenhuma foto cadastrada</p>
                  <p className="text-sm opacity-70 mt-2">As fotos desta rua aparecem aqui depois de cadastradas na edição.</p>
                </div>
              )}
            </div>

            {fotos.length > 1 && (
              <div>
                <h4 className="font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
                  <ImageIcon className="w-5 h-5" /> Todas as fotos
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {fotos.map((foto, index) => (
                    <button
                      key={`${foto.url}-${index}`}
                      onClick={() => setCurrentMediaIndex(index)}
                      aria-label={`Ver foto ${index + 1}`}
                      className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${currentMediaIndex === index ? 'border-tc-red ring-2 ring-tc-red/20 opacity-100 scale-[1.02]' : 'border-transparent hover:border-muted-foreground/30 opacity-70 hover:opacity-100'}`}
                    >
                      <img src={foto.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

PavementMapView.displayName = 'PavementMapView';

export default PavementMapView;
