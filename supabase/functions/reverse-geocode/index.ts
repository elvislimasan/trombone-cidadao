import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const STATE_NAME_TO_UF: Record<string, string> = {
  "Acre": "AC", "Alagoas": "AL", "Amapá": "AP", "Amazonas": "AM",
  "Bahia": "BA", "Ceará": "CE", "Distrito Federal": "DF",
  "Espírito Santo": "ES", "Goiás": "GO", "Maranhão": "MA",
  "Mato Grosso": "MT", "Mato Grosso do Sul": "MS", "Minas Gerais": "MG",
  "Pará": "PA", "Paraíba": "PB", "Paraná": "PR", "Pernambuco": "PE",
  "Piauí": "PI", "Rio de Janeiro": "RJ", "Rio Grande do Norte": "RN",
  "Rio Grande do Sul": "RS", "Rondônia": "RO", "Roraima": "RR",
  "Santa Catarina": "SC", "São Paulo": "SP", "Sergipe": "SE",
  "Tocantins": "TO",
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

const extractCityUF = (payload: Record<string, unknown>): { city: string | null; state_uf: string | null } => {
  const address = (payload.address ?? {}) as Record<string, unknown>

  // Nominatim com zoom alto às vezes coloca o bairro em `city` e a cidade real em `county`.
  // Prioridade: city > town > village > county (microrregião/município) > municipality
  const rawCity = String(address.city ?? "").trim()
  const rawTown = String(address.town ?? "").trim()
  const rawVillage = String(address.village ?? "").trim()
  const rawCounty = String(address.county ?? "").trim()
  const rawMunicipality = String(address.municipality ?? "").trim()

  // `county` no Brasil geralmente é o nome do município — usar como fallback seguro
  const city = rawCity || rawTown || rawVillage || rawCounty || rawMunicipality || null

  let state_uf: string | null = null
  const iso = String(address["ISO3166-2-lvl4"] ?? "").trim()
  if (iso.includes("-")) {
    state_uf = iso.split("-")[1] ?? null
  }
  if (!state_uf) {
    const stateName = String(address.state ?? "").trim()
    state_uf = STATE_NAME_TO_UF[stateName] ?? null
  }
  return { city, state_uf }
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
    const userAgent = Deno.env.get("APP_USER_AGENT") || "TromboneCidadao/1.0"

    const makeUrl = (z: number) => {
      const u = new URL("https://nominatim.openstreetmap.org/reverse")
      u.searchParams.set("format", "jsonv2")
      u.searchParams.set("lat", String(latNum))
      u.searchParams.set("lon", String(lngNum))
      u.searchParams.set("zoom", String(z))
      u.searchParams.set("addressdetails", "1")
      u.searchParams.set("accept-language", "pt-BR")
      return u.toString()
    }

    const headers = { "User-Agent": userAgent, "Accept": "application/json" }

    // Zoom detalhado para o endereço + zoom de município (10) para cidade confiável — em paralelo
    const [resDetail, resCity] = await Promise.all([
      fetch(makeUrl(zoomNum), { headers }),
      fetch(makeUrl(10), { headers }),
    ])

    const data = await resDetail.json()
    if (!resDetail.ok) {
      return new Response(
        JSON.stringify({ error: "reverse_geocode_failed", details: data }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }

    const address = buildAddress(data as Record<string, unknown>)

    // Usa o resultado de zoom=10 para extrair cidade — sempre retorna o município correto
    const cityData = resCity.ok ? await resCity.json() : data
    const { city, state_uf } = extractCityUF(cityData as Record<string, unknown>)

    // Bairro (do resultado detalhado, zoom alto): suburb/neighbourhood/quarter.
    // city_district só é um bairro de fato quando não coincide com o nome do
    // município — em zonas rurais o Nominatim às vezes repete lá o nome da
    // própria cidade, o que criaria um "bairro" enganoso com nome de cidade.
    const addrDetail = ((data as Record<string, unknown>)?.address ?? {}) as Record<string, unknown>
    const rawCityDistrict = String(addrDetail.city_district ?? "").trim()
    const cityDistrict = rawCityDistrict && rawCityDistrict.toLowerCase() !== (city ?? "").trim().toLowerCase()
      ? rawCityDistrict
      : ""
    const suburb =
      String(addrDetail.suburb ?? addrDetail.neighbourhood ?? addrDetail.quarter ?? cityDistrict ?? "").trim() || null

    return new Response(
      JSON.stringify({ address, city, state_uf, suburb, raw: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error?.message || "unknown_error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})

