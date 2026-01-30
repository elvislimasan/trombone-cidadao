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
  const petitionId = url.searchParams.get('id')
  
  // Initialize Supabase Client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Default fallback values
  const defaultTitle = 'Abaixo-Assinado - Trombone Cidadão'
  const defaultDesc = 'Assine esta petição e ajude a fazer a diferença!'
  
  // Smart App URL Detection based on Supabase Project ID
  let appUrl = 'https://trombonecidadao.com.br'; // Production default
  
  if (supabaseUrl.includes('xxdletrjyjajtrmhwzev')) {
    // Development Environment
    appUrl = 'https://trombone-cidadao.vercel.app';
  } else if (supabaseUrl.includes('mrejgpcxaevooofyenzq')) {
    // Production Environment
    appUrl = 'https://trombonecidadao.com.br';
  }
  
  const defaultImage = `${appUrl}/images/thumbnail.jpg`

  // Construct the destination URL
  const redirectUrl = petitionId 
    ? `${appUrl}/abaixo-assinado/${petitionId}`
    : appUrl;

  // 1. User-Agent Detection
  const userAgent = req.headers.get('user-agent') || '';
  const botRegex = /bot|googlebot|crawler|spider|robot|crawling|facebook|twitter|whatsapp|telegram|discord|slack|skype|linkedin|applebot|bingbot|yahoo|duckduckgo|yandex/i;
  
  const isBot = botRegex.test(userAgent);
  const isDebug = url.searchParams.has('debug');

  if (isDebug) {
      try {
        const { data: petition, error } = await supabase
            .from('petitions')
            .select('title, description, image_url, gallery, id')
            .eq('id', petitionId)
            .single();

        return new Response(JSON.stringify({
            userAgent,
            isBot,
            petitionId,
            dbResult: { petition, error },
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
  if (!petitionId) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': appUrl
      }
    });
  }

  try {
    // Fetch petition data
    const { data: petition, error } = await supabase
      .from('petitions')
      .select('title, description, image_url, gallery, id')
      .eq('id', petitionId)
      .single()

    if (error || !petition) {
      console.error('Error fetching petition:', error)
      return Response.redirect(redirectUrl, 302)
    }

    // Prepare Meta Data
    const title = petition.title ? `${petition.title} - Trombone Cidadão` : defaultTitle
    const description = petition.description 
        ? (petition.description.length > 200 ? petition.description.substring(0, 197) + '...' : petition.description)
        : defaultDesc
    
    // Determine Image URL
    let image = defaultImage
    let rawUrl = null;

    // Prioritize gallery, then main image
    if (petition.gallery && petition.gallery.length > 0) {
        rawUrl = petition.gallery[0];
    } else if (petition.image_url) {
        rawUrl = petition.image_url;
    }

    if (rawUrl) {
        rawUrl = rawUrl.trim();
        let candidateImage = '';
        
        // Construct Absolute URL correctly
        if (rawUrl.startsWith('http')) {
            candidateImage = rawUrl;
        } else if (rawUrl.startsWith('/storage') || rawUrl.includes('storage/v1/object')) {
            const baseUrl = supabaseUrl.replace(/\/$/, '');
            const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
            candidateImage = `${baseUrl}${path}`;
        } else if (rawUrl.startsWith('/')) {
            candidateImage = `${appUrl}${rawUrl}`;
        } else {
            candidateImage = `${appUrl}/${rawUrl}`;
        }
        
        if (candidateImage) {
            // Use wsrv.nl for optimization
            const cleanUrl = candidateImage.split('?')[0];
            // w=1200, h=630 for large card format
            image = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=1200&h=630&fit=cover&q=80&output=jpg`;
        }
    }

    // HTML Template with Meta Tags
    const proxyUrl = `${appUrl}/share/abaixo-assinado/${petitionId}`;

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
          <p>Redirecionando para o abaixo-assinado...</p>
          <p><a href="${redirectUrl}" style="color: #0066cc; text-decoration: underline;">Clique aqui se não for redirecionado automaticamente</a></p>
        </div>
      </body>
      </html>`;

     const headers = new Headers();
      headers.set('Content-Type', 'text/html');
      headers.set('Access-Control-Allow-Origin', '*');
 
      return new Response(html, {
        headers,
      })

  } catch (err) {
    console.error('Unexpected error:', err)
    return Response.redirect(redirectUrl, 302)
  }
})
