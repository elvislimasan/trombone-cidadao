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

const absoluteImageUrl = (raw: unknown, supabaseUrl: string) => {
  const value = String(raw || '').trim()
  if (!value) return ''
  if (/^https?:\/\//i.test(value)) return value
  return `${supabaseUrl.replace(/\/$/, '')}/${value.replace(/^\//, '')}`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const url = new URL(req.url)
  const streetKey = url.searchParams.get('id')?.trim() || ''
  const previewVersion = url.searchParams.get('v')?.trim() || ''
  if (!streetKey) return new Response('Missing id', { status: 400, headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const appUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev')
    ? 'https://trombone-cidadao.vercel.app'
    : (Deno.env.get('APP_URL') || 'https://trombonecidadao.com.br').replace(/\/$/, '')
  // Quem clicou no link nao depende da consulta usada apenas para montar a
  // previa social. Antes, qualquer erro nessa consulta (coluna nova ainda nao
  // aplicada, relacionamento ou indisponibilidade momentanea) era confundido
  // com "rua inexistente" e jogava a pessoa no mapa geral.
  const requestedRedirectUrl = `${appUrl}/mapa-pavimentacao/rua/${encodeURIComponent(streetKey)}`
  const userAgent = req.headers.get('user-agent') || ''
  const isBot = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|discord|slack|linkedin|skype/i.test(userAgent)
  if (!isBot) {
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: requestedRedirectUrl } })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(streetKey)

  // O nome informal foi incluido depois da pagina publica. Busca-lo em uma
  // consulta separada mantem links funcionando durante deploys em que a Edge
  // Function chega antes da migracao correspondente.
  const { data: street, error: streetError } = await supabase
    .from('pavement_streets')
    .select('id, slug, name, updated_at, honoree_name, biography, historical_photos, bairro:bairros!pavement_streets_bairro_id_fkey(name)')
    .eq(isUuid ? 'id' : 'slug', streetKey)
    .maybeSingle()

  if (streetError || !street) {
    // Um crawler nao ganha uma previa especifica neste caso, mas o clique no
    // resultado continua levando ao endereco solicitado, nunca ao mapa geral.
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: requestedRedirectUrl } })
  }

  const { data: aliasesRow } = await supabase
    .from('pavement_streets')
    .select('informal_names')
    .eq('id', street.id)
    .maybeSingle()

  const publicKey = street.slug || street.id
  const redirectUrl = `${appUrl}/mapa-pavimentacao/rua/${encodeURIComponent(publicKey)}`

  const photos = Array.isArray(street.historical_photos) ? street.historical_photos : []
  const chosenPhoto = photos.find((photo: any) => photo?.subject === 'honoree')
    || photos.find((photo: any) => photo?.subject !== 'honoree' && photo?.featured === true)
    || photos.find((photo: any) => photo?.url)
  const rawImage = absoluteImageUrl(chosenPhoto?.url, supabaseUrl)
  const fallbackImage = `${supabaseUrl}/storage/v1/object/public/site-media/shared/thumbnail.jpg`
  const image = rawImage
    ? `https://wsrv.nl/?url=${encodeURIComponent(rawImage.split('?')[0])}&w=1200&h=630&fit=cover&q=82&output=jpg`
    : fallbackImage
  const informalNames = Array.isArray(aliasesRow?.informal_names) ? aliasesRow.informal_names : []
  const aliases = informalNames.length
    ? ` Também conhecida como ${informalNames.join(', ')}.`
    : ''
  const local = street.bairro?.name ? `, em ${street.bairro.name}` : ''
  const description = street.honoree_name
    ? `Conheça a história de ${street.honoree_name}, homenageado(a) por esta rua${local}.${aliases}`
    : `${String(street.biography || `Conheça a história e a localização desta rua${local}.`).slice(0, 180)}${aliases}`
  const title = `${street.name} | Trombone Cidadão`
  const version = previewVersion || String(street.updated_at || '')
  const proxyUrl = `${appUrl}/share/rua/${encodeURIComponent(publicKey)}${version ? `?v=${encodeURIComponent(version)}` : ''}`

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
  <meta property="og:image:alt" content="${esc(chosenPhoto?.caption || street.honoree_name || street.name)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(image)}">
  <meta http-equiv="refresh" content="0;url=${esc(redirectUrl)}">
</head>
<body><p>Redirecionando para <a href="${esc(redirectUrl)}">${esc(street.name)}</a>…</p></body>
</html>`

  return new Response(html, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
})
