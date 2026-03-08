import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type ExtractedArticle = {
  id: string
  url: string
  title?: string
  description?: string
  image_url?: string
  body_html?: string
  author?: string
  date_iso?: string
  category?: string
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (TromboneCidadao Importer)' } })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function findAllArticleIds(categoryHtml: string): string[] {
  const ids = new Set<string>()
  const hrefRegex = /href="https?:\/\/blogdoelvis\.com\.br\/noticia\/(\d+)[^"]*"/g
  let m
  while ((m = hrefRegex.exec(categoryHtml)) !== null) {
    ids.add(m[1])
  }
  return Array.from(ids)
}

function extractCategoryArticleLinks(categoryHtml: string): string[] {
  // Scope to the main list container of the category page
  // Atenção: regex de container pode capturar apenas parte devido a divs aninhadas.
  // Para robustez, varremos TODO o HTML e filtramos por anchors com class listagem-interna.
  const scoped = categoryHtml
  const links: string[] = []
  const normalizeLink = (href: string) => {
    if (!href) return href
    let out = href.startsWith('/') ? `https://blogdoelvis.com.br${href}` : href
    out = out.split('#')[0]
    out = out.split('?')[0]
    out = out.replace(/\/amp\/?$/i, '')
    out = out.replace(/\/$/, '')
    return out
  }
  // Find all anchor opening tags and extract href regardless of attribute order
  const anchorTagRe = /<a[^>]*?>/gi
  let tagMatch
  while ((tagMatch = anchorTagRe.exec(scoped)) !== null) {
    const tag = tagMatch[0]
    // Must be one of the list items in the category (listagem-interna)
    if (/class="[^"]*listagem-interna[^"]*"/i.test(tag)) {
      const hrefMatch = tag.match(/href="([^"]+)"/i)
      if (hrefMatch) {
        let href = normalizeLink(hrefMatch[1])
        console.log('[import-news] href normalizado', href)
        // Accept both absolute and normalized links
        if (/^https?:\/\/blogdoelvis\.com\.br\/noticia\/\d+/.test(href)) {
          links.push(href)
        }
      }
    }
  }
  // Fallback to global extraction if scoped is empty
  if (links.length === 0) {
    return findAllArticleIds(categoryHtml).map(id => `https://blogdoelvis.com.br/noticia/${id}`)
  }
  return Array.from(new Set(links))
}

function extractMetaContent(html: string, nameOrProp: string): string | undefined {
  const re = new RegExp(`<meta\\s+(?:name|property)="${nameOrProp}"\\s+content="([^"]+)"`, 'i')
  const m = html.match(re)
  return m ? m[1] : undefined
}

function extractFirstTag(html: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const m = html.match(re)
  return m ? m[1].trim() : undefined
}

function extractBodyHtml(html: string): string | undefined {
  // Prefer the site-specific container: .pos-texto > .texto (Blog do Elvis)
  const reSite = /<div[^>]*class="[^"]*pos-texto[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*texto[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  const mSite = html.match(reSite)
  if (mSite) return mSite[1].trim()

  // Common WordPress-like containers as fallback
  const candidates = [
    /<article[^>]*class="[^"]*post[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*(?:entry-content|post-content|single-content)[^"]*"[^>]*>([\s\S]*?)<\/div>[\s\S]*?<\/article>/i,
    /<div[^>]*class="[^"]*(entry-content|post-content|single-content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  ]
  for (const re of candidates) {
    const m = html.match(re)
    if (m) return (m[1] || m[2] || '').trim()
  }
  return undefined
}

function extractBodySection(html: string): string | undefined {
  const reSite = /<div[^>]*class="[^"]*pos-texto[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*texto[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  const mSite = html.match(reSite)
  if (mSite) return mSite[1].trim()
  return undefined
}

function sanitizeHtml(html?: string): string | undefined {
  if (!html) return undefined
  // Remove script/style tags for safety
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
  // Remove images inside body to avoid duplicating featured image and ads
  html = html.replace(/<img[^>]*>/gi, '')
  // Remove figures inside body
  html = html.replace(/<figure[\s\S]*?<\/figure>/gi, '')
  // Remove custom data-* attributes noise
  html = html.replace(/\sdata-[\w-]+="[^"]*"/gi, '')
  // Basic cleanup
  return html.trim()
}

function extractJsonLdArticle(html: string): { datePublished?: string, authorName?: string } {
  const results: { datePublished?: string, authorName?: string } = {}
  const scripts = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi) || []
  for (const s of scripts) {
    const m = s.match(/<script[^>]*>([\s\S]*?)<\/script>/i)
    const jsonText = m ? m[1] : ''
    try {
      const data = JSON.parse(jsonText)
      const arr = Array.isArray(data) ? data : [data]
      for (const obj of arr) {
        if (obj && (obj['@type'] === 'NewsArticle' || obj['@type'] === 'Article')) {
          if (obj.datePublished && typeof obj.datePublished === 'string') {
            results.datePublished = obj.datePublished
          }
          const author = obj.author
          if (author) {
            if (typeof author === 'string') results.authorName = author
            else if (Array.isArray(author) && author[0]?.name) results.authorName = author[0].name
            else if (author.name) results.authorName = author.name
          }
        }
      }
    } catch {
      // ignore malformed json
    }
  }
  return results
}

function extractFeaturedImage(html: string): string | undefined {
  // Prefer og:image
  const ogImage = extractMetaContent(html, 'og:image')
  if (ogImage) return ogImage
  // Fallback to figure in .pos-texto
  const m = html.match(/<div[^>]*class="[^"]*pos-texto[^"]*"[^>]*>[\s\S]*?<figure[^>]*class="[^"]*image[^"]*"[^>]*>[\s\S]*?<img[^>]*(?:data-src="([^"]+)"|src="([^"]+)")[^>]*>/i)
  if (m) return m[1] || m[2]
  return undefined
}

function extractVideoUrlFromBody(bodyHtml: string | undefined): string | undefined {
  if (!bodyHtml) return undefined
  // Prefer Instagram post/reel inside the body
  const instaMatch = bodyHtml.match(/https?:\/\/(?:www\.)?instagram\.com\/(p|reel)\/([a-zA-Z0-9_-]+)/i)
  if (instaMatch) {
    return `https://www.instagram.com/${instaMatch[1]}/${instaMatch[2]}/`
  }
  // Fallback to YouTube video (avoid channel links)
  const ytMatch =
    bodyHtml.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i)
    || bodyHtml.match(/https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i)
    || bodyHtml.match(/https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i)
  if (ytMatch) {
    return `https://www.youtube.com/watch?v=${ytMatch[1]}`
  }
  // Fallback to iframe src within body
  const iframe = bodyHtml.match(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/i)
  const src = iframe ? iframe[1] : undefined
  if (src && (/instagram\.com|youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com/i.test(src))) {
    return src
  }
  return undefined
}

function extractArticle(html: string, id: string, url: string): ExtractedArticle {
  const ogTitle = extractMetaContent(html, 'og:title')
  const ogDesc = extractMetaContent(html, 'og:description')
  const ogImage = extractFeaturedImage(html)
  const metaAuthor = extractMetaContent(html, 'author') || extractMetaContent(html, 'article:author')
  const jsonLd = extractJsonLdArticle(html)
  const metaDate = extractMetaContent(html, 'article:published_time') || jsonLd.datePublished
  const metaSection = extractMetaContent(html, 'article:section')
  const h1TitleMatch = html.match(/<h1[^>]*class="[^"]*titulo-post[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
  const h1 = h1TitleMatch ? h1TitleMatch[1].trim() : extractFirstTag(html, 'h1')
  const bodySection = extractBodySection(html)
  const videoUrl = extractVideoUrlFromBody(bodySection)
  const body = sanitizeHtml(bodySection || extractBodyHtml(html))
  let cleanedBody = body
  // Trim tudo após o marcador "Assista o vídeo" / "Veja o vídeo"
  if (cleanedBody) {
    // Remove todo bloco contendo o marcador e tudo que vem depois dele, preservando HTML antes
    const cutRegex = /<(?:p|h2|h3)[^>]*>[\s\S]*?(assista|veja)[\s\S]*?v(?:&iacute;|í|i)de(?:&oacute;|ó|o)[\s\S]*?<\/(?:p|h2|h3)>[\s\S]*$/i
    cleanedBody = cleanedBody.replace(cutRegex, '').trim()
  }
  if (cleanedBody && videoUrl) {
    const esc = videoUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleanedBody = cleanedBody.replace(new RegExp(esc, 'g'), '')
  }
  if (cleanedBody) {
    const rmAssista = /<(p|h2|h3)[^>]*>[\s\S]*?assista[\s\S]*?v(?:&iacute;|í|i)de(?:&oacute;|ó|o)[\s\S]*?<\/\1>/gi
    const rmVeja = /<(p|h2|h3)[^>]*>[\s\S]*?veja[\s\S]*?v(?:&iacute;|í|i)de(?:&oacute;|ó|o)[\s\S]*?<\/\1>/gi
    cleanedBody = cleanedBody.replace(rmAssista, '').replace(rmVeja, '')
    // Remove variações sem tags explícitas
    cleanedBody = cleanedBody.replace(/assista[^<]{0,80}v(?:&iacute;|í|i)de(?:&oacute;|ó|o)/gi, '')
    // Fallback: se não houver tags de bloco, criar parágrafos
    if (!/(<p|<br|<ul|<ol|<h2|<h3)/i.test(cleanedBody)) {
      let parts = cleanedBody.split(/(?:\r?\n){2,}/).map(s => s.trim()).filter(Boolean)
      if (parts.length <= 1) {
        parts = cleanedBody.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean)
      }
      if (parts.length > 0) {
        cleanedBody = parts.map(p => `<p>${p}</p>`).join('\n')
      }
    }
  }

  return {
    id,
    url,
    title: ogTitle || h1,
    description: ogDesc,
    image_url: ogImage,
    body_html: cleanedBody,
    author: metaAuthor || jsonLd.authorName,
    date_iso: metaDate,
    category: metaSection
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    let limit = 10
    let pages = 1
    if (req.method === 'POST') {
      try {
        const body = await req.json()
        if (typeof body?.limit === 'number') {
          limit = Math.max(1, Math.min(100, Math.floor(body.limit)))
        }
        if (typeof body?.pages === 'number') {
          pages = Math.max(0, Math.min(100, Math.floor(body.pages)))
        }
      } catch {
        // ignore body parsing errors
      }
    }
    console.log('[import-news] início', { limit, pages })
    const categoryUrl = 'https://blogdoelvis.com.br/trombone-cidadao'
    const html = await fetchText(categoryUrl)
    if (!html) {
      return new Response(JSON.stringify({ error: 'Falha ao baixar página da categoria' }), { status: 502, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
    console.log('[import-news] página da categoria baixada')

    let linksFromList = extractCategoryArticleLinks(html)
    if (linksFromList.length === 0) {
      return new Response(JSON.stringify({ message: 'Nenhum link de notícia encontrado' }), { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } })
    }
    console.log('[import-news] links extraídos página 1', linksFromList.length)

    if (pages !== 1) {
      const normalize = (href: string) => {
        let out = href.split('#')[0]
        out = out.split('?')[0]
        out = out.replace(/\/amp\/?$/i, '')
        out = out.replace(/\/$/, '')
        return out
      }
      const seen = new Set(linksFromList.map(normalize))
      // Detect máximo de páginas pela paginação do HTML inicial
      const pageMatches = html.match(/\/trombone-cidadao\/pagina\/(\d+)/gi) || html.match(/\/pagina\/(\d+)/gi) || []
      let maxPagesDetected = 1
      for (const m of pageMatches) {
        const num = parseInt((m.match(/(\d+)/) || [])[1] || '1', 10)
        if (!isNaN(num)) maxPagesDetected = Math.max(maxPagesDetected, num)
      }
      let loopEnd = pages > 1 ? pages : maxPagesDetected
      loopEnd = Math.max(loopEnd, 1)
      let i = 2
      while (i <= loopEnd) {
        const cand = `${categoryUrl}/pagina/${i}`
        const pageHtml = await fetchText(cand)
        if (!pageHtml) {
          console.warn('[import-news] falha ao baixar página extra', i)
          break
        }
        const moreLinks = extractCategoryArticleLinks(pageHtml)
        const normalizedNew = moreLinks.map(normalize).filter(l => !seen.has(l))
        console.log('[import-news] links extraídos página', i, moreLinks.length, 'novos', normalizedNew.length)
        if (normalizedNew.length === 0) {
          // Nada novo nesta página — parar
          break
        }
        normalizedNew.forEach(l => seen.add(l))
        linksFromList = linksFromList.concat(moreLinks)
        i++
        // Segurança: limite superior para evitar loop infinito por páginas artificiais
        if (i > 100) {
          console.warn('[import-news] limite de páginas atingido (100), encerrando paginação')
          break
        }
      }
    }

    // Limit to recent N items to reduce noise/backlog (configurável)
    const links = linksFromList.slice(0, limit)

    // Check which links already exist in news
    const { data: existing } = await supabaseAdmin
      .from('news')
      .select('id, link')
      .in('link', links)

    const normalizeLink = (href: string) => {
      let out = href.split('#')[0]
      out = out.split('?')[0]
      out = out.replace(/\/amp\/?$/i, '')
      out = out.replace(/\/$/, '')
      return out
    }
    const existingSet = new Set((existing || []).map(n => normalizeLink(n.link)))
    // Also check imported registry
    const { data: importedLinks } = await supabaseAdmin
      .from('news_imported_links')
      .select('link')
      .in('link', links)
    const importedSet = new Set((importedLinks || []).map(r => normalizeLink(r.link)))
    const toImport = links
      .map(normalizeLink)
      .filter(l => !existingSet.has(l) && !importedSet.has(l))

    const imported: any[] = []
    const errors: any[] = []

    for (const url of toImport) {
      console.log('[import-news] processando', url)
      const idMatch = url.match(/noticia\/(\d+)/)
      const id = idMatch ? idMatch[1] : ''
      const articleHtml = await fetchText(url)
      if (!articleHtml) {
        const errMsg = 'Falha ao baixar notícia'
        errors.push({ url, error: errMsg })
        console.error('[import-news] erro', errMsg, url)
        continue
      }
      const art = extractArticle(articleHtml, id, url)

      const title = (art.title || '').trim()
      const bodyHtml = (art.body_html || '').trim()
      const videoUrlRecord = extractVideoUrl(articleHtml)
      const plainTextLength = bodyHtml.replace(/<[^>]+>/g, '').trim().length
      if (!title || (!bodyHtml && !videoUrlRecord)) {
        const errMsg = 'Conteúdo insuficiente (sem título ou corpo/vídeo)'
        errors.push({ url, error: errMsg })
        console.warn('[import-news] descartado', errMsg, { url, titleLen: title.length, bodyLen: bodyHtml.length, hasVideo: !!videoUrlRecord })
        continue
      }
      if (!videoUrlRecord && plainTextLength < 40) {
        const errMsg = 'Corpo muito curto e sem vídeo'
        errors.push({ url, error: errMsg })
        console.warn('[import-news] descartado', errMsg, { url, titleLen: title.length, bodyLen: bodyHtml.length })
        continue
      }

      const record = {
        title,
        source: 'Blog do Elvis',
        date: art.date_iso || new Date().toISOString(),
        description: art.description || '',
        body: bodyHtml,
        image_url: art.image_url || null,
        link: normalizeLink(art.url),
        video_url: videoUrlRecord || null
      }

      const { data, error } = await supabaseAdmin.from('news').insert(record).select().single()
      if (error) {
        errors.push({ url, error: error.message })
        console.error('[import-news] erro inserindo', error.message, url)
      } else {
        imported.push({ id: data.id, link: data.link })
        await supabaseAdmin.from('news_imported_links').insert({ link: data.link, source: 'blogdoelvis' })
        console.log('[import-news] importado', data.id, data.link)
      }
      // Be polite to origin
      await new Promise(r => setTimeout(r, 300))
    }

    const payload = {
      checked: links.length,
      imported_count: imported.length,
      imported,
      errors
    }
    console.log('[import-news] concluído', { imported_count: imported.length, errors_count: errors.length })
    return new Response(JSON.stringify(payload), { headers: { ...corsHeaders, 'content-type': 'application/json' } })
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message || 'Erro inesperado' }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } })
  }
})
function extractVideoUrl(articleHtml: string): string | undefined {
  if (!articleHtml) return undefined
  const body = extractBodySection(articleHtml) || extractBodyHtml(articleHtml) || ''
  const fromBody = extractVideoUrlFromBody(body)
  if (fromBody) return fromBody
  const insta = articleHtml.match(/https?:\/\/(?:www\.)?instagram\.com\/(p|reel)\/([a-zA-Z0-9_-]+)/i)
  if (insta) return `https://www.instagram.com/${insta[1]}/${insta[2]}/`
  const yt =
    articleHtml.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i) ||
    articleHtml.match(/https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i) ||
    articleHtml.match(/https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i)
  if (yt) return `https://www.youtube.com/watch?v=${yt[1]}`
  const iframe = articleHtml.match(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/i)
  const src = iframe ? iframe[1] : undefined
  if (src && (/instagram\.com|youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com/i.test(src))) return src
  return undefined
}
