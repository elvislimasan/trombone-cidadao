
import React, { useState, useImperativeHandle, forwardRef, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Route as Road, ThumbsDown, ChevronLeft, ChevronRight, Video, Image as ImageIcon, HardHat, Construction } from 'lucide-react';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

const PavementMapView = forwardRef(({ streets, onWorkClick }, ref) => {
  const [selectedStreet, setSelectedStreet] = useState(null);
  const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
  const mapRef = useRef();

  useImperativeHandle(ref, () => ({
    goToLocation: (location) => {
      if (mapRef.current) {
        mapRef.current.flyTo([location.lat, location.lng], 18);
        const street = streets.find(s => s.location && s.location.lat === location.lat && s.location.lng === location.lng);
        if (street) {
          handleSelectStreet(street);
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

  const handleSelectStreet = (street) => {
    setSelectedStreet(street);
    setCurrentMediaIndex(0);
  };

  const handleClose = () => {
    setSelectedStreet(null);
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {streets.map(street => (
          street.location &&
          <Marker
            key={street.id}
            position={[street.location.lat, street.location.lng]}
            icon={createStreetMarkerIcon(street)}
            eventHandlers={{
              click: () => {
                handleSelectStreet(street);
              },
            }}
          >
            <Popup>{street.name}</Popup>
          </Marker>
        ))}
      </MapContainer>

      <AnimatePresence>
        {selectedStreet && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="absolute bottom-4 left-4 right-4 bg-card p-4 rounded-lg shadow-2xl border border-border z-[1000] grid grid-cols-1 md:grid-cols-2 gap-4"
          >
            <button onClick={handleClose} className="absolute top-2 right-2 text-muted-foreground hover:text-foreground z-20">
              <X className="w-5 h-5" />
            </button>
            
            <div>
              <h3 className="font-bold text-lg mb-2 text-tc-red">{selectedStreet.name}</h3>
              {selectedStreet.bairro && <p className="text-sm text-muted-foreground mb-2">{selectedStreet.bairro.name}</p>}
              <div className="flex items-center gap-2 mb-2">
                <span className={`flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-full text-white ${statusInfo.color}`}>
                  {statusInfo.icon}
                  {statusInfo.text}
                </span>
              </div>
              {selectedStreet.paving_date && (
                <p className="text-xs text-muted-foreground mt-1">Ano da Pavimentação: {new Date(selectedStreet.paving_date).getFullYear()}</p>
              )}
              {selectedStreet.work_id && (
                <button onClick={() => onWorkClick(selectedStreet.work_id)} className="mt-3 text-sm text-blue-400 hover:text-blue-300 flex items-center gap-2">
                  <HardHat className="w-4 h-4" /> Ver detalhes da obra
                </button>
              )}
            </div>

            <div className="relative w-full h-48 md:h-full bg-secondary rounded-md overflow-hidden">
              {selectedStreet.media && selectedStreet.media.length > 0 ? (
                <>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentMediaIndex}
                      initial={{ opacity: 0, x: 50 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -50 }}
                      transition={{ duration: 0.3 }}
                      className="w-full h-full"
                    >
                      {selectedStreet.media[currentMediaIndex].type === 'photo' ? (
                        <img src={selectedStreet.media[currentMediaIndex].url} alt={selectedStreet.media[currentMediaIndex].description} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-black">
                           <a href={selectedStreet.media[currentMediaIndex].url} target="_blank" rel="noopener noreferrer" className="text-white flex flex-col items-center">
                            <Video className="w-12 h-12 mb-2" />
                            <span className="text-sm">Assistir vídeo</span>
                          </a>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                  <div className="absolute bottom-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded">
                    <p>{selectedStreet.media[currentMediaIndex].description}</p>
                    <p>Data: {selectedStreet.media[currentMediaIndex].date}</p>
                  </div>
                  {selectedStreet.media.length > 1 && (
                    <>
                      <button onClick={prevMedia} className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/30 text-white p-1 rounded-full hover:bg-black/50">
                        <ChevronLeft className="w-5 h-5" />
                      </button>
                      <button onClick={nextMedia} className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/30 text-white p-1 rounded-full hover:bg-black/50">
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </>
                  )}
                </>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-muted-foreground">
                  <ImageIcon className="w-10 h-10 mb-2" />
                  <p className="text-sm">Nenhuma mídia disponível</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default PavementMapView;
