import React, { useEffect, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { FLORESTA_COORDS, INITIAL_ZOOM } from '@/config/mapConfig';
import { geocodeCity } from '@/lib/geocodeCity';
import { useCityView } from '@/contexts/CityContext';
import { formatCurrency, formatAddressWithNumber } from '@/lib/utils';
import { createMapPin, ICON_SIZE } from '@/components/map/pinIcon';
import MapDisplayControls, {
  CurrentLocationMarker,
  MAP_LAYER,
  MapBaseLayer,
} from '@/components/map/MapDisplayControls';

// Casa: nao ha equivalente no design system (os icones de la sao por categoria
// de bronca), entao fica inline. O traco herda a cor do corpo via currentColor,
// que createMapPin define a partir do token de fg.
const HouseIcon = () => (
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
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M9 22V12h6v10" />
  </svg>
);

// Verde para imovel ativo, cinza para inativo. Tokens proprios (--pin-rental-*)
// em vez dos de categoria: assim mudar a cor de uma categoria de bronca nao
// mexe nesta tela sem querer.
const createPropertyMarkerIcon = (isActive) =>
  createMapPin({
    cacheKey: `rental|${isActive ? 'active' : 'inactive'}`,
    bgToken: isActive ? '--pin-rental-active-bg' : '--pin-rental-inactive-bg',
    fgToken: isActive ? '--pin-rental-active-fg' : '--pin-rental-inactive-fg',
    icon: <HouseIcon />,
  });

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

const MapController = ({ mapRef }) => {
  const map = useMap();
  mapRef.current = map;
  return null;
};

export default function RentalPropertiesMapView({ properties, onSelectProperty }) {
  const { city: activeCity } = useCityView();
  const list = properties || [];
  const mapRef = useRef(null);
  const [mapLayer, setMapLayer] = useState(MAP_LAYER.STANDARD);
  const [currentLocation, setCurrentLocation] = useState(null);

  return (
    <div className="relative w-full h-full bg-background rounded-xl overflow-hidden">
      <MapContainer center={FLORESTA_COORDS} zoom={INITIAL_ZOOM} scrollWheelZoom={true} className="w-full h-full">
        <MapController mapRef={mapRef} />
        <FitToProperties properties={list} activeCity={activeCity} />
        <MapBaseLayer layer={mapLayer} />
        <CurrentLocationMarker position={currentLocation} />
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
      <MapDisplayControls
        mapRef={mapRef}
        layer={mapLayer}
        onLayerChange={setMapLayer}
        onLocated={setCurrentLocation}
        className="absolute right-4 top-4 z-[800]"
      />
    </div>
  );
}
