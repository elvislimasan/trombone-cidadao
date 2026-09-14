import { ImageResponse } from 'https://deno.land/x/og_edge@0.0.4/mod.ts'
import React from 'https://esm.sh/react@18.2.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const esc = (value: unknown) => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;')
const key = (value: unknown) => String(value ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').replace(/[^a-z0-9]+/g, ' ').trim()

const hasAuthor = (documents: unknown, normalizedName: string) => {
  if (!Array.isArray(documents)) return false
  return documents.some((document) => {
    if (!document || document.kind !== 'projeto_lei') return false
    const authors = Array.isArray(document.councilor_authors) && document.councilor_authors.length
      ? document.councilor_authors
      : [document.councilor_author]
    return authors.some((author) => key(author) === normalizedName)
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const requestUrl = new URL(req.url)
  const cityId = (requestUrl.searchParams.get('city') || '').trim()
  const slug = (requestUrl.searchParams.get('slug') || '').trim().toLowerCase()
  const wantsImage = requestUrl.searchParams.get('image') === '1'
  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const appUrl = (Deno.env.get('APP_URL') || (supabaseUrl.includes('xxdletrjyjajtrmhwzev') ? 'https://trombone-cidadao.vercel.app' : 'https://trombonecidadao.com.br')).replace(/\/$/, '')
  const target = `${appUrl}/vereadores/${encodeURIComponent(cityId)}/${encodeURIComponent(slug)}`
  if (!cityId || !slug) return new Response(null, { status: 302, headers: { ...cors, Location: appUrl } })

  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') || '')
  const { data: councilor } = await supabase
    .from('councilors')
    .select('id, city_id, name, nickname, slug, photo_url, party, biography, user_id, is_in_office, city:cities(name, states(uf))')
    .eq('city_id', cityId)
    .eq('slug', slug)
    .maybeSingle()
  if (!councilor) return new Response(null, { status: 302, headers: { ...cors, Location: target } })

  const [{ data: streetRows }, reportsResult] = await Promise.all([
    supabase.from('pavement_streets').select('historical_documents').eq('city_id', cityId),
    councilor.user_id
      ? supabase.from('reports').select('id', { count: 'exact', head: true }).eq('author_id', councilor.user_id).eq('is_anonymous', false).eq('moderation_status', 'approved').neq('status', 'rejected')
      : Promise.resolve({ count: 0 }),
  ])
  const normalizedName = key(councilor.name)
  const streetCount = (streetRows || []).filter((street) => hasAuthor(street.historical_documents, normalizedName)).length
  const reportCount = reportsResult.count || 0
  const cityName = `${councilor.city?.name || 'Cidade'}${councilor.city?.states?.uf ? ` · ${councilor.city.states.uf}` : ''}`
  const officeStatus = councilor.is_in_office === true ? 'Em exercício' : councilor.is_in_office === false ? 'Fora do exercício' : ''

  if (wantsImage) {
    return new ImageResponse(
      <div style={{ width: '100%', height: '100%', display: 'flex', position: 'relative', overflow: 'hidden', background: 'linear-gradient(135deg,#090d17 0%,#172033 58%,#5e1018 100%)', color: '#fff', fontFamily: 'Arial, sans-serif', padding: '58px' }}>
        <div style={{ position: 'absolute', right: '-100px', top: '-130px', width: '520px', height: '520px', borderRadius: '999px', display: 'flex', background: 'rgba(239,35,48,.16)' }} />
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%', zIndex: 2 }}>
          <div style={{ display: 'flex', alignItems: 'center', color: '#ffadb3', fontSize: 24, fontWeight: 800, letterSpacing: 3 }}>📣 TROMBONE CIDADÃO</div>
          <div style={{ display: 'flex', alignItems: 'center', marginTop: 44 }}>
            {councilor.photo_url
              ? <img src={councilor.photo_url} width="190" height="190" style={{ width: 190, height: 190, borderRadius: 34, objectFit: 'cover', border: '4px solid rgba(255,255,255,.22)' }} />
              : <div style={{ width: 190, height: 190, borderRadius: 34, background: '#e5232d', alignItems: 'center', justifyContent: 'center', display: 'flex', fontSize: 68, fontWeight: 900 }}>{String(councilor.name).split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()}</div>}
            <div style={{ display: 'flex', flexDirection: 'column', marginLeft: 38, flex: 1 }}>
              <div style={{ display: 'flex', color: '#ffadb3', fontSize: 20, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 3 }}>Perfil legislativo {officeStatus ? `· ${officeStatus}` : ''}</div>
              <div style={{ display: 'flex', fontSize: 54, lineHeight: 1.05, fontWeight: 900, marginTop: 12 }}>{councilor.name}</div>
              <div style={{ display: 'flex', color: 'rgba(255,255,255,.72)', fontSize: 25, marginTop: 16 }}>{cityName}{councilor.party ? ` · ${councilor.party}` : ''}</div>
            </div>
          </div>
          <div style={{ display: 'flex', marginTop: 44, gap: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', borderRadius: 22, background: 'rgba(255,255,255,.10)', padding: '18px 30px' }}><strong style={{ fontSize: 38, marginRight: 13 }}>{streetCount}</strong><span style={{ fontSize: 22, color: 'rgba(255,255,255,.76)' }}>{streetCount === 1 ? 'rua registrada' : 'ruas registradas'}</span></div>
            {reportCount > 0 && <div style={{ display: 'flex', alignItems: 'center', borderRadius: 22, background: 'rgba(255,255,255,.10)', padding: '18px 30px' }}><strong style={{ fontSize: 38, marginRight: 13 }}>{reportCount}</strong><span style={{ fontSize: 22, color: 'rgba(255,255,255,.76)' }}>{reportCount === 1 ? 'bronca publicada' : 'broncas publicadas'}</span></div>}
          </div>
        </div>
      </div>,
      { width: 1200, height: 630, headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' } },
    )
  }

  const bot = /bot|crawler|spider|facebook|twitter|whatsapp|telegram|discord|slack|linkedin|skype/i.test(req.headers.get('user-agent') || '')
  if (!bot) return new Response(null, { status: 302, headers: { ...cors, Location: target } })

  const title = `${councilor.name} | Perfil legislativo — Trombone Cidadão`
  const description = `${streetCount} ${streetCount === 1 ? 'rua registrada' : 'ruas registradas'}${reportCount ? ` e ${reportCount} ${reportCount === 1 ? 'bronca publicada' : 'broncas publicadas'}` : ''} em ${cityName}.`
  const proxy = `${appUrl}/share/vereador/${encodeURIComponent(cityId)}/${encodeURIComponent(slug)}`
  const image = `${supabaseUrl}/functions/v1/share-councilor?city=${encodeURIComponent(cityId)}&slug=${encodeURIComponent(slug)}&image=1`
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta property="og:type" content="profile"><meta property="og:url" content="${esc(proxy)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${esc(image)}"><meta property="og:image:secure_url" content="${esc(image)}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:type" content="image/png"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}"><meta name="twitter:image" content="${esc(image)}"><meta http-equiv="refresh" content="0;url=${esc(target)}"></head><body><a href="${esc(target)}">Abrir perfil legislativo</a></body></html>`
  return new Response(html, { headers: { ...cors, 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300' } })
})
