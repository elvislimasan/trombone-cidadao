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
  const workId = url.searchParams.get('id')
  
  // Initialize Supabase Client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Default fallback values
  const defaultTitle = 'Obra Pública - Trombone Cidadão'
  const defaultDesc = 'Acompanhe o andamento das obras públicas em Floresta-PE no Trombone Cidadão.'
  
  // Smart App URL Detection based on Supabase Project ID
  let appUrl = 'https://trombonecidadao.com.br'; // Production default
  
  if (supabaseUrl.includes('xxdletrjyjajtrmhwzev')) {
    // Development Environment
    appUrl = 'https://trombone-cidadao.vercel.app';
  } else if (supabaseUrl.includes('mrejgpcxaevooofyenzq')) {
    // Production Environment
    appUrl = 'https://trombonecidadao.com.br';
  }
  
  const defaultImage = `${appUrl}/images/thumbnail.jpg`;

  // Construct the destination URL
  const redirectUrl = workId 
    ? `${appUrl}/obras-publicas/${workId}`
    : appUrl;

  // 1. User-Agent Detection
  const userAgent = req.headers.get('user-agent') || '';
  const botRegex = /bot|googlebot|crawler|spider|robot|crawling|facebook|twitter|whatsapp|telegram|discord|slack|skype|linkedin|applebot|bingbot|yahoo|duckduckgo|yandex/i;
  
  const isBot = botRegex.test(userAgent);

  // 2. If it's a human (not a bot), redirect immediately via 302
  if (!isBot) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl
      }
    });
  }

  // 3. If no ID, redirect anyway (fallback)
  if (!workId) {
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

    // Fetch work data
    // We try to fetch relation, but if it fails (no FK), we handle it gracefully or use separate query
    // To be safe, let's fetch work first, then media if needed.
    const { data: work, error } = await supabase
      .from('public_works')
      .select('id, title, description, thumbnail_url')
      .eq('id', workId)
      .single()

    if (!error && work) {
      title = work.title ? `Obra: ${work.title} - Trombone Cidadão` : defaultTitle
      description = (work.description || defaultDesc)
        .replace(/[\n\r]/g, ' ')
        .replace(/"/g, '&quot;')
        .substring(0, 200)
        .trim()
      
      // Image Logic:
      // 1. Specific thumbnail_url
      if (work.thumbnail_url) {
        image = work.thumbnail_url;
      } else {
        // 2. Fetch media separately to avoid relationship issues
        const { data: media } = await supabase
          .from('public_work_media')
          .select('*')
          .eq('work_id', workId)
          .or('type.eq.image,type.eq.photo')
          .order('created_at', { ascending: true }) // Oldest first (often the main one) or logic
          .limit(1);

         if (media && media.length > 0) {
            const mediaItem = media[0];
            image = mediaItem.url || mediaItem.publicUrl;
         }
      }
      
      // Ensure absolute URL for image
      if (image && !image.startsWith('http')) {
        const path = image.startsWith('/') ? image : `/${image}`;
        if (image.includes('storage/v1')) {
             image = `${supabaseUrl}${path}`;
        } else {
             image = `${appUrl}${path}`;
        }
      }
    }

    // Optimize image URL if it's a direct link (using wsrv.nl)
    if (image && !image.includes('wsrv.nl') && image.startsWith('http')) {
      const cleanUrl = image.split('?')[0];
      image = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=1200&h=630&fit=cover&q=80&output=jpg`;
    }

    // HTML Template with Meta Tags
    const proxyUrl = `${appUrl}/share/obra/${workId}`;

    const html = `<!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>${title}</title>
        <meta http-equiv="refresh" content="0;url=${redirectUrl}">
        
        <!-- Open Graph / Facebook -->
        <meta property="og:type" content="website">
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
      headers.set('X-Debug-Version', '1.1-share-work-safe');
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
