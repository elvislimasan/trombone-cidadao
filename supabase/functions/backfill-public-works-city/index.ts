import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const extractCityUF = (data: Record<string, any>) => {
  const a = data?.address || {};
  const city = a.city || a.town || a.village || a.municipality || a.county || null;
  const uf = (a["ISO3166-2-lvl4"] || "").split("-")[1] || a.state_code || null;
  return { city, uf };
};

const reverseGeocode = async (lat: number, lng: number, zoom: number) => {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", String(zoom));
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "pt-BR");
  const ua = Deno.env.get("APP_USER_AGENT") || "TromboneCidadao/1.0";
  const res = await fetch(url.toString(), { headers: { "User-Agent": ua, "Accept": "application/json" } });
  if (!res.ok) return null;
  return extractCityUF(await res.json());
};

const parseCityId = (raw: unknown): number | null => {
  if (raw === null || raw === undefined) return null;
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    // Busca obras sem city_id e com location (PostGIS retorna GeoJSON via to_jsonb? — usamos RPC simples)
    const { data: works, error } = await admin
      .from("public_works")
      .select("id, location")
      .is("city_id", null)
      .not("location", "is", null);
    if (error) throw error;

    let resolved = 0;
    const unresolved: string[] = [];

    for (const w of works || []) {
      // location vem como GeoJSON { type:'Point', coordinates:[lng,lat] } ou string WKB.
      const coords = (w as any).location?.coordinates;
      const lng = Array.isArray(coords) ? Number(coords[0]) : NaN;
      const lat = Array.isArray(coords) ? Number(coords[1]) : NaN;
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) { unresolved.push(w.id); continue; }

      let cityId: number | null = null;
      for (const zoom of [18, 10]) {
        const geo = await reverseGeocode(lat, lng, zoom);
        if (geo?.city && geo?.uf) {
          const { data: cid } = await admin.rpc("match_city", { p_name: geo.city, p_uf: geo.uf });
          cityId = parseCityId(cid);
          if (cityId) break;
        }
        await new Promise((r) => setTimeout(r, 1100)); // respeita rate limit do Nominatim
      }

      if (cityId) {
        await admin.from("public_works").update({ city_id: cityId }).eq("id", w.id);
        resolved++;
      } else {
        unresolved.push(w.id);
      }
    }

    return new Response(
      JSON.stringify({ total: (works || []).length, resolved, unresolved }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500,
    });
  }
});
