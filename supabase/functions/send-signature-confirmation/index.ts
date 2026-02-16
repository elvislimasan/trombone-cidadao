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
    const { email, name, petitionTitle, petitionUrl, petitionImage } = await req.json()

    if (!email) {
      throw new Error('Email is required')
    }

    const apiKey = Deno.env.get('SENDER_API_KEY')
    if (!apiKey) {
      throw new Error('SENDER_API_KEY is not set in environment variables')
    }

    const fromEnv = Deno.env.get('SENDER_FROM_EMAIL') || Deno.env.get('RESEND_FROM_EMAIL') || 'Trombone Cidadão <contato@exemplo.com>'
    let fromEmail = fromEnv
    let fromName = 'Trombone Cidadão'
    const fromMatch = fromEnv.match(/^(.*)<(.+@.+)>$/)
    if (fromMatch) {
      fromName = fromMatch[1].trim()
      fromEmail = fromMatch[2].trim()
    }

    let recipient = email

    const BRAND_PRIMARY = '#E63946'
    const BRAND_TEXT = '#111827'
    const BRAND_MUTED = '#6B7280'
    const CARD_BG = '#ffffff'
    const CARD_BORDER = '#e5e7eb'
    const MUTED_BG = '#F9FAFB'

    const bannerHtml = petitionImage
      ? `<img src="${petitionImage}" alt="${petitionTitle}" style="width:100%; max-height:300px; object-fit:cover; display:block; border-radius: 12px; margin-bottom: 16px;" />`
      : ''

    const payload = {
      from: {
        email: fromEmail,
        name: fromName,
      },
      to: {
        email: recipient,
        name: name || 'Cidadão',
      },
      subject: `Obrigado por assinar: ${petitionTitle}`,
      html: `
      <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
        <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
          ${bannerHtml}
          <h1 style="margin:0 0 8px 0; font-size:24px; line-height:1.2; color:${BRAND_TEXT};">
            Sua voz foi ouvida! 📢
          </h1>
          <p style="margin:0 0 12px 0; color:${BRAND_MUTED}; font-size:14px;">
            Olá, <strong style="color:${BRAND_TEXT};">${name || 'Cidadão'}</strong>
          </p>
          <p style="margin:0 0 12px 0; color:${BRAND_TEXT}; font-size:15px;">
            Obrigado por assinar o abaixo-assinado <strong>"${petitionTitle}"</strong>.
          </p>
          <p style="margin:0 16px 20px 0; color:${BRAND_MUTED}; font-size:14px;">
            Sua participação é fundamental para pressionar as autoridades e gerar mudanças reais.
          </p>
          
          <div style="background:#F3F4F6; padding:16px; border-radius:12px; margin: 12px 0 20px 0;">
            <p style="margin:0; font-weight:600; color:${BRAND_TEXT};">Próximos passos:</p>
            <ul style="margin:10px 0 0 16px; color:${BRAND_MUTED}; font-size:14px;">
              <li>Compartilhe com 3 amigos (isso triplica o impacto!)</li>
              <li>Acompanhe o progresso na página da campanha</li>
            </ul>
          </div>

          <div style="text-align:center; margin-top:16px;">
            <a href="${petitionUrl}" style="background:${BRAND_PRIMARY}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">
              Ver Petição
            </a>
          </div>
          
          <p style="margin-top:24px; font-size:12px; color:${BRAND_MUTED}; text-align:center;">
            Se você não realizou esta assinatura, por favor ignore este email.
          </p>
        </div>
      </div>
      `,
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
      JSON.stringify(data),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    )
  }
})
