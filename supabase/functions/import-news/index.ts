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
  const anchorTagRe = /<a[^>]*?>/gi
  let tagMatch
  while ((tagMatch = anchorTagRe.exec(categoryHtml)) !== null) {
    const tag = tagMatch[0]
    if (/class="[^"]*listagem-interna[^"]*"/i.test(tag)) {
      const hrefMatch = tag.match(/href="([^"]+)"/i)
      if (hrefMatch) {
        const href = normalizeLink(hrefMatch[1])
        console.log('[import-news] href normalizado', href)
        if (/^https?:\/\/blogdoelvis\.com\.br\/noticia\/\d+/.test(href)) {
          links.push(href)
        }
      }
    }
  }
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
  const reSite = /<div[^>]*class="[^"]*pos-texto[^"]*"[^>]*>[\s\S]*?<div[^>]*class="[^"]*texto[^"]*"[^>]*>([\s\S]*?)<\/div>/i
  const mSite = html.match(reSite)
  if (mSite) return mSite[1].trim()

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

// ─── REMOÇÃO DO INSTAGRAM ────────────────────────────────────────────────────

function removeInstagramOnly(html: string): string {
  if (!html) return html

  // 1. Remove iframes do Instagram (qualquer iframe com "instagram" nos atributos)
  let prev = ''
  while (prev !== html) {
    prev = html
    html = html.replace(/<iframe\b[^>]*instagram[^>]*>[\s\S]*?<\/iframe>/gi, '')
    html = html.replace(/<iframe\b[^>]*instagram[^>]*\/>/gi, '')
  }

  // 2. Remove blockquotes com "instagram-media" no class (tolera espaço inicial no valor)
  prev = ''
  while (prev !== html) {
    prev = html
    html = html.replace(/<blockquote\b[^>]*class="\s*[^"]*instagram-media[^"]*"[^>]*>[\s\S]*?<\/blockquote>/gi, '')
  }

  // 3. Remove divs com classe "instagram-media-registered"
  prev = ''
  while (prev !== html) {
    prev = html
    html = html.replace(/<div\b[^>]*class="\s*[^"]*instagram-media-registered[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
  }

  // 4. Remove qualquer elemento que possua data-instgrm-payload-id
  prev = ''
  while (prev !== html) {
    prev = html
    html = html.replace(/<[a-z][^>]*\bdata-instgrm-payload-id\b[^>]*>[\s\S]*?<\/[a-z]+>/gi, '')
  }

  // 5. Remove o parágrafo "Assista o vídeo:" que fica órfão após remover o embed
  html = html.replace(/<p[^>]*>\s*Assista\s+o\s+v[íi]deo\s*:?\s*<\/p>/gi, '')
  html = html.replace(/Assista\s+o\s+v[íi]deo\s*:?\s*(<br\s*\/?>)?\s*/gi, '')

  // 6. Remove URLs soltas do Instagram
  html = html.replace(/https?:\/\/(?:www\.)?instagram\.com\/[^\s<>"']+/g, '')

  // 7. Limpa tags completamente vazias que sobraram
  prev = ''
  while (prev !== html) {
    prev = html
    html = html.replace(/<p[^>]*>\s*<\/p>/gi, '')
    html = html.replace(/<div[^>]*>\s*<\/div>/gi, '')
  }

  return html
}

// ─── SANITIZAÇÃO GERAL ───────────────────────────────────────────────────────

function sanitizeHtml(html?: string): string | undefined {
  if (!html) return undefined

  // Remove script/style por segurança
  html = html.replace(/<script[\s\S]*?<\/script>/gi, '')
             .replace(/<style[\s\S]*?<\/style>/gi, '')
             .replace(/<!--[\s\S]*?-->/gi, '')

  // Remove apenas Instagram
  html = removeInstagramOnly(html)

  return html
}

// ─── EXTRAÇÃO DE METADADOS ───────────────────────────────────────────────────

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

function normalizeTitle(t?: string): string {
  if (!t) return ''
  return t
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function extractFeaturedImage(html: string): string | undefined {
  const ogImage = extractMetaContent(html, 'og:image')
  if (ogImage) return ogImage
  const m = html.match(/<div[^>]*class="[^"]*pos-texto[^"]*"[^>]*>[\s\S]*?<figure[^>]*class="[^"]*image[^"]*"[^>]*>[\s\S]*?<img[^>]*(?:data-src="([^"]+)"|src="([^"]+)")[^>]*>/i)
  if (m) return m[1] || m[2]
  return undefined
}

function extractVideoUrlFromBody(bodyHtml: string | undefined): string | undefined {
  if (!bodyHtml) return undefined
  const instaMatch = bodyHtml.match(/https?:\/\/(?:www\.)?instagram\.com\/(p|reel)\/([a-zA-Z0-9_-]+)/i)
  if (instaMatch) {
    return `https://www.instagram.com/${instaMatch[1]}/${instaMatch[2]}/`
  }
  const ytMatch =
    bodyHtml.match(/https?:\/\/(?:www\.)?youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/i)
    || bodyHtml.match(/https?:\/\/(?:www\.)?youtu\.be\/([a-zA-Z0-9_-]{11})/i)
    || bodyHtml.match(/https?:\/\/(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/i)
  if (ytMatch) {
    return `https://www.youtube.com/watch?v=${ytMatch[1]}`
  }
  const iframe = bodyHtml.match(/<iframe[^>]*src="([^"]+)"[^>]*><\/iframe>/i)
  const src = iframe ? iframe[1] : undefined
  if (src && (/instagram\.com|youtube\.com|youtu\.be|tiktok\.com|twitter\.com|x\.com/i.test(src))) {
    return src
  }
  return undefined
}

function extractVideoUrl(articleHtml: string): string | undefined {
  if (!articleHtml) return undefined
  // Extrai a URL do vídeo do HTML ORIGINAL (antes da sanitização), para não perder a referência
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

// ─── ESTILOS DE LEITURA ──────────────────────────────────────────────────────

function applyReadableStyles(html: string): string {
  if (!html) return html

  // h2 — negrito, maior, espaçado
  html = html.replace(
    /<h2([^>]*)>/gi,
    '<h2$1 style="font-size:1.25rem;font-weight:700;margin-top:1.5rem;margin-bottom:0.5rem;">'
  )

  // h3 — negrito, levemente maior, espaçado
  html = html.replace(
    /<h3([^>]*)>/gi,
    '<h3$1 style="font-size:1.1rem;font-weight:700;margin-top:1.25rem;margin-bottom:0.4rem;">'
  )

  // parágrafos — espaçamento vertical e altura de linha confortável
  html = html.replace(
    /<p([^>]*)>/gi,
    '<p$1 style="margin-top:0.75rem;margin-bottom:0.75rem;line-height:1.6;">'
  )

  return html
}

// ─── EXTRAÇÃO DO ARTIGO ──────────────────────────────────────────────────────

function extractArticle(html: string, id: string, url: string): ExtractedArticle {
  // Metadados extraídos do HTML original (og:image, og:title etc. não são afetados pela sanitização)
  const ogTitle = extractMetaContent(html, 'og:title')
  const ogDesc = extractMetaContent(html, 'og:description')
  const ogImage = extractFeaturedImage(html)
  const h2SubtitleMatch = html.match(/<h2[^>]*class="[^"]*subtitulo-post[^"]*"[^>]*>([\s\S]*?)<\/h2>/i)
  const h2Subtitle = h2SubtitleMatch ? h2SubtitleMatch[1].replace(/<[^>]+>/g, '').trim() : undefined
  const metaAuthor = extractMetaContent(html, 'author') || extractMetaContent(html, 'article:author')
  const jsonLd = extractJsonLdArticle(html)
  const metaDate = extractMetaContent(html, 'article:published_time') || jsonLd.datePublished
  const metaSection = extractMetaContent(html, 'article:section')
  const h1TitleMatch = html.match(/<h1[^>]*class="[^"]*titulo-post[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
  const h1 = h1TitleMatch ? h1TitleMatch[1].trim() : extractFirstTag(html, 'h1')

  // ✅ SANITIZA O HTML COMPLETO PRIMEIRO — garante que iframe/blockquote do Instagram
  // sejam removidos antes de qualquer extração de corpo, independente de onde estejam
  const sanitizedFullHtml = sanitizeHtml(html) ?? html

  // Agora extrai o corpo do HTML já limpo
  const bodySection = extractBodySection(sanitizedFullHtml)
  const baseBody = bodySection || extractBodyHtml(sanitizedFullHtml) || ''

  // Aplica estilos inline para garantir formatação correta no app
  const styledBody = applyReadableStyles(baseBody.trim())

  return {
    id,
    url,
    title: ogTitle || h1,
    description: ogDesc,
    image_url: ogImage,
    body_html: styledBody,
    author: metaAuthor || jsonLd.authorName,
    date_iso: metaDate,
    category: metaSection,
    // Não persiste aqui, apenas retorna para o caller salvar em subtitle
    // subtitle será salvo no record usando h2Subtitle ou og:description como fallback
    // @ts-ignore
    subtitle: h2Subtitle || ogDesc
  }
}

// ─── UPLOAD DE IMAGEM ────────────────────────────────────────────────────────

async function uploadImageToStorage(imageUrl: string, supabaseAdmin: any): Promise<string | null> {
  try {
    console.log('[import-news] downloading image', imageUrl)
    const res = await fetch(imageUrl)
    if (!res.ok) {
      console.warn('[import-news] failed to fetch image', res.status, imageUrl)
      return null
    }
    const blob = await res.blob()
    // Tenta extrair a extensão da URL ou do content-type
    let ext = imageUrl.split('.').pop()?.split('?')[0] || 'jpg'
    if (ext.length > 4 || !/^[a-z0-9]+$/i.test(ext)) {
       const ct = res.headers.get('content-type')
       if (ct === 'image/webp') ext = 'webp'
       else if (ct === 'image/png') ext = 'png'
       else if (ct === 'image/jpeg') ext = 'jpg'
       else ext = 'jpg'
    }

    const filename = `${crypto.randomUUID()}.${ext}`

    const { data, error } = await supabaseAdmin
      .storage
      .from('news-images')
      .upload(filename, blob, {
        contentType: res.headers.get('content-type') || 'image/jpeg',
        upsert: false
      })

    if (error) {
      console.error('[import-news] storage upload error', error)
      return null
    }
    
    const { data: { publicUrl } } = supabaseAdmin
      .storage
      .from('news-images')
      .getPublicUrl(filename)
      
    return publicUrl
  } catch (err) {
    console.error('[import-news] image upload exception', err)
    return null
  }
}

// ─── HANDLER PRINCIPAL ───────────────────────────────────────────────────────

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
      return new Response(
        JSON.stringify({ error: 'Falha ao baixar página da categoria' }),
        { status: 502, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      )
    }
    console.log('[import-news] página da categoria baixada')

    let linksFromList = extractCategoryArticleLinks(html)
    if (linksFromList.length === 0) {
      return new Response(
        JSON.stringify({ message: 'Nenhum link de notícia encontrado' }),
        { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json' } }
      )
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
        if (normalizedNew.length === 0) break
        normalizedNew.forEach(l => seen.add(l))
        linksFromList = linksFromList.concat(moreLinks)
        i++
        if (i > 100) {
          console.warn('[import-news] limite de páginas atingido (100), encerrando paginação')
          break
        }
      }
    }

    const links = linksFromList.slice(0, limit)

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
    const { data: importedLinks } = await supabaseAdmin
      .from('news_imported_links')
      .select('link')
      .in('link', links)
    const importedSet = new Set((importedLinks || []).map(r => normalizeLink(r.link)))

    const toImport = links
      .map(normalizeLink)
      .filter(l => !existingSet.has(l) && !importedSet.has(l))

    // Registra também os links que JÁ existem em news mas ainda não estão em news_imported_links
    const existingNotRecorded = links
      .map(normalizeLink)
      .filter(l => existingSet.has(l) && !importedSet.has(l))
    if (existingNotRecorded.length > 0) {
      const payload = existingNotRecorded.map(link => ({ link, source: 'blogdoelvis' }))
      const { error: recordErr } = await supabaseAdmin
        .from('news_imported_links')
        .upsert(payload, { onConflict: 'link' })
      if (recordErr) {
        console.error('[import-news] falha ao registrar links já existentes', recordErr.message, existingNotRecorded)
      }
    }

    const { data: recentNews } = await supabaseAdmin
      .from('news')
      .select('id,title')
      .order('date', { ascending: false })
      .limit(1000)
    const normalizedTitleSet = new Set((recentNews || []).map(n => normalizeTitle(n.title)))

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

      // Extrai video_url do HTML original ANTES da sanitização
      const videoUrlRecord = extractVideoUrl(articleHtml)

      // extractArticle já sanitiza internamente
      const art = extractArticle(articleHtml, id, url)
      const title = (art.title || '').trim()
      const bodyHtml = (art.body_html || '').trim()

      const normalizedNewTitle = normalizeTitle(title)
      if (normalizedNewTitle && normalizedTitleSet.has(normalizedNewTitle)) {
        const { error: dupErr } = await supabaseAdmin
          .from('news_imported_links')
          .upsert({ link: normalizeLink(url), source: 'blogdoelvis' }, { onConflict: 'link' })
        if (dupErr) {
          console.error('[import-news] falha ao registrar duplicata por título', dupErr.message, url)
        }
        errors.push({ url, error: 'Duplicado por título (já existe no Trombone)' })
        console.warn('[import-news] duplicado por título, ignorando', { url, title })
        continue
      }

      if (!title) {
        const errMsg = 'Conteúdo insuficiente (sem título)'
        errors.push({ url, error: errMsg })
        console.warn('[import-news] descartado', errMsg, { url })
        continue
      }

      let finalImageUrl = art.image_url || null
      // Se tiver imagem e for externa, tenta salvar no storage
      if (finalImageUrl && (finalImageUrl.startsWith('http') && !finalImageUrl.includes('supabase.co'))) {
        const storedUrl = await uploadImageToStorage(finalImageUrl, supabaseAdmin)
        if (storedUrl) {
          finalImageUrl = storedUrl
        }
      }

      const record = {
        title,
        source: 'Blog do Elvis',
        date: art.date_iso || new Date().toISOString(),
        description: (art.description || (art as any).subtitle || ''),
        subtitle: ((art as any).subtitle || null),
        body: bodyHtml,
        image_url: finalImageUrl,
        link: normalizeLink(art.url),
        video_url: videoUrlRecord || null
      }

      const { data, error } = await supabaseAdmin.from('news').insert(record).select().single()
      if (error) {
        errors.push({ url, error: error.message })
        console.error('[import-news] erro inserindo', error.message, url)
      } else {
        imported.push({ id: data.id, link: data.link })
        const { error: impErr } = await supabaseAdmin
          .from('news_imported_links')
          .upsert({ link: normalizeLink(data.link), source: 'blogdoelvis' }, { onConflict: 'link' })
        if (impErr) {
          console.error('[import-news] falha ao registrar link importado', impErr.message, data.link)
        }
        console.log('[import-news] importado', data.id, data.link)
      }

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
    return new Response(
      JSON.stringify({ error: (e as Error).message || 'Erro inesperado' }),
      { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } }
    )
  }
})
