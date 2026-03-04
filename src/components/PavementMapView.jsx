import React, { useState, useImperativeHandle, forwardRef, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Route as Road, ThumbsDown, ChevronLeft, ChevronRight, Video, Image as ImageIcon, HardHat, Construction, Info } from 'lucide-react';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { useMapScrollLock } from '@/hooks/useMapScrollLock';
import { useMapModeToggle } from '@/contexts/MapModeContext';
import MapModeToggle from '@/components/MapModeToggle';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

const MapScrollLock = ({ mode }) => {
  useMapScrollLock(mode);
  return null;
};

const PavementMapView = forwardRef(({ streets, onWorkClick }, ref) => {
  const [selectedStreet, setSelectedStreet] = useState(null);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const [isDetailsOpen, setIsDetailsOpen] = useState(false);
  const mapRef = useRef();
  const markerRefs = useRef({});
  const { mode } = useMapModeToggle();

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
        return { text: `Pavimentada (${pavementType === 'granite' ? 'Granito' : 'Asfalto'})`, color: 'bg-gray-800', icon: <HardHat className="w-3 h-3" />, markerColor: '#374151' };
      case 'partially_paved':
        return { text: `Parcialmente Pavimentada (${pavementType === 'granite' ? 'Granito' : 'Asfalto'})`, color: 'bg-gray-500', icon: <Construction className="w-3 h-3" />, markerColor: '#6b7280' };
      case 'unpaved':
        return { text: 'Sem Pavimentação', color: 'bg-amber-600', icon: <ThumbsDown className="w-3 h-3" />, markerColor: '#d97706' };
      default:
        return { text: 'N/A', color: 'bg-gray-400', icon: <Road className="w-3 h-3" />, markerColor: '#9ca3af' };
    }
  };

  const createStreetMarkerIcon = (street) => {
    const statusInfo = getStatusInfo(street.status, street.pavement_type);
    const workIcon = street.work_id ? `<div style="position: absolute; top: -5px; right: -5px; width: 1rem; height: 1rem; background-color: #3b82f6; border-radius: 50%; border: 2px solid white; display: flex; align-items: center; justify-content: center;"><svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4c0-1.1.9-2 2-2h8c1.1 0 2 .9 2 2v5Z"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z"/></svg></div>` : '';
    
    const iconHtml = `
      <div style="position: relative;">
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="${statusInfo.markerColor}" stroke="white" stroke-width="1" stroke-linecap="round" stroke-linejoin="round">
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>
        </svg>
        ${workIcon}
      </div>
    `;
    return L.divIcon({
      html: iconHtml,
      className: 'custom-street-marker',
      iconSize: [32, 32],
      iconAnchor: [16, 32],
      popupAnchor: [0, -32]
    });
  };

  const handleDetailsClick = (street) => {
    setSelectedStreet(street);
    setCurrentMediaIndex(0);
    setIsDetailsOpen(true);
  };

  const nextMedia = () => {
    if (selectedStreet && selectedStreet.media) {
      setCurrentMediaIndex((prevIndex) => (prevIndex + 1) % selectedStreet.media.length);
    }
  };

  const prevMedia = () => {
    if (selectedStreet && selectedStreet.media) {
      setCurrentMediaIndex((prevIndex) => (prevIndex - 1 + selectedStreet.media.length) % selectedStreet.media.length);
    }
  };

  const statusInfo = selectedStreet ? getStatusInfo(selectedStreet.status, selectedStreet.pavement_type) : {};

  return (
    <div className="w-full h-full bg-secondary rounded-lg overflow-hidden relative">
      <MapContainer center={FLORESTA_COORDS} zoom={INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
        <MapController mapRef={mapRef} />
        <MapScrollLock mode={mode} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {streets.map(street => {
          const streetStatusInfo = getStatusInfo(street.status, street.pavement_type);
          return (
            street.location &&
            <Marker
              key={street.id}
              ref={(el) => { if (el) markerRefs.current[street.id] = el; }}
              position={[street.location.lat, street.location.lng]}
              icon={createStreetMarkerIcon(street)}
            >
              <Popup className="custom-popup" minWidth={200}>
                <div className="p-1">
                  <div className="mb-2">
                    <h3 className="font-bold text-lg text-tc-red leading-tight">{street.name}</h3>
                  </div>

                  <div className="mt-2">
                    <Button 
                      size="sm"
                      className="w-full justify-start"
                      onClick={() => handleDetailsClick(street)}
                    >
                      <Info className="w-4 h-4 mr-2" /> Ver mais detalhes
                    </Button>
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}
      </MapContainer>

      <div className="absolute top-4 right-4 z-[800]">
        <MapModeToggle />
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
              {selectedStreet?.paving_date && (
                <span className="text-sm bg-secondary text-secondary-foreground px-3 py-1.5 rounded-full font-medium">
                  Realizado em: {new Date(selectedStreet.paving_date).toLocaleDateString()}
                </span>
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

            {/* Main Media Viewer */}
            <div className="relative bg-secondary rounded-lg overflow-hidden aspect-video w-full shadow-inner border border-border/50">
              {selectedStreet?.media && selectedStreet.media.length > 0 ? (
                <>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentMediaIndex}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="w-full h-full relative group"
                    >
                      {selectedStreet.media[currentMediaIndex].type === 'photo' ? (
                        <img src={selectedStreet.media[currentMediaIndex].url} alt={selectedStreet.media[currentMediaIndex].description} className="w-full h-full object-contain bg-black/5" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-black">
                            <a href={selectedStreet.media[currentMediaIndex].url} target="_blank" rel="noopener noreferrer" className="text-white flex flex-col items-center hover:scale-105 transition-transform">
                            <Video className="w-16 h-16 mb-4 opacity-80" />
                            <span className="text-lg font-medium">Assistir vídeo</span>
                          </a>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent p-6 pt-16 text-white">
                        <p className="text-lg font-medium truncate">{selectedStreet.media[currentMediaIndex].description}</p>
                        <p className="text-sm opacity-80">{selectedStreet.media[currentMediaIndex].date}</p>
                      </div>
                    </motion.div>
                  </AnimatePresence>
                  
                  {selectedStreet.media.length > 1 && (
                    <>
                      <button onClick={prevMedia} className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-3 rounded-full transition-colors backdrop-blur-sm">
                        <ChevronLeft className="w-6 h-6" />
                      </button>
                      <button onClick={nextMedia} className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/30 hover:bg-black/50 text-white p-3 rounded-full transition-colors backdrop-blur-sm">
                        <ChevronRight className="w-6 h-6" />
                      </button>
                      <div className="absolute top-4 right-4 bg-black/50 text-white text-sm px-3 py-1.5 rounded-full backdrop-blur-sm font-medium">
                        {currentMediaIndex + 1} / {selectedStreet.media.length}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground p-8 text-center">
                  <ImageIcon className="w-16 h-16 mb-4 opacity-20" />
                  <p className="text-lg font-medium">Nenhuma mídia disponível</p>
                  <p className="text-sm opacity-70 mt-2">Não há fotos ou vídeos registrados para esta rua.</p>
                </div>
              )}
            </div>

            {/* Thumbnail Gallery */}
            {selectedStreet?.media && selectedStreet.media.length > 1 && (
              <div>
                <h4 className="font-semibold mb-4 flex items-center gap-2 text-muted-foreground">
                  <ImageIcon className="w-5 h-5" /> Galeria Completa
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                  {selectedStreet.media.map((item, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentMediaIndex(index)}
                      className={`relative aspect-video rounded-lg overflow-hidden border-2 transition-all ${currentMediaIndex === index ? 'border-tc-red ring-2 ring-tc-red/20 opacity-100 scale-[1.02]' : 'border-transparent hover:border-muted-foreground/30 opacity-70 hover:opacity-100'}`}
                    >
                      {item.type === 'photo' ? (
                        <img src={item.url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-black flex items-center justify-center">
                          <Video className="w-8 h-8 text-white/70" />
                        </div>
                      )}
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
