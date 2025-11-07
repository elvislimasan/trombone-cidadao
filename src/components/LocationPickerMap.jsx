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

// Component to handle map clicks
const MapClickHandler = ({ onMapClick }) => {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng);
    },
  });
  return null;
};

const LocationPickerMap = ({ onLocationChange, initialPosition, existingMarkers = [] }) => {
  const [position, setPosition] = useState(initialPosition || FLORESTA_COORDS);
  const mapRef = useRef();

  useEffect(() => {
    // If an initial position is provided, set the marker and center the map
    if (initialPosition) {
      setPosition(initialPosition);
      if (mapRef.current) {
        mapRef.current.flyTo(initialPosition, 18);
      }
    }
  }, [initialPosition]);

  const handlePositionChange = (newPosition) => {
    setPosition(newPosition);
    onLocationChange(newPosition);
  };
  
  return (
    <MapContainer center={position} zoom={INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
      <MapController mapRef={mapRef} />
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <MapClickHandler onMapClick={handlePositionChange} />
      <DraggableMarker position={position} onPositionChange={handlePositionChange} />
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
