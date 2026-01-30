import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const reportId = url.searchParams.get('id')

  if (!reportId) {
    return new Response('Missing id', { status: 400 })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const appUrl = Deno.env.get('APP_URL') || 'https://trombonecidadao.com.br'

  const supabase = createClient(supabaseUrl, supabaseKey)

  // Fetch Report Data
  // Note: relying on signatures(count) might fail if table missing, but we assume migration run.
  // Fallback to 0 if error.
  const { data: report, error } = await supabase
    .from('reports')
    .select(`
      title, 
      description, 
      report_media(url),
      signatures(count)
    `)
    .eq('id', reportId)
    .single()

  const title = report?.title || 'Abaixo-assinado'
  // Calculate goal for text
  const signatureCount = report?.signatures?.[0]?.count || 0
  const nextGoal = signatureCount < 100 ? 100 : Math.ceil((signatureCount + 1000) / 1000) * 1000;
  
  const description = `${signatureCount} pessoas já assinaram. Ajude a chegar em ${nextGoal}!`
  const imageUrl = report?.report_media?.[0]?.url || `${appUrl}/logo.png`
  
  // Use dynamic OG Image generator
  const params = new URLSearchParams()
  params.set('title', title)
  params.set('count', signatureCount.toString())
  params.set('goal', nextGoal.toString())
  if (imageUrl) params.set('image', imageUrl)
  
  // Note: We use the function URL. In production it's usually under the same domain or functions domain.
  // If SUPABASE_URL ends with .supabase.co, functions are at .supabase.co/functions/v1
  const ogImageUrl = `${supabaseUrl}/functions/v1/og-image?${params.toString()}`

  const finalUrl = `${appUrl}/bronca/${reportId}`

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
      <head>
        <meta charset="utf-8">
        <title>${title} | Trombone Cidadão</title>
        <meta name="description" content="${description}">
        
        <!-- Open Graph / Facebook -->
        <meta property="og:type" content="website">
        <meta property="og:url" content="${finalUrl}">
        <meta property="og:title" content="${title}">
        <meta property="og:description" content="${description}">
        <meta property="og:image" content="${ogImageUrl}">
        <meta property="og:image:width" content="1200">
        <meta property="og:image:height" content="630">

        <!-- Twitter -->
        <meta property="twitter:card" content="summary_large_image">
        <meta property="twitter:url" content="${finalUrl}">
        <meta property="twitter:title" content="${title}">
        <meta property="twitter:description" content="${description}">
        <meta property="twitter:image" content="${ogImageUrl}">
        
        <meta http-equiv="refresh" content="0;url=${finalUrl}">
      </head>
      <body>
        <p>Redirecionando para <a href="${finalUrl}">${title}</a>...</p>
        <script>window.location.href = "${finalUrl}"</script>
      </body>
    </html>
  `

  return new Response(html, {
    headers: { ...corsHeaders, 'content-type': 'text/html; charset=utf-8' },
  })
})
