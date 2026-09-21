import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const esc = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;')

const absoluteImage = (raw: unknown, supabaseUrl: string, appUrl: string) => {
  const value = String(raw || '').trim()
  if (/^https?:\/\//i.test(value)) return value
  if (value.startsWith('storage/')) return `${supabaseUrl}/${value}`
  if (value.startsWith('/storage/')) return `${supabaseUrl}${value}`
  return value.startsWith('/') ? `${appUrl}${value}` : ''
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })

  const requestUrl = new URL(req.url)
  const type = requestUrl.searchParams.get('type') || 'index'
  const id = requestUrl.searchParams.get('id')?.trim() || ''
  const previewVersion = requestUrl.searchParams.get('v')?.trim() || ''
  const cityId = requestUrl.searchParams.get('cidade') || 'todas'
  const cityQuery = cityId === 'todas' || !/^\d+$/.test(cityId) ? 'todas' : cityId
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')
  const appUrl = (Deno.env.get('APP_URL') || (supabaseUrl.includes('xxdletrjyjajtrmhwzev')
    ? 'https://trombone-cidadao.vercel.app'
    : 'https://trombonecidadao.com.br')).replace(/\/$/, '')
  const categoryPath = type === 'category' && id ? `/categoria/${encodeURIComponent(id)}` : ''
  const placePath = type === 'place' && id ? `/guia/${encodeURIComponent(id)}` : ''
  const suffix = type === 'place' ? placePath : categoryPath
  const citySuffix = type === 'place' ? '' : `?cidade=${encodeURIComponent(cityQuery)}`
  const redirectUrl = `${appUrl}/guia-da-cidade${suffix}${citySuffix}`
  const sharePath = type === 'place' && id
    ? `/share/guia/${encodeURIComponent(id)}`
    : type === 'category' && id
      ? `/share/guia/categoria/${encodeURIComponent(id)}`
      : '/share/guia'
  const versionSuffix = type === 'place' && previewVersion ? `?v=${encodeURIComponent(previewVersion)}` : ''
  const proxyUrl = `${appUrl}${sharePath}${citySuffix}${versionSuffix}`

  if (!/bot|crawler|spider|facebook|twitter|whatsapp|telegram|discord|slack|linkedin|skype/i.test(req.headers.get('user-agent') || '')) {
    return new Response(null, { status: 302, headers: { ...cors, Location: redirectUrl } })
  }

  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '')
  let title = 'Guia da Cidade | Trombone Cidadão'
  let description = 'Encontre comércio, serviços, turismo e transporte no Guia da Cidade.'
  let image = ''
  let imageAlt = 'Guia da Cidade'
  let placeCityId: string | number | null = cityQuery === 'todas' ? null : cityQuery

  if (type === 'place' && id) {
    const { data: place } = await supabase.from('directory')
      .select('id, name, description, address, image_url, guide_metadata, city_id')
      .eq('id', id)
      .eq('status', 'approved')
      .maybeSingle()
    if (!place) return new Response(null, { status: 302, headers: { ...cors, Location: redirectUrl } })
    title = `${place.name} | Guia da Cidade`
    description = String(place.description || place.address || `Conheça ${place.name} no Guia da Cidade.`).replace(/[\r\n]+/g, ' ').slice(0, 240)
    image = absoluteImage(place.image_url || place.guide_metadata?.secondary_image_url, supabaseUrl, appUrl)
    imageAlt = place.name
    placeCityId = place.city_id
  } else {
    let categoryIds: string[] = []
    if (type === 'category' && id === 'sem-categoria') {
      title = 'Outros locais | Guia da Cidade'
      description = 'Explore outros locais e informações úteis no Guia da Cidade.'
      imageAlt = 'Outros locais'
    } else if (type === 'category' && id) {
      const { data: category } = await supabase.from('directory_categories')
        .select('id, name, parent_id')
        .eq('id', id)
        .eq('active', true)
        .maybeSingle()
      if (!category) return new Response(null, { status: 302, headers: { ...cors, Location: redirectUrl } })
      title = `${category.name} | Guia da Cidade`
      description = `Explore ${category.name} no Guia da Cidade e encontre lugares e informações úteis.`
      imageAlt = category.name
      categoryIds = [category.id]
      if (!category.parent_id) {
        const { data: children } = await supabase.from('directory_categories')
          .select('id').eq('parent_id', category.id).eq('active', true)
        categoryIds.push(...(children || []).map((child) => child.id))
      }
    }
    let placesQuery = supabase.from('directory')
      .select('image_url, guide_metadata')
      .eq('status', 'approved')
      .order('views', { ascending: false })
      .limit(30)
    if (categoryIds.length) placesQuery = placesQuery.in('category_id', categoryIds)
    if (type === 'category' && id === 'sem-categoria') placesQuery = placesQuery.is('category_id', null)
    if (cityQuery !== 'todas') placesQuery = placesQuery.eq('city_id', cityQuery)
    const { data: places } = await placesQuery
    const pictured = (places || []).find((place) => place.image_url || place.guide_metadata?.secondary_image_url)
    image = absoluteImage(pictured?.image_url || pictured?.guide_metadata?.secondary_image_url, supabaseUrl, appUrl)
  }

  if (placeCityId) {
    const { data: city } = await supabase.from('cities')
      .select('name, civic_thumbnail_url').eq('id', placeCityId).maybeSingle()
    if (city?.name) {
      description = `${description} Em ${city.name}.`.slice(0, 260)
    }
    if (!image) image = absoluteImage(city?.civic_thumbnail_url, supabaseUrl, appUrl)
  }

  const fallback = `${supabaseUrl}/storage/v1/object/public/site-media/shared/thumbnail.jpg`
  const finalImage = image
    ? `https://wsrv.nl/?url=${encodeURIComponent(image.split('?')[0])}&w=1200&h=630&fit=cover&q=84&output=jpg`
    : fallback
  const html = `<!doctype html><html lang="pt-BR"><head>
  <meta charset="utf-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="${esc(proxyUrl)}">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:image" content="${esc(finalImage)}">
  <meta property="og:image:secure_url" content="${esc(finalImage)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:alt" content="${esc(imageAlt)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${esc(finalImage)}">
  <meta http-equiv="refresh" content="0;url=${esc(redirectUrl)}">
  </head><body><a href="${esc(redirectUrl)}">Abrir Guia da Cidade</a></body></html>`

  return new Response(html, {
    headers: {
      ...cors,
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  })
})
