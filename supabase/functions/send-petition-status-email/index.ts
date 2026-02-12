import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { Resend } from "npm:resend@2.0.0"

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
    const resend = new Resend(apiKey)

    const { petitionId, authorId, status, rejectionReason, petitionTitle, petitionUrl } = await req.json()
    
    if (!authorId || !status || !petitionTitle) {
      throw new Error('Missing required fields')
    }

    // Create Admin Client to fetch user email
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Fetch User Email
    const { data: { user }, error: userError } = await supabaseAdmin.auth.admin.getUserById(authorId)
    
    if (userError || !user || !user.email) {
      throw new Error(`User not found or has no email: ${userError?.message || 'Unknown error'}`)
    }

    const email = user.email
    const name = user.user_metadata?.name || 'Cidadão'
    const appUrl = Deno.env.get('APP_URL') || 'https://trombonecidadao.com.br'

    let emailSubject = ''
    let emailHtml = ''

    if (status === 'approved') {
      emailSubject = `Abaixo-assinado aprovado! 🎉 - ${petitionTitle}`
      emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #eee; border-radius: 8px; padding: 20px;">
          <h1 style="color: #111; margin-bottom: 20px;">Boas notícias, ${name}! 🚀</h1>
          <p>Seu abaixo-assinado <strong>"${petitionTitle}"</strong> foi aprovado pela nossa equipe de moderação.</p>
          <p>Ele já está disponível no site e pronto para receber assinaturas. Comece a compartilhar agora mesmo para ganhar tração!</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${petitionUrl}" style="background-color: #E63946; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Ver Abaixo-assinado
            </a>
          </div>
          
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 14px; color: #666;">
            Dicas para uma campanha de sucesso:
            <ul style="margin-top: 10px;">
              <li>Compartilhe no WhatsApp e redes sociais</li>
              <li>Explique a importância da causa para seus amigos</li>
              <li>Mantenha seus apoiadores atualizados</li>
            </ul>
          </p>
        </div>
      `
    } else if (status === 'rejected') {
      emailSubject = `Atualização sobre seu abaixo-assinado - ${petitionTitle}`
      emailHtml = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #eee; border-radius: 8px; padding: 20px;">
          <h1 style="color: #111; margin-bottom: 20px;">Olá, ${name}</h1>
          <p>Analisamos seu abaixo-assinado <strong>"${petitionTitle}"</strong> e, no momento, ele não pôde ser aprovado para publicação.</p>
          
          <div style="background-color: #FFF5F5; border-left: 4px solid #E63946; padding: 15px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold; color: #E63946;">Motivo da não aprovação:</p>
            <p style="margin: 10px 0 0 0;">${rejectionReason || 'Não atende aos termos de uso da plataforma.'}</p>
          </div>
          
          <p>Você pode editar seu abaixo-assinado seguindo as orientações acima e enviá-lo novamente para moderação através do seu painel.</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${appUrl}/minhas-peticoes" style="background-color: #111; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              Acessar Minhas Petições
            </a>
          </div>
          
          <hr style="border: 0; border-top: 1px solid #eee; margin: 30px 0;" />
          <p style="font-size: 14px; color: #666;">
            Se tiver dúvidas sobre nossa política de moderação, entre em contato com o suporte.
          </p>
        </div>
      `
    } else {
      throw new Error(`Unsupported status: ${status}`)
    }

    // --- RESEND TEST MODE SAFEGUARD ---
    const TEST_EMAIL = 'lairtondasilva07@gmail.com';
    const isTestingDomain = true; // Assumindo uso do domínio padrão de teste

    let recipient = email;
    if (isTestingDomain) {
      console.log(`Modo de Teste Resend: Redirecionando de ${email} para ${TEST_EMAIL}`);
      recipient = TEST_EMAIL;
    }

    const { data, error } = await resend.emails.send({
      from: 'Trombone Cidadão <onboarding@resend.dev>',
      to: [recipient],
      subject: emailSubject,
      html: emailHtml,
    })

    if (error) {
      throw error
    }

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
