import { useMemo } from "react";
import ThemedTileLayer from "@/components/map/ThemedTileLayer";
import { MapContainer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import Icon from "@/design-system/icons";
import { FLORESTA_COORDS } from "@/config/mapConfig";

// Fix for Leaflet default icon
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

// Extraido de src/pages/ReportPage.jsx (refatoracao pura, task 2 da fase 2).
// Mapa Leaflet + endereco + botao "abrir no mapa" da bronca.
// Redesenhado na task 6 da fase 2: cantos arredondados dentro do container
// (nao no leaflet.css, que e compartilhado com Mapa/Pavimentacao/Obras) --
// ThemedTileLayer ja troca os tiles conforme o tema, entao a "moldura clara"
// no escuro vinha do card em volta (bg-white), nao do mapa em si.
export const ReportMap = ({ location, address }) => {
  const position = useMemo(() => {
    if (
      location &&
      typeof location.lat === "number" &&
      typeof location.lng === "number"
    ) {
      return [location.lat, location.lng];
    }
    return FLORESTA_COORDS;
  }, [location]);

  return (
    <div className="h-48 w-full rounded-2xl overflow-hidden relative z-0">
      <MapContainer
        center={position}
        zoom={15}
        style={{ height: "100%", width: "100%" }}
        scrollWheelZoom={false}
      >
        <ThemedTileLayer />
        <Marker position={position}>
          <Popup>{address || "Localização da Bronca"}</Popup>
        </Marker>
      </MapContainer>
    </div>
  );
};

// variant "mobile": bloco inline exibido so em telas pequenas (lg:hidden)
// variant "desktop": card da sidebar exibido so em telas grandes (hidden lg:block)
const ReportLocation = ({ location, address, onNavigate, variant = "mobile" }) => {
  const hasCoords = typeof location?.lat === "number" && typeof location?.lng === "number";

  const wrapperClass =
    variant === "desktop"
      ? "hidden lg:block bg-surface-raised border border-edge-subtle rounded-2xl overflow-hidden"
      : "lg:hidden bg-surface-raised border border-edge-subtle rounded-2xl overflow-hidden";

  return (
    <div className={wrapperClass}>
      <div className="px-4 pt-4 pb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="location" size={16} className="text-brand" />
          <h2 className="text-xs font-bold text-content-primary">Localização</h2>
        </div>
        {hasCoords && (
          <button
            type="button"
            onClick={onNavigate}
            className="inline-flex items-center gap-1 text-2xs font-semibold text-brand hover:underline"
          >
            Abrir no mapa
            <Icon name="chevronright" size={12} />
          </button>
        )}
      </div>
      <div className="h-48 mx-3 rounded-xl overflow-hidden">
        <ReportMap location={location} address={address} />
      </div>
      {address && (
        <div className="px-4 py-3 flex items-start gap-2">
          <Icon name="location" size={14} className="text-brand mt-0.5 flex-shrink-0" />
          <p className="text-xs text-content-secondary leading-relaxed">{address}</p>
        </div>
      )}
    </div>
  );
};

export default ReportLocation;
