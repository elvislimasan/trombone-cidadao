import { useMemo } from "react";
import ThemedTileLayer from "@/components/map/ThemedTileLayer";
import { MapContainer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapPin, Navigation } from "lucide-react";
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
    <div className="h-48 w-full rounded-2xl overflow-hidden relative z-0 shadow-[0_2px_8px_-2px_rgba(25,28,30,0.06)]">
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
  if (variant === "desktop") {
    return (
      <div className="hidden lg:block bg-white rounded-2xl shadow-[0_12px_32px_-4px_rgba(25,28,30,0.08)] overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[#f2f4f7] text-[#b61722]">
            <MapPin className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <h3 className="font-bold text-[#191c1e] text-sm">Localização</h3>
        </div>
        <div className="h-48 mx-3 rounded-xl overflow-hidden">
          <ReportMap location={location} address={address} />
        </div>
        <div className="px-4 py-4 bg-[#f7f9fc] space-y-3">
          <div className="flex items-start gap-3">
            <MapPin className="w-4 h-4 text-[#b61722] mt-0.5 shrink-0" strokeWidth={1.5} />
            <div>
              <span className="text-[10px] font-bold text-[#6b7280] uppercase tracking-wider block">
                Endereço
              </span>
              <p className="text-sm font-medium text-[#191c1e] leading-tight">
                {address || "Não informado"}
              </p>
            </div>
          </div>
          {location?.lat && location?.lng && (
            <button
              onClick={onNavigate}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-[#b61722] hover:bg-[#9f1520] text-white text-sm font-semibold transition-colors"
            >
              <Navigation className="w-4 h-4" strokeWidth={1.5} />
              Traçar Rota
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="lg:hidden">
      <div className="bg-[#f2f4f7] rounded-2xl overflow-hidden">
        <div className="px-4 pt-4 pb-3 flex items-center gap-3">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-white text-[#b61722] shadow-[0_2px_8px_-2px_rgba(25,28,30,0.08)]">
            <MapPin className="w-4 h-4" strokeWidth={1.5} />
          </div>
          <h3 className="font-bold text-[#191c1e] text-sm">Localização</h3>
        </div>
        <div className="h-48 mx-3 rounded-xl overflow-hidden">
          <ReportMap location={location} address={address} />
        </div>
        {address && (
          <div className="mt-3 flex items-start gap-2 px-4">
            <MapPin className="w-4 h-4 text-[#b61722] mt-0.5 shrink-0" strokeWidth={1.5} />
            <p className="text-sm font-medium text-[#191c1e] leading-tight">
              {address}
            </p>
          </div>
        )}
        {location?.lat && location?.lng && (
          <div className="px-3 py-3">
            <button
              onClick={onNavigate}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-full bg-[#b61722] hover:bg-[#9f1520] text-white text-sm font-semibold transition-colors active:scale-[0.98]"
            >
              <Navigation className="w-4 h-4" strokeWidth={1.5} />
              Traçar Rota
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportLocation;
