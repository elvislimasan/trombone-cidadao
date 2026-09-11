import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const esc = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const typeLabels: Record<string, string> = {
  water_outage: "Falta d'água",
  power_outage: 'Interrupção elétrica',
  road_block: 'Rua interditada',
  traffic: 'Trânsito',
  public_transport: 'Transporte público',
  weather: 'Alerta climático',
  health: 'Saúde',
  construction: 'Obra emergencial',
  event: 'Evento',
  public_notice: 'Comunicado',
  other: 'Acontecimento',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const requestUrl = new URL(req.url)
  const eventId = requestUrl.searchParams.get('id')?.trim() || ''
  if (!/^\d+$/.test(eventId)) return new Response('Missing or invalid id', { status: 400, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const appUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev')
    ? 'https://trombone-cidadao.vercel.app'
    : (Deno.env.get('APP_URL') || 'https://trombonecidadao.com.br').replace(/\/$/, '')
  const redirectUrl = `${appUrl}/agora/${eventId}`

  const userAgent = req.headers.get('user-agent') || ''
  const isBot = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|discord|slack|linkedin|skype/i.test(userAgent)
  if (!isBot) return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirectUrl } })

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: event } = await supabase
    .from('city_events')
    .select('id, city_id, type, title, description, image_url, location_label, updated_at')
    .eq('id', eventId)
    .maybeSingle()

  if (!event) return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirectUrl } })

  const { data: city } = await supabase
    .from('cities')
    .select('name')
    .eq('id', event.city_id)
    .maybeSingle()

  const label = typeLabels[event.type] || 'Acontecimento'
  const title = `${label}: ${event.title} | Trombone Cidadão`
  const place = event.location_label || city?.name || 'sua cidade'
  const description = String(event.description || `${label} em ${place}. Veja os detalhes e acompanhe as atualizações no Radar da cidade.`)
    .replace(/[\r\n]+/g, ' ')
    .slice(0, 240)
  const fallback = `${supabaseUrl}/storage/v1/object/public/site-media/shared/thumbnail.jpg`
  const rawImage = String(event.image_url || '').trim()
  const absoluteImage = rawImage && /^https?:\/\//i.test(rawImage)
    ? rawImage
    : rawImage ? `${supabaseUrl.replace(/\/$/, '')}/${rawImage.replace(/^\//, '')}` : ''
  const image = absoluteImage
    ? `https://wsrv.nl/?url=${encodeURIComponent(absoluteImage.split('?')[0])}&w=1200&h=630&fit=cover&q=84&output=jpg`
    : fallback
  const version = requestUrl.searchParams.get('v')?.trim() || String(event.updated_at || '')
  const proxyUrl = `${appUrl}/share/radar/${eventId}${version ? `?v=${encodeURIComponent(version)}` : ''}`

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="${esc(proxyUrl)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:image:secure_url" content="${esc(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:alt" content="${esc(event.title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(image)}">
  <meta http-equiv="refresh" content="0;url=${esc(redirectUrl)}">
</head>
<body><p>Redirecionando para <a href="${esc(redirectUrl)}">${esc(event.title)}</a>…</p></body>
</html>`

  return new Response(html, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
})
