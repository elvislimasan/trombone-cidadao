import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const buildAddress = (payload: Record<string, unknown>) => {
  const address = (payload.address ?? {}) as Record<string, unknown>
  const road = String(address.road ?? address.pedestrian ?? address.footway ?? "").trim()
  const houseNumber = String(address.house_number ?? "").trim()
  const suburb = String(address.suburb ?? address.neighbourhood ?? address.quarter ?? "").trim()
  const city = String(address.city ?? address.town ?? address.village ?? address.municipality ?? "").trim()
  const state = String(address.state ?? "").trim()

  const firstLine = [road, houseNumber].filter(Boolean).join(", ")
  const parts = [firstLine || "", suburb || "", city || "", state || ""].filter(Boolean)
  const compact = parts.join(" - ")

  const displayName = String(payload.display_name ?? "").trim()
  return compact || displayName || null
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "method_not_allowed" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 405 },
      )
    }

    const { lat, lng, zoom } = await req.json()
    const latNum = Number(lat)
    const lngNum = Number(lng)

    if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) {
      return new Response(
        JSON.stringify({ error: "invalid_coordinates" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }

    const zoomNum = Number.isFinite(Number(zoom)) ? Math.max(3, Math.min(19, Number(zoom))) : 18
    const url = new URL("https://nominatim.openstreetmap.org/reverse")
    url.searchParams.set("format", "jsonv2")
    url.searchParams.set("lat", String(latNum))
    url.searchParams.set("lon", String(lngNum))
    url.searchParams.set("zoom", String(zoomNum))
    url.searchParams.set("addressdetails", "1")
    url.searchParams.set("accept-language", "pt-BR")

    const userAgent = Deno.env.get("APP_USER_AGENT") || "TromboneCidadao/1.0"

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": userAgent,
        "Accept": "application/json",
      },
    })

    const data = await res.json()
    if (!res.ok) {
      return new Response(
        JSON.stringify({ error: "reverse_geocode_failed", details: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }

    const address = buildAddress(data as Record<string, unknown>)

    return new Response(
      JSON.stringify({ address, raw: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error?.message || "unknown_error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})

