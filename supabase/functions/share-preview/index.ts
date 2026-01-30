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
  const reportId = url.searchParams.get('id')
  
  // Initialize Supabase Client
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  // Default fallback values
  const defaultTitle = 'Trombone Cidadão'
  const defaultDesc = 'Plataforma colaborativa para solicitação de serviços públicos em Floresta-PE.'
  
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
  const redirectUrl = reportId 
    ? `${appUrl}/bronca/${reportId}`
    : appUrl;

  // 1. User-Agent Detection
  const userAgent = req.headers.get('user-agent') || '';
  const botRegex = /bot|googlebot|crawler|spider|robot|crawling|facebook|twitter|whatsapp|telegram|discord|slack|skype|linkedin|applebot|bingbot|yahoo|duckduckgo|yandex/i;
  
  const isBot = botRegex.test(userAgent);
  const isDebug = url.searchParams.has('debug');

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
  if (!reportId) {
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': appUrl
      }
    });
  }

  try {
    // Fetch report data
    const { data: report, error } = await supabase
      .from('reports')
      .select('title, description, protocol, id, report_media(*)')
      .eq('id', reportId)
      .single()

    if (error || !report) {
      console.error('Error fetching report:', error)
      return Response.redirect(`${appUrl}/bronca/${reportId}`, 302)
    }

    // Prepare Meta Data
    const title = report.title ? `${report.title} - Trombone Cidadão` : defaultTitle
    const description = report.description || defaultDesc
    
    // Determine Image URL
    let image = defaultImage
    let debugPhotosFound = 0;
    
    // Check report_media for photos
    let photos = report.report_media?.filter((m: any) => m.type === 'photo') || []
    debugPhotosFound = photos.length;
    
    // Sort by created_at to ensure consistent order (first uploaded image)
    photos.sort((a: any, b: any) => {
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        return dateA - dateB;
    });

    if (photos.length > 0) {
      // Try to find the first valid photo URL
      for (const photo of photos) {
          // Check all possible fields for URL
          let rawUrl = photo.url || photo.publicUrl || photo.photo_url || photo.image_url;
          
          if (rawUrl) {
            rawUrl = rawUrl.trim();
            let candidateImage = '';
            
            // Construct Absolute URL correctly
            if (rawUrl.startsWith('http')) {
                candidateImage = rawUrl;
            } else if (rawUrl.startsWith('/storage') || rawUrl.includes('storage/v1/object')) {
                // It's a Supabase Storage path, prepend Supabase URL, not App URL
                // Ensure no double slash
                const baseUrl = supabaseUrl.replace(/\/$/, '');
                const path = rawUrl.startsWith('/') ? rawUrl : `/${rawUrl}`;
                candidateImage = `${baseUrl}${path}`;
            } else if (rawUrl.startsWith('/')) {
                candidateImage = `${appUrl}${rawUrl}`;
            } else {
                candidateImage = `${appUrl}/${rawUrl}`;
            }
            
            // If we found a candidate, use it and break (we want the first valid one)
            if (candidateImage) {
                // Use wsrv.nl as a robust image resizing proxy
                // This works for ANY public image URL (Supabase, S3, external)
                // It is faster and more reliable than Supabase transformations for social media thumbnails
                
                // 1. Clean the URL
                const cleanUrl = candidateImage.split('?')[0]; // Remove existing params
                
                // 2. Construct wsrv.nl URL
                // w=600, h=315: Recommended size for WhatsApp/Facebook thumbnails
                // fit=cover: Ensures image fills the dimensions without distortion
                // q=60: Quality 60% to reduce file size
                // output=jpg: Ensure compatibility
                candidateImage = `https://wsrv.nl/?url=${encodeURIComponent(cleanUrl)}&w=600&h=315&fit=cover&q=60&output=jpg`;
                
                image = candidateImage;
                break;
            }
          }
      }
    }

    // HTML Template with Meta Tags
    // Use the proxy URL as the canonical URL so WhatsApp displays the correct domain
    const proxyUrl = `${appUrl}/share/bronca/${reportId}`;
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
          <p>Redirecionando para a bronca...</p>
          <p><a href="${redirectUrl}" style="color: #0066cc; text-decoration: underline;">Clique aqui se não for redirecionado automaticamente</a></p>
        </div>
      </body>
      </html>`;

     // Create a Blob to enforce Content-Type
     // const blob = new Blob([html], { type: 'text/html; charset=utf-8' });
 
     const headers = new Headers();
      headers.set('Content-Type', 'text/html');
      headers.set('X-Debug-Version', '10-debug-ua');
      headers.set('X-Debug-Photos-Count', String(debugPhotosFound));
      headers.set('X-Debug-User-Agent', userAgent);
      headers.set('X-Debug-Is-Bot', String(isBot));
      headers.set('Access-Control-Allow-Origin', '*');
 
      return new Response(html, {
        headers,
      })

  } catch (err) {
    console.error('Unexpected error:', err)
    return Response.redirect(`${appUrl}/bronca/${reportId}`, 302)
  }
})
