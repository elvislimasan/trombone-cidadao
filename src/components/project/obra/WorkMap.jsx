import { MapContainer, Marker, Popup, TileLayer } from "react-leaflet";
import L from "leaflet";
import { useMemo } from "react";
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
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Marker position={position}>
          <Popup>{label || "Localização da Obra"}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
}

