import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const requestUrl = new URL(req.url)
  const username = (requestUrl.searchParams.get('username') || '').trim().toLowerCase().replace(/^@/, '')
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const appUrl = (Deno.env.get('APP_URL') || (supabaseUrl.includes('xxdletrjyjajtrmhwzev') ? 'https://trombone-cidadao.vercel.app' : 'https://trombonecidadao.com.br')).replace(/\/$/, '')
  const target = `${appUrl}/u/${encodeURIComponent(username)}`
  if (!username) return new Response(null, { status: 302, headers: { ...cors, Location: appUrl } })

  const bot = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|discord|slack|linkedin|skype/i.test(req.headers.get('user-agent') || '')
  if (!bot) return new Response(null, { status: 302, headers: { ...cors, Location: target } })

  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '')
  const { data } = await supabase.rpc('get_public_profile', { p_username: username })
  const profile = data && data.public_profile_enabled ? data : null
  if (!profile) return new Response(null, { status: 302, headers: { ...cors, Location: target } })

  let cityImage = ''
  if (profile.city_id) {
    const { data: city } = await supabase.from('cities').select('civic_thumbnail_url').eq('id', profile.city_id).maybeSingle()
    cityImage = String(city?.civic_thumbnail_url || '')
  }
  const rawImage = String(profile.avatar_url || cityImage || `${supabaseUrl}/storage/v1/object/public/site-media/shared/thumbnail.jpg`)
  const image = /^https?:\/\//i.test(rawImage) ? `https://wsrv.nl/?url=${encodeURIComponent(rawImage.split('?')[0])}&w=1200&h=630&fit=cover&q=84&output=jpg` : rawImage
  const title = `${profile.name} (@${profile.username}) | Trombone Cidadão`
  const description = String(profile.public_bio || `Acompanhe as broncas e conquistas de ${profile.name} no Trombone Cidadão.`).replace(/[\r\n]+/g, ' ').slice(0, 240)
  const proxy = `${appUrl}/share/perfil/${encodeURIComponent(username)}`
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta property="og:type" content="profile"><meta property="og:url" content="${esc(proxy)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:secure_url" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/jpeg"><meta property="og:image:alt" content="${esc(profile.name)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"><meta http-equiv="refresh" content="0;url=${esc(target)}"></head><body><a href="${esc(target)}">Abrir perfil</a></body></html>`
  return new Response(html, { headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300' } })
})
