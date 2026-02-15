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

    const { petitionId, authorId, status, rejectionReason, petitionTitle, petitionUrl } = await req.json()
    
    if (!authorId || !status || !petitionTitle) {
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
    if (petitionId) {
      const { data: p } = await supabaseAdmin
        .from('petitions')
        .select('image_url, gallery')
        .eq('id', petitionId)
        .maybeSingle()
      bannerUrl = p?.image_url || (Array.isArray(p?.gallery) && p?.gallery.length > 0 ? p?.gallery[0] : null)
    }

    const BRAND_PRIMARY = '#E63946'
    const BRAND_TEXT = '#111827'
    const BRAND_MUTED = '#6B7280'
    const CARD_BG = '#ffffff'
    const CARD_BORDER = '#e5e7eb'
    const MUTED_BG = '#F9FAFB'

    const bannerHtml = bannerUrl
      ? `<img src="${bannerUrl}" alt="${petitionTitle}" style="width:100%; max-height:300px; object-fit:cover; display:block; border-radius: 12px; margin-bottom: 16px;" />`
      : ''

    let emailSubject = ''
    let emailHtml = ''

    if (status === 'approved') {
      emailSubject = `Abaixo-assinado aprovado! 🎉 - ${petitionTitle}`
      emailHtml = `
      <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
        <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
          ${bannerHtml}
          <h1 style="margin:0 0 8px 0; font-size:22px; color:${BRAND_TEXT};">Boas notícias, ${name}! 🚀</h1>
          <p style="margin:0 0 10px 0; color:${BRAND_TEXT};">Seu abaixo-assinado <strong>"${petitionTitle}"</strong> foi aprovado.</p>
          <p style="margin:0 0 20px 0; color:${BRAND_MUTED}; font-size:14px;">Ele já está disponível e pronto para receber assinaturas. Compartilhe para ganhar tração!</p>
          <div style="text-align:center; margin: 20px 0;">
            <a href="${petitionUrl}" style="background:${BRAND_PRIMARY}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">Ver Abaixo-assinado</a>
          </div>
          <div style="background:#F3F4F6; padding:16px; border-radius:12px;">
            <p style="margin:0; color:${BRAND_TEXT}; font-weight:600;">Dicas rápidas:</p>
            <ul style="margin:8px 0 0 16px; color:${BRAND_MUTED}; font-size:14px;">
              <li>Compartilhe no WhatsApp e redes sociais</li>
              <li>Explique a importância da causa para amigos</li>
              <li>Mantenha apoiadores atualizados com novidades</li>
            </ul>
          </div>
        </div>
      </div>`
    } else if (status === 'rejected') {
      emailSubject = `Atualização sobre seu abaixo-assinado - ${petitionTitle}`
      emailHtml = `
        <div style="font-family: Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; background:${MUTED_BG}; padding:24px;">
          <div style="max-width:640px; margin:0 auto; background:${CARD_BG}; border:1px solid ${CARD_BORDER}; border-radius:16px; padding:24px;">
            ${bannerHtml}
            <h1 style="margin:0 0 8px 0; font-size:22px; color:${BRAND_TEXT};">Olá, ${name}</h1>
            <p style="margin:0 0 10px 0; color:${BRAND_TEXT};">Analisamos seu abaixo-assinado <strong>"${petitionTitle}"</strong> e, no momento, ele não pôde ser aprovado.</p>
            <div style="background:#FFF5F5; border-left:4px solid ${BRAND_PRIMARY}; padding:12px 14px; margin:16px 0; border-radius:8px;">
              <p style="margin:0; font-weight:700; color:${BRAND_PRIMARY};">Motivo da não aprovação:</p>
              <p style="margin:8px 0 0 0; color:${BRAND_TEXT};">${rejectionReason || 'Não atende aos termos de uso da plataforma.'}</p>
            </div>
            <p style="margin:0 0 16px 0; color:${BRAND_MUTED}; font-size:14px;">Você pode editar sua campanha e reenviá-la para moderação através do seu painel.</p>
            <div style="text-align:center; margin: 12px 0;">
              <a href="${appUrl}/minhas-peticoes" style="background:${BRAND_TEXT}; color:#fff; padding:12px 20px; text-decoration:none; border-radius:10px; font-weight:700; display:inline-block;">Acessar Minhas Petições</a>
            </div>
          </div>
        </div>
      `
    } else {
      throw new Error(`Unsupported status: ${status}`)
    }

    const fromEnv = Deno.env.get('SENDER_FROM_EMAIL') || Deno.env.get('RESEND_FROM_EMAIL') || 'Trombone Cidadão <contato@exemplo.com>'
    let fromEmail = fromEnv
    let fromName = 'Trombone Cidadão'
    const fromMatch = fromEnv.match(/^(.*)<(.+@.+)>$/)
    if (fromMatch) {
      fromName = fromMatch[1].trim()
      fromEmail = fromMatch[2].trim()
    }

    const recipient = email

    const payload = {
      from: {
        email: fromEmail,
        name: fromName,
      },
      to: {
        email: recipient,
        name: name || 'Cidadão',
      },
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
