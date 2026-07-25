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
    const apiKey = Deno.env.get('SENDER_API_KEY')
    if (!apiKey) {
      throw new Error('SENDER_API_KEY is not set in environment variables')
    }

    const { userId, status, cityName, rejectionReason, applicantName, applicantEmail } = await req.json()

    if (!status) {
      throw new Error('Missing required field: status')
    }
    if (status !== 'approved' && status !== 'rejected') {
      throw new Error(`Unsupported status: ${status}`)
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Resolve o e-mail: prioriza o do usuário (fonte de verdade); cai no
    // applicantEmail enviado pelo cliente se o lookup falhar.
    let email: string | null = applicantEmail || null
    let name = applicantName || 'Cidadão'
    if (userId) {
      const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(userId)
      if (user?.email) email = user.email
      if (user?.user_metadata?.name) name = user.user_metadata.name
    }
    if (!email) {
      throw new Error('No recipient email available for this application')
    }

    const appUrl = Deno.env.get('APP_URL') || 'https://trombonecidadao.com.br'
    const city = cityName || 'sua cidade'

    const BRAND_PRIMARY = '#E63946'
    const BRAND_TEXT = '#111827'
    const BRAND_MUTED = '#6B7280'
    const CARD_BG = '#ffffff'
    const CARD_BORDER = '#e5e7eb'
    const MUTED_BG = '#F9FAFB'

    let emailSubject = ''
    let emailHtml = ''

    if (status === 'approved') {
      emailSubject = `Você é embaixador de ${city}! 🎉 - Trombone Cidadão`
      emailHtml = `
      <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
        <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
          <h1 style="margin:0 0 8px 0; font-size:22px; color:${BRAND_TEXT};">Parabéns, ${name}! 🎉</h1>
          <p style="margin:0 0 10px 0; color:${BRAND_TEXT};">Sua candidatura para ser <strong>embaixador de ${city}</strong> foi aprovada.</p>
          <p style="margin:0 0 20px 0; color:${BRAND_MUTED}; font-size:14px;">A partir de agora você pode moderar broncas e atualizações da sua cidade no painel de embaixador.</p>
          <div style="text-align:center; margin: 20px 0;">
            <a href="${appUrl}/embaixador" style="background:${BRAND_PRIMARY}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">Acessar o painel do embaixador</a>
          </div>
          <div style="background:#F3F4F6; padding:16px; border-radius:12px;">
            <p style="margin:0; color:${BRAND_TEXT}; font-weight:600;">Como embaixador você pode:</p>
            <ul style="margin:8px 0 0 16px; color:${BRAND_MUTED}; font-size:14px;">
              <li>Aprovar ou rejeitar broncas da sua cidade</li>
              <li>Moderar atualizações dos moradores</li>
              <li>Manter a plataforma com qualidade</li>
            </ul>
          </div>
        </div>
      </div>`
    } else {
      emailSubject = `Atualização sobre sua candidatura a embaixador - Trombone Cidadão`
      emailHtml = `
        <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
          <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
            <h1 style="margin:0 0 8px 0; font-size:22px; color:${BRAND_TEXT};">Olá, ${name}</h1>
            <p style="margin:0 0 10px 0; color:${BRAND_TEXT};">Analisamos sua candidatura para ser embaixador de <strong>${city}</strong> e, no momento, ela não pôde ser aprovada.</p>
            <div style="background:#FFF5F5; border-left:4px solid ${BRAND_PRIMARY}; padding:12px 14px; margin:16px 0; border-radius:8px;">
              <p style="margin:0; font-weight:700; color:${BRAND_PRIMARY};">Motivo:</p>
              <p style="margin:8px 0 0 0; color:${BRAND_TEXT};">${rejectionReason || 'Não atende aos critérios do programa de embaixadores no momento.'}</p>
            </div>
            <p style="margin:0 0 16px 0; color:${BRAND_MUTED}; font-size:14px;">Você pode se candidatar novamente futuramente pela página do programa de embaixadores.</p>
            <div style="text-align:center; margin: 12px 0;">
              <a href="${appUrl}/seja-embaixador" style="background:${BRAND_TEXT}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">Ver programa de embaixadores</a>
            </div>
          </div>
        </div>
      `
    }

    const fromEnv = Deno.env.get('SENDER_FROM_EMAIL') || Deno.env.get('RESEND_FROM_EMAIL') || 'Trombone Cidadão <contato@exemplo.com>'
    let fromEmail = fromEnv
    let fromName = 'Trombone Cidadão'
    const fromMatch = fromEnv.match(/^(.*)<(.+@.+)>$/)
    if (fromMatch) {
      fromName = fromMatch[1].trim()
      fromEmail = fromMatch[2].trim()
    }

    const payload = {
      from: { email: fromEmail, name: fromName },
      to: { email, name: name || 'Cidadão' },
      subject: emailSubject,
      html: emailHtml,
    }

    const response = await fetch('https://api.sender.net/v2/message/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Accept': 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Sender API error: ${response.status} - ${errorText}`)
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
