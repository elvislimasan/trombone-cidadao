import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

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

    const { email, token, cityName, cityUf, invitedByName } = await req.json()

    if (!email) throw new Error('Missing required field: email')
    if (!token) throw new Error('Missing required field: token')

    const appUrl = Deno.env.get('APP_URL') || 'https://trombonecidadao.com.br'
    const city = cityName || 'sua cidade'
    const cityLabel = cityUf ? `${city} (${cityUf})` : city
    const inviteUrl = `${appUrl}/convite/${token}`
    const invitedBy = invitedByName || 'a equipe do Trombone Cidadão'

    const BRAND_PRIMARY = '#E63946'
    const BRAND_TEXT = '#111827'
    const BRAND_MUTED = '#6B7280'
    const CARD_BG = '#ffffff'
    const CARD_BORDER = '#e5e7eb'
    const MUTED_BG = '#F9FAFB'

    const emailSubject = `Convite para ser embaixador de ${city} - Trombone Cidadão`
    const emailHtml = `
    <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
      <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
        <h1 style="margin:0 0 8px 0; font-size:22px; color:${BRAND_TEXT};">Você foi convidado! 🎉</h1>
        <p style="margin:0 0 10px 0; color:${BRAND_TEXT};">${invitedBy} convidou você para ser <strong>embaixador de ${cityLabel}</strong> no Trombone Cidadão.</p>
        <p style="margin:0 0 20px 0; color:${BRAND_MUTED}; font-size:14px;">Como embaixador, você poderá aprovar broncas, moderar atualizações de moradores e ajudar a manter a plataforma com qualidade na sua cidade.</p>
        <div style="text-align:center; margin: 20px 0;">
          <a href="${inviteUrl}" style="background:${BRAND_PRIMARY}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">Aceitar convite</a>
        </div>
        <p style="margin:0; color:${BRAND_MUTED}; font-size:12px;">Este convite expira em 7 dias. Se você não esperava este e-mail, pode ignorá-lo.</p>
      </div>
    </div>`

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
