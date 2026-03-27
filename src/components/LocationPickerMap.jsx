import React, { useState, useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import 'leaflet/dist/leaflet.css';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Corrige o problema do ícone padrão do Leaflet
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});


// Controller to get a reference to the map instance
const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

// Draggable marker component
const DraggableMarker = ({ position, onPositionChange }) => {
  const markerRef = useRef(null);

  const eventHandlers = {
    dragend() {
      const marker = markerRef.current;
      if (marker != null) {
        onPositionChange(marker.getLatLng());
      }
    },
  };

  return (
    <Marker
      draggable={true}
      eventHandlers={eventHandlers}
      position={position}
      ref={markerRef}
    />
  );
};

// Existing marker icon (less prominent)
const existingMarkerIcon = L.divIcon({
  html: `<div style="width: 12px; height: 12px; background-color: #6b7280; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 5px rgba(0,0,0,0.5);"></div>`,
  className: 'existing-marker',
  iconSize: [12, 12],
  iconAnchor: [6, 6]
});

const createPoleIcon = ({ isSelected, distanceLabel, showBrokenX }) =>
  L.divIcon({
    html: `
      <div style="position: relative; width: 44px; height: 64px;">
        <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); padding: 2px 6px; border-radius: 999px; font-size: 11px; line-height: 14px; font-weight: 700; color: ${isSelected ? '#ffffff' : '#111827'}; background: ${isSelected ? '#dc2626' : 'rgba(255,255,255,0.95)'}; border: 1px solid ${isSelected ? '#dc2626' : 'rgba(17,24,39,0.15)'}; box-shadow: 0 6px 14px rgba(0,0,0,0.18); white-space: nowrap;">
          ${distanceLabel || ''}
        </div>
        <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); width: 44px; height: 52px; display: flex; align-items: center; justify-content: center;">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 70 80" width="44" height="52" style="display:block; filter: drop-shadow(0 10px 18px rgba(0,0,0,0.18));">
            <rect x="27" y="30" width="6" height="50" rx="2" fill="#888780"/>
            <path d="M33,35 Q52,35 52,50" fill="none" stroke="#888780" stroke-width="6" stroke-linecap="round"/>
            <ellipse cx="52" cy="57" rx="14" ry="11" fill="#D3D1C7" stroke="#B4B2A9" stroke-width="1.5"/>
            ${(isSelected || showBrokenX) ? `
              <line x1="42" y1="47" x2="62" y2="67" stroke="#E24B4A" stroke-width="3" stroke-linecap="round"/>
              <line x1="62" y1="47" x2="42" y2="67" stroke="#E24B4A" stroke-width="3" stroke-linecap="round"/>
            ` : ''}
          </svg>
        </div>
      </div>
    `,
    className: 'pole-marker',
    iconSize: [44, 64],
    iconAnchor: [22, 64],
    popupAnchor: [0, -64],
  });

// Component to handle map clicks
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
};

const LocationPickerMap = ({ onLocationChange, initialPosition, existingMarkers = [], overlayMarkers = [], selectedOverlayMarkerId = null, onOverlayMarkerSelect, focusOverlayOnSelect = true }) => {
  const [position, setPosition] = useState(initialPosition || FLORESTA_COORDS);
  const mapRef = useRef();
  const initialZoom = initialPosition ? 19 : INITIAL_ZOOM;

  useEffect(() => {
    // If an initial position is provided, set the marker and center the map
    if (initialPosition) {
      setPosition(initialPosition);
      if (mapRef.current) {
        mapRef.current.setView(initialPosition, 19, { animate: false });
      }
    }
  }, [initialPosition]);

  const handlePositionChange = (newPosition) => {
    setPosition(newPosition);
    onLocationChange(newPosition);
  };
  
  return (
    <MapContainer center={position} zoom={initialZoom} maxZoom={19} scrollWheelZoom={true} className="w-full h-full">
      <MapController mapRef={mapRef} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
      />
      <MapClickHandler onMapClick={handlePositionChange} />
      <DraggableMarker position={position} onPositionChange={handlePositionChange} />
      {overlayMarkers.map((m) => (
        m?.location && (
          <Marker
            key={m.id}
            position={[m.location.lat, m.location.lng]}
            icon={createPoleIcon({ isSelected: selectedOverlayMarkerId === m.id, distanceLabel: m.distanceLabel, showBrokenX: !!m.isBroken })}
            eventHandlers={{
              click() {
                if (focusOverlayOnSelect && mapRef.current) {
                  try {
                    mapRef.current.flyTo([m.location.lat, m.location.lng], mapRef.current.getZoom(), { animate: true, duration: 0.5 });
                  } catch {}
                }
                if (onOverlayMarkerSelect) onOverlayMarkerSelect(m);
              },
            }}
          >
            <Popup>
              <span className="font-semibold">{m.title || m.name || 'Poste'}</span><br />
              <span className="text-xs text-muted-foreground">{m.distanceLabel || ''}</span>
            </Popup>
          </Marker>
        )
      ))}
      {existingMarkers.map(marker => (
        marker.location && (
          <Marker 
            key={marker.id} 
            position={[marker.location.lat, marker.location.lng]}
            icon={existingMarkerIcon}
          >
            <Popup>
              <span className="font-semibold">{marker.name}</span><br />
              <span className="text-xs text-muted-foreground">{marker.bairro?.name || 'Bairro não informado'}</span>
            </Popup>
          </Marker>
        )
      ))}
    </MapContainer>
  );
};

export default LocationPickerMap;
