import { MapBaseLayer, MapLayerToggle, MAP_LAYER } from '@/components/map/MapDisplayControls';
import { MapContainer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import { useMemo, useState } from "react";
import "leaflet/dist/leaflet.css";
import { FLORESTA_COORDS } from "@/config/mapConfig";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

export function WorkMap({ location, label }) {
  const [camada, setCamada] = useState(MAP_LAYER.STANDARD);
  const position = useMemo(() => {
    if (location) {
      if (typeof location === "string") {
        const match = location.match(/POINT\(([-\d.]+) ([-\d.]+)\)/);
        if (match) {
          return [parseFloat(match[2]), parseFloat(match[1])];
        }
      } else if (typeof location === "object" && Array.isArray(location.coordinates)) {
        return [location.coordinates[1], location.coordinates[0]];
      }
    }
    return FLORESTA_COORDS;
  }, [location]);

  return (
    <div className="h-64 w-full rounded-lg overflow-hidden relative z-0">
      <MapContainer center={position} zoom={15} style={{ height: "100%", width: "100%" }} scrollWheelZoom={false}>
        <MapBaseLayer layer={camada} />
        <Marker position={position}>
          <Popup>{label || "Localização da Obra"}</Popup>
        </Marker>
      </MapContainer>

      {/* Numa obra, o satélite é o que deixa ver o terreno em volta — se é
          canteiro, se é rua aberta, o que existe ao lado. O mapa padrão só
          mostra a linha da via. */}
      <div className="absolute right-2 top-2 z-[800]">
        <MapLayerToggle layer={camada} onLayerChange={setCamada} className="h-9 w-9" />
      </div>
    </div>
  );
}

