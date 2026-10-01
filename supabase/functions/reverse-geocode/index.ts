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
  const city = rawCity && rawCounty && rawCity !== rawCounty
    ? rawCounty
    : rawCity || rawTown || rawVillage || rawCounty || rawMunicipality || null

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

type GeocodeResult = {
  address: string | null
  city: string | null
  state_uf: string | null
  suburb: string | null
  raw: Record<string, unknown>
}

// Uma mesma posição é consultada ao preencher o endereço e novamente no envio.
// O cache reduz chamadas aos serviços públicos sem alterar a resposta do app.
const resultCache = new Map<string, { expires: number; result: GeocodeResult }>()
let nominatimBlockedUntil = 0
// Photon pode devolver uma via ou um ponto de interesse de outro quarteirão.
// Sem uma rua identificada perto da coordenada consultada, pedir endereço manual.
const MAX_PHOTON_STREET_DISTANCE_M = 40

const distanceMeters = (lat1: number, lng1: number, lat2: number, lng2: number) => {
  const radians = Math.PI / 180
  const dLat = (lat2 - lat1) * radians
  const dLng = (lng2 - lng1) * radians
  const arc = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * radians) * Math.cos(lat2 * radians) * Math.sin(dLng / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(arc)))
}

const fromPhoton = async (lat: number, lng: number): Promise<GeocodeResult | null> => {
  try {
    const url = new URL("https://photon.komoot.io/reverse")
    url.searchParams.set("lat", String(lat))
    url.searchParams.set("lon", String(lng))
    url.searchParams.set("limit", "5")
    const response = await fetch(url, { headers: { Accept: "application/json" } })
    if (!response.ok) return null
    const payload = await response.json()
    const features = Array.isArray(payload?.features) ? payload.features : []
    type PhotonStreetCandidate = { properties: Record<string, unknown>; distance: number }
    const nearbyStreets = features
      .map((feature: {
        properties?: Record<string, unknown>
        geometry?: { coordinates?: unknown[] }
      }): PhotonStreetCandidate | null => {
        const p = feature.properties
        const coordinates = feature.geometry?.coordinates
        const featureLng = Number(coordinates?.[0])
        const featureLat = Number(coordinates?.[1])
        const state = String(p?.state ?? "").trim()
        const road = String(p?.street ?? (p?.type === "street" ? p?.name : "") ?? "").trim()
        if (!p || !Array.isArray(coordinates) || coordinates.length < 2
          || !Number.isFinite(featureLat) || !Number.isFinite(featureLng)
          || Math.abs(featureLat) > 90 || Math.abs(featureLng) > 180
          || String(p?.countrycode ?? "").toUpperCase() !== "BR"
          || !String(p?.city ?? p?.county ?? "").trim()
          || !(STATE_NAME_TO_UF[state] || p?.statecode)
          || !road) return null
        return { properties: p, distance: distanceMeters(lat, lng, featureLat, featureLng) }
      })
      .filter((candidate: PhotonStreetCandidate | null): candidate is PhotonStreetCandidate =>
        candidate !== null && candidate.distance <= MAX_PHOTON_STREET_DISTANCE_M)
      .sort((a: PhotonStreetCandidate, b: PhotonStreetCandidate) => a.distance - b.distance)
    const properties = nearbyStreets[0]?.properties
    if (!properties) return null

    const city = String(properties.city ?? properties.county ?? "").trim()
    const state = String(properties.state ?? "").trim()
    const state_uf = STATE_NAME_TO_UF[state] || String(properties.statecode ?? "").trim().toUpperCase()
    if (!city || !/^[A-Z]{2}$/.test(state_uf)) return null
    const road = String(properties.street ?? (properties.type === "street" ? properties.name : "") ?? "").trim()
    const houseNumber = String(properties.housenumber ?? "").trim()
    const suburb = String(properties.district ?? properties.locality ?? "").trim()
    const address = [[road, houseNumber].filter(Boolean).join(", "), suburb, city, state]
      .filter(Boolean).join(" - ")
    return {
      address: address || null,
      city,
      state_uf,
      suburb: suburb || null,
      raw: { address: { road, house_number: houseNumber, suburb, city, state } },
    }
  } catch {
    return null
  }
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

    if (lat == null || lng == null || !Number.isFinite(latNum) || !Number.isFinite(lngNum)
      || Math.abs(latNum) > 90 || Math.abs(lngNum) > 180) {
      return new Response(
        JSON.stringify({ error: "invalid_coordinates" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }

    const zoomNum = Number.isFinite(Number(zoom)) ? Math.max(3, Math.min(19, Number(zoom))) : 18
    const userAgent = Deno.env.get("APP_USER_AGENT") || "TromboneCidadao/1.0"
    const cacheKey = `${latNum.toFixed(5)},${lngNum.toFixed(5)},${zoomNum}`
    const cached = resultCache.get(cacheKey)
    if (cached && cached.expires > Date.now()) {
      return new Response(JSON.stringify(cached.result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      })
    }

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
    const fromNominatim = async (z: number): Promise<Record<string, unknown> | null> => {
      if (Date.now() < nominatimBlockedUntil) return null
      try {
        const response = await fetch(makeUrl(z), { headers })
        const body = await response.text()
        if (response.status === 403 || response.status === 429 || body.startsWith("Access denied")) {
          nominatimBlockedUntil = Date.now() + 5 * 60 * 1000
          return null
        }
        if (!response.ok) return null
        const payload = JSON.parse(body)
        return payload && typeof payload === "object" && !payload.error ? payload : null
      } catch {
        return null
      }
    }

    const detail = await fromNominatim(zoomNum)
    let result: GeocodeResult | null = null
    if (detail) {
      const detailedAddress = (detail.address ?? {}) as Record<string, unknown>
      const detailedCity = String(detailedAddress.city ?? "").trim()
      const detailedCounty = String(detailedAddress.county ?? "").trim()
      const needsMunicipalityLookup = !extractCityUF(detail).city
        || (detailedCity && detailedCounty && detailedCity !== detailedCounty)
      let cityData = detail
      if (zoomNum !== 10 && needsMunicipalityLookup) {
        await new Promise((resolve) => setTimeout(resolve, 1100))
        cityData = await fromNominatim(10) || detail
      }
      const { city, state_uf } = extractCityUF(cityData)
      const rawCityDistrict = String(detailedAddress.city_district ?? "").trim()
      const cityDistrict = rawCityDistrict && rawCityDistrict.toLowerCase() !== (city ?? "").trim().toLowerCase()
        ? rawCityDistrict : ""
      const suburb = String(detailedAddress.suburb ?? detailedAddress.neighbourhood
        ?? detailedAddress.quarter ?? cityDistrict ?? "").trim() || null
      result = { address: buildAddress(detail), city, state_uf, suburb, raw: detail }
    }

    // O servidor público pode negar acesso e responder texto em vez de JSON.
    // Photon mantém o mesmo contrato para o app já instalado na loja.
    if (!result?.address || !result?.city || !result?.state_uf) {
      const fallback = await fromPhoton(latNum, lngNum)
      if (fallback) result = {
        address: result?.address || fallback.address,
        city: result?.city || fallback.city,
        state_uf: result?.state_uf || fallback.state_uf,
        suburb: result?.suburb || fallback.suburb,
        raw: result?.raw || fallback.raw,
      }
    }

    if (!result?.address || !result?.city || !result?.state_uf) {
      return new Response(JSON.stringify({ error: "reverse_geocode_unavailable" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 502,
      })
    }
    if (resultCache.size >= 500) resultCache.delete(resultCache.keys().next().value!)
    resultCache.set(cacheKey, { expires: Date.now() + 60 * 60 * 1000, result })
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
    })
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error?.message || "unknown_error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})

