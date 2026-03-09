import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const newsId = url.searchParams.get('id')

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  let appUrl = 'https://trombonecidadao.com.br'
  if (supabaseUrl.includes('xxdletrjyjajtrmhwzev')) {
    appUrl = 'https://trombone-cidadao.vercel.app'
  } else if (supabaseUrl.includes('mrejgpcxaevooofyenzq')) {
    appUrl = 'https://trombonecidadao.com.br'
  }

  const defaultTitle = 'Notícia - Trombone Cidadão'
  const defaultDesc = 'Acompanhe notícias e atualizações no Trombone Cidadão.'
  const defaultImage = `${appUrl}/images/thumbnail.jpg`

  const redirectUrl = newsId ? `${appUrl}/noticias/${newsId}` : appUrl

  const userAgent = req.headers.get('user-agent') || ''
  const botRegex = /bot|googlebot|crawler|spider|robot|crawling|facebook|twitter|whatsapp|telegram|discord|slack|skype|linkedin|applebot|bingbot|yahoo|duckduckgo|yandex/i
  const isBot = botRegex.test(userAgent)

  if (!isBot) {
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: redirectUrl } })
  }
  if (!newsId) {
    return new Response(null, { status: 302, headers: { ...corsHeaders, Location: appUrl } })
  }

  try {
    let title = defaultTitle
    let description = defaultDesc
    let image = defaultImage

    const { data: news, error } = await supabase
      .from('news')
      .select('id, title, subtitle, description, image_url')
      .eq('id', newsId)
      .single()

    if (!error && news) {
      title = news.title ? `${news.title} - Trombone Cidadão` : defaultTitle
      const descSource = news.subtitle || news.description || defaultDesc
      description = String(descSource)
        .replace(/[\n\r]/g, ' ')
        .replace(/"/g, '&quot;')
        .substring(0, 200)
        .trim()
      if (news.image_url) {
        image = news.image_url
      }
      if (image && !image.startsWith('http')) {
        const path = image.startsWith('/') ? image : `/${image}`
        if (image.includes('storage/v1')) {
          image = `${supabaseUrl}${path}`
        } else {
          image = `${appUrl}${path}`
        }
      }
    }

    if (image && !image.includes('wsrv.nl') && image.startsWith('http')) {
      const cleanUrl = image.split('?')[0]
      image = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=1200&h=630&fit=cover&q=80&output=jpg`
    }

    const proxyUrl = `${appUrl}/share/noticia/${newsId}`
    const html = `<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <meta http-equiv="refresh" content="0;url=${redirectUrl}">
        <meta property="og:type" content="article">
        <meta property="og:url" content="${proxyUrl}">
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${image}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="${proxyUrl}">
        <meta property="twitter:title" content="${title}">
        <meta property="twitter:description" content="${description}">
        <meta property="twitter:image" content="${image}">
        <meta name="image" content="${image}">
        <script>
          setTimeout(function(){ window.location.href = "${redirectUrl}"; }, 100);
        </script>
      </head>
      <body>
        <div style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 2rem;">
          <p>Redirecionando...</p>
          <p><a href="${redirectUrl}" style="color:#0066cc;text-decoration:underline;">Clique aqui se não for redirecionado automaticamente</a></p>
        </div>
      </body>
      </html>`

    const headers = new Headers()
    headers.set('Content-Type', 'text/html')
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('X-Debug-User-Agent', userAgent)
    headers.set('X-Debug-Is-Bot', String(isBot))

    return new Response(html, { headers })
  } catch (err) {
    console.error('Unexpected error (share-news):', err)
    return Response.redirect(redirectUrl, 302)
  }
})
