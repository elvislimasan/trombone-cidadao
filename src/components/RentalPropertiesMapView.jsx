import React, { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { geocodeCity } from '@/lib/geocodeCity';
import { useCity } from '@/contexts/CityContext';
import { formatCurrency, formatAddressWithNumber } from '@/lib/utils';

const createPropertyMarkerIcon = (isActive) => {
  const color = isActive ? '#16A34A' : '#6B7280';
  const html = `
    <div style="
      background-color: ${color};
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 50%;
      border: 2px solid white;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
    ">
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <path d="M9 22V12h6v10"/>
      </svg>
    </div>
  `;
  return L.divIcon({
    html,
    className: 'custom-rental-property-marker',
    iconSize: [36, 36],
    iconAnchor: [18, 36],
    popupAnchor: [0, -36],
  });
};

// Centraliza no conjunto de imóveis carregados, ou na cidade ativa quando
// não há imóveis para exibir (mesmo padrão de FitToWorks em WorksMapView).
const FitToProperties = ({ properties, activeCity }) => {
  const map = useMap();
  const lastKeyRef = useRef('');
  useEffect(() => {
    let cancelled = false;
    const pts = (properties || [])
      .filter((p) => p.location && Number.isFinite(p.location.lat) && Number.isFinite(p.location.lng))
      .map((p) => [p.location.lat, p.location.lng]);

    if (pts.length > 0) {
      const key = 'properties:' + pts.map((p) => p.join(',')).sort().join('|');
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
  }, [properties, activeCity, map]);
  return null;
};

export default function RentalPropertiesMapView({ properties, onSelectProperty }) {
  const { activeCity } = useCity();
  const list = properties || [];

  return (
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden">
      <MapContainer center={FLORESTA_COORDS} zoom={INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
        <FitToProperties properties={list} activeCity={activeCity} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {list.map((property) => (
          property.location && (
            <Marker
              key={property.id}
              position={[property.location.lat, property.location.lng]}
              icon={createPropertyMarkerIcon(property.is_active)}
            >
              <Popup>
                <div className="text-sm space-y-2 min-w-[160px]">
                  <div>
                    <p className="font-semibold">{property.title || property.department || formatAddressWithNumber(property.address, property.street_number)}</p>
                    <p className="text-xs text-muted-foreground">{formatAddressWithNumber(property.address, property.street_number)}</p>
                    {property.monthly_value != null && (
                      <p className="text-muted-foreground">{formatCurrency(property.monthly_value)}/mês</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => onSelectProperty?.(property)}
                    className="w-full rounded-md bg-tc-red text-white text-xs font-semibold py-1.5 hover:bg-tc-red/90 transition-colors"
                  >
                    Ver detalhes
                  </button>
                </div>
              </Popup>
            </Marker>
          )
        ))}
      </MapContainer>
    </div>
  );
}
