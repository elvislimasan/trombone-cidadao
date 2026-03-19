import { MapPin } from "lucide-react";
import { WorkMap } from "@/components/project/obra/WorkMap";

export function ObraLocation({ address, neighborhood, city, state, coordinates, location }) {
  return (
    <section className="bg-card rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-5 w-5 text-red-500" />
          <h2 className="text-lg font-semibold">Localização</h2>
        </div>

        <WorkMap location={location} label={neighborhood || "Localização da Obra"} />

        <div className="bg-muted/30 rounded-lg p-4 text-sm">
          <div className="font-medium text-foreground">{address || "Endereço não informado"}</div>
          <div className="text-muted-foreground mt-1">
            {[neighborhood, city, state].filter(Boolean).join(", ")}
          </div>
          {coordinates?.lat && coordinates?.lng ? (
            <div className="text-muted-foreground mt-2">
              {coordinates.lat}, {coordinates.lng}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
