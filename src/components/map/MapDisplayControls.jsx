import { useState } from 'react';
import { CircleMarker, TileLayer } from 'react-leaflet';
import { Layers, Loader2, LocateFixed } from 'lucide-react';

import ThemedTileLayer from '@/components/map/ThemedTileLayer';
import { showAppError } from '@/lib/appError';

export const MAP_LAYER = {
  STANDARD: 'standard',
  SATELLITE: 'satellite',
};

const SATELLITE_URL =
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';

export function MapBaseLayer({ layer = MAP_LAYER.STANDARD }) {
  if (layer === MAP_LAYER.SATELLITE) {
    return (
      <TileLayer
        key="satellite"
        url={SATELLITE_URL}
        attribution="&copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community"
        maxZoom={18}
        maxNativeZoom={18}
      />
    );
  }

  return <ThemedTileLayer key="standard" maxZoom={19} />;
}

export function CurrentLocationMarker({ position }) {
  if (!position) return null;

  return (
    <CircleMarker
      center={[position.lat, position.lng]}
      radius={8}
      pathOptions={{
        color: '#ffffff',
        weight: 3,
        fillColor: '#2563eb',
        fillOpacity: 1,
      }}
    />
  );
}

// A aparência dos botões flutuantes sobre o mapa. Exportada porque nem todo
// mapa quer o conjunto inteiro: a home mostra só a troca de camada, e sem isso
// ela teria de recriar o estilo — que é como dois botões iguais começam a
// divergir.
export const BOTAO_DE_MAPA =
  'inline-flex h-11 w-11 items-center justify-center rounded-full border border-edge-default bg-surface-raised/95 text-content-primary shadow-lg backdrop-blur-sm transition-[background-color,transform] hover:bg-surface-subtleHover active:scale-95';

/**
 * Só a troca entre mapa e satélite.
 *
 * Fica separada do bloco completo porque "ver por satélite" e "ir para minha
 * localização" respondem a perguntas diferentes, e um mapa pode querer uma sem
 * a outra. O que NÃO pode é a url do satélite viver em dois lugares — ela mora
 * em `MapBaseLayer`, logo acima, e os dois caminhos passam por lá.
 */
export function MapLayerToggle({ layer, onLayerChange, className = '' }) {
  const satellite = layer === MAP_LAYER.SATELLITE;

  return (
    <button
      type="button"
      className={`${BOTAO_DE_MAPA} ${className}`}
      onClick={() => onLayerChange?.(satellite ? MAP_LAYER.STANDARD : MAP_LAYER.SATELLITE)}
      aria-label={satellite ? 'Usar mapa padrão' : 'Usar mapa de satélite'}
      title={satellite ? 'Mapa padrão' : 'Satélite'}
    >
      <Layers className="h-5 w-5" aria-hidden="true" />
    </button>
  );
}

export default function MapDisplayControls({
  mapRef,
  layer,
  onLayerChange,
  onLocated,
  className = '',
}) {
  const [locating, setLocating] = useState(false);

  const locate = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showAppError({
        title: 'Localização indisponível',
        description: 'Este dispositivo não oferece acesso à localização atual.',
      });
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const position = { lat: coords.latitude, lng: coords.longitude };
        onLocated?.(position);
        try {
          mapRef?.current?.flyTo([position.lat, position.lng], 17, {
            animate: true,
            duration: 0.6,
          });
        } catch {}
      },
      () => {
        setLocating(false);
        showAppError({
          title: 'Não foi possível obter sua localização',
          description: 'Confira a permissão de localização do aplicativo e tente novamente.',
        });
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  };

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <MapLayerToggle layer={layer} onLayerChange={onLayerChange} />

      <button
        type="button"
        className={BOTAO_DE_MAPA}
        onClick={locate}
        disabled={locating}
        aria-label="Ir para minha localização"
        title="Minha localização"
      >
        {locating ? (
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
        ) : (
          <LocateFixed className="h-5 w-5" aria-hidden="true" />
        )}
      </button>
    </div>
  );
}
