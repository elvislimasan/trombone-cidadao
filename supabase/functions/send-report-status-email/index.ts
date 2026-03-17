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

  try {
    const apiKey = Deno.env.get('RESEND_API_KEY')
    if (!apiKey) {
      throw new Error('RESEND_API_KEY is not set in environment variables')
    }

    const { reportId, authorId, status, rejectionTitle, rejectionDescription, reportTitle, reportUrl } = await req.json()

    if (!authorId || !status || !reportTitle) {
      throw new Error('Missing required fields')
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(authorId)

    if (userError || !user || !user.email) {
      throw new Error(`User not found or has no email: ${userError?.message || 'Unknown error'}`)
    }

    const email = user.email
    const name = user.user_metadata?.name || 'Cidadão'
    const appUrl = Deno.env.get('APP_URL') || 'https://trombonecidadao.com.br'

    let bannerUrl: string | null = null
    if (reportId) {
      try {
        const { data: media } = await supabaseAdmin
          .from('report_media')
          .select('url')
          .eq('report_id', reportId)
          .eq('type', 'photo')
          .order('created_at', { ascending: true })
          .limit(1)
        bannerUrl = Array.isArray(media) && media.length > 0 ? media[0]?.url : null
      } catch (_) {}
    }

    const BRAND_PRIMARY = '#E63946'
    const BRAND_TEXT = '#111827'
    const BRAND_MUTED = '#6B7280'
    const CARD_BG = '#ffffff'
    const CARD_BORDER = '#e5e7eb'
    const MUTED_BG = '#F9FAFB'

    const bannerHtml = bannerUrl
      ? `<img src="${bannerUrl}" alt="${reportTitle}" style="width:100%; max-height:300px; object-fit:cover; display:block; border-radius: 12px; margin-bottom: 16px;" />`
      : ''

    let emailSubject = ''
    let emailHtml = ''

    if (status === 'rejected') {
      emailSubject = `Sua bronca foi rejeitada - ${reportTitle}`
      emailHtml = `
        <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
          <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
            ${bannerHtml}
            <h1 style="margin:0 0 8px 0; font-size:22px; color:${BRAND_TEXT};">Olá, ${name}</h1>
            <p style="margin:0 0 12px 0; color:${BRAND_TEXT};">Analisamos sua bronca <strong>"${reportTitle}"</strong> e, no momento, ela não pôde ser aprovada.</p>
            <div style="background:#FFF5F5; border-left:4px solid ${BRAND_PRIMARY}; padding:12px 14px; margin:16px 0; border-radius:8px;">
              <p style="margin:0; font-weight:700; color:${BRAND_PRIMARY};">${rejectionTitle || 'Motivo da recusa'}</p>
              <p style="margin:8px 0 0 0; color:${BRAND_TEXT};">${rejectionDescription || 'A bronca não atende aos termos de uso da plataforma.'}</p>
            </div>
            <p style="margin:0 0 16px 0; color:${BRAND_MUTED}; font-size:14px;">Acesse seu painel para conferir os detalhes e fazer ajustes, se necessário.</p>
            <div style="text-align:center; margin: 12px 0;">
              <a href="${reportUrl || `${appUrl}/painel-usuario`}" style="background:${BRAND_TEXT}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">Abrir Meu Painel</a>
            </div>
          </div>
        </div>
      `
    } else {
      throw new Error(`Unsupported status: ${status}`)
    }

    const fromEnv = Deno.env.get('RESEND_FROM_EMAIL') || 'Trombone Cidadão <contato@exemplo.com>'

    const payload = {
      from: fromEnv,
      to: [email],
      subject: emailSubject,
      html: emailHtml,
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Resend API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()

    return new Response(
      JSON.stringify({ message: 'Email sent successfully', data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )
  } catch (error) {
    console.error('Error:', error)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
