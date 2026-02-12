import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const contentId = url.searchParams.get('id')
  const contentType = url.searchParams.get('type') || 'bronca' // 'bronca' ou 'peticao'
  const reportId = contentId // For debug compatibility
  
  // Default fallback values
  const defaultTitle = 'Trombone Cidadão'
  const defaultDesc = 'Plataforma colaborativa para solicitação de serviços públicos em Floresta-PE.'
  const appUrl = 'https://trombonecidadao.com.br'
  
  // Imagem padrão baseada no tipo
  const defaultImage = contentType === 'peticao' 
    ? `${appUrl}/abaixo-assinado.jpg`
    : `${appUrl}/images/thumbnail.jpg`;

  // Construct the destination URL
  const redirectUrl = contentId 
    ? (contentType === 'peticao' ? `${appUrl}/abaixo-assinado/${contentId}` : `${appUrl}/bronca/${contentId}`)
    : appUrl;

  // 1. User-Agent Detection
  const userAgent = req.headers.get('user-agent') || '';
  const botRegex = /bot|googlebot|crawler|spider|robot|crawling|facebook|twitter|whatsapp|telegram|discord|slack|skype|linkedin|applebot|bingbot|yahoo|duckduckgo|yandex/i;
  
  const isBot = botRegex.test(userAgent);
  const isDebug = url.searchParams.has('debug');

  // Initialize Supabase Client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  if (isDebug) {
      try {
        // Try to fetch report to debug DB errors
        const { data: report, error } = await supabase
            .from('reports')
            .select('title, description, protocol, id, report_media(*)')
            .eq('id', reportId)
            .single();

        let photos = [];
        let imageSelectionLog = [];
        
        if (report && report.report_media) {
             photos = report.report_media.filter((m: any) => m.type === 'photo');
             
             // Sort log
             photos.sort((a: any, b: any) => {
                const dateA = new Date(a.created_at || 0).getTime();
                const dateB = new Date(b.created_at || 0).getTime();
                return dateA - dateB;
            });
            
            for (const photo of photos) {
                 const rawUrl = photo.url || photo.publicUrl || photo.photo_url || photo.image_url;
                 imageSelectionLog.push({
                     id: photo.id,
                     created_at: photo.created_at,
                     rawUrl: rawUrl,
                     isAbsolute: rawUrl?.startsWith('http'),
                     isRelative: rawUrl?.startsWith('/')
                 });
            }
        }

        return new Response(JSON.stringify({
            userAgent,
            isBot,
            isBotRegex: botRegex.toString(),
            reportId,
            dbResult: { report, error },
            imageSelectionLog,
            headers: Object.fromEntries(req.headers.entries())
        }, null, 2), {
            headers: { 'Content-Type': 'application/json' }
        });
      } catch (e: any) {
        return new Response(JSON.stringify({
            error: e.message,
            stack: e.stack
        }, null, 2), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
      }
  }

  // 2. If it's a human (not a bot) and not debugging, redirect immediately via 302
  // This ensures the user never sees the Supabase URL in their browser bar
  if (!isBot && !isDebug) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl
      }
    });
  }

  // 3. If no ID, redirect anyway (fallback)
  if (!contentId) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': appUrl
      }
    });
  }

  try {
    let title = defaultTitle;
    let description = defaultDesc;
    let image = defaultImage;
    let signatureCount = '0';
    let goal = '100';

    if (contentType === 'peticao') {
      // Fetch petition data
      const { data: petition, error } = await supabase
        .from('petitions')
        .select('title, description, image_url, goal, signatures:signatures(count)')
        .eq('id', contentId)
        .single()

      if (!error && petition) {
        title = petition.title ? `${petition.title} - Trombone Cidadão` : defaultTitle
        description = petition.description || defaultDesc
        signatureCount = String(petition.signatures?.[0]?.count || 0)
        goal = String(petition.goal || 100)
        
        if (petition.image_url) {
          image = petition.image_url.startsWith('http') 
            ? petition.image_url 
            : `${supabaseUrl}/storage/v1/object/public/petition-images/${petition.image_url}`;
        }
      }
    } else {
      // Fetch report data
      const { data: report, error } = await supabase
        .from('reports')
        .select('title, description, protocol, id, report_media(*)')
        .eq('id', contentId)
        .single()

      if (!error && report) {
        title = report.title ? `${report.title} - Trombone Cidadão` : defaultTitle
        description = report.description || defaultDesc
        
        // Check report_media for photos
        let photos = report.report_media?.filter((m: any) => m.type === 'photo') || []
        
        // Sort by created_at
        photos.sort((a: any, b: any) => {
            const dateA = new Date(a.created_at || 0).getTime();
            const dateB = new Date(b.created_at || 0).getTime();
            return dateA - dateB;
        });

        if (photos.length > 0) {
          const photo = photos[0];
          let rawUrl = photo.url || photo.publicUrl || photo.photo_url || photo.image_url;
          if (rawUrl) {
            if (rawUrl.startsWith('http')) {
                image = rawUrl;
            } else {
                const baseUrl = supabaseUrl.replace(/\/$/, '');
                const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
                image = `${baseUrl}${path}`;
            }
          }
        }
      }
    }

    // Use og-image function if it's a petition for a better visual preview
    if (contentType === 'peticao' && contentId) {
      const ogImageUrl = new URL(`${supabaseUrl}/functions/v1/og-image`);
      ogImageUrl.searchParams.set('title', title.replace(' - Trombone Cidadão', ''));
      ogImageUrl.searchParams.set('count', signatureCount);
      ogImageUrl.searchParams.set('goal', goal);
      if (image && image !== defaultImage) {
        ogImageUrl.searchParams.set('image', image);
      }
      image = ogImageUrl.toString();
    } else if (image && !image.includes('wsrv.nl') && image.startsWith('http')) {
      // Optimize other images with wsrv.nl
      const cleanUrl = image.split('?')[0];
      image = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=600&h=315&fit=cover&q=60&output=jpg`;
    }

    // HTML Template with Meta Tags
    const proxyUrl = `${appUrl}/share/${contentType}/${contentId}`;
    // const redirectUrl is already defined above

    const html = `<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <meta name="description" content="${description}">
        <meta http-equiv="refresh" content="0;url=${redirectUrl}">
        
        <!-- Open Graph / Facebook -->
        <meta property="og:type" content="article">
        <meta property="og:url" content="${proxyUrl}">
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${image}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">
        
        <!-- Twitter -->
        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="${proxyUrl}">
        <meta property="twitter:title" content="${title}">
        <meta property="twitter:description" content="${description}">
        <meta property="twitter:image" content="${image}">

        <!-- WhatsApp / General -->
        <meta name="image" content="${image}">

        <!-- Redirect to App -->
        <script>
           setTimeout(function() {
             window.location.href = "${redirectUrl}";
           }, 100);
        </script>
      </head>
      <body>
        <div style="font-family: system-ui, -apple-system, sans-serif; text-align: center; padding: 2rem;">
          <p>Redirecionando...</p>
          <p><a href="${redirectUrl}" style="color: #0066cc; text-decoration: underline;">Clique aqui se não for redirecionado automaticamente</a></p>
        </div>
      </body>
      </html>`;

     const headers = new Headers();
      headers.set('Content-Type', 'text/html');
      headers.set('X-Debug-Version', '11-unified-share');
      headers.set('X-Debug-User-Agent', userAgent);
      headers.set('X-Debug-Is-Bot', String(isBot));
      headers.set('Access-Control-Allow-Origin', '*');
 
      return new Response(html, {
        headers,
      })

  } catch (err) {
    console.error('Unexpected error:', err)
    return Response.redirect(redirectUrl, 302)
  }
})
