import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Resend } from "npm:resend@2.0.0"

const resend = new Resend(Deno.env.get('RESEND_API_KEY'))

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, name, petitionTitle, petitionUrl } = await req.json()

    if (!email) {
      throw new Error('Email is required')
    }

    const { data, error } = await resend.emails.send({
      from: 'Trombone Cidadão <onboarding@resend.dev>', // Users should update this to their domain
      to: [email],
      subject: `Obrigado por assinar: ${petitionTitle}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h1 style="color: #111;">Sua voz foi ouvida! 📢</h1>
          <p>Olá, <strong>${name || 'Cidadão'}</strong>,</p>
          <p>Obrigado por assinar o abaixo-assinado <strong>"${petitionTitle}"</strong>.</p>
          <p>Sua participação é fundamental para pressionar as autoridades e gerar mudanças reais.</p>
          
          <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 0; font-weight: bold;">Próximos passos:</p>
            <ul style="margin-top: 10px;">
              <li>Compartilhe com 3 amigos (isso triplica o impacto!)</li>
              <li>Acompanhe o progresso no nosso aplicativo</li>
            </ul>
          </div>

          <a href="${petitionUrl}" style="display: inline-block; background-color: #000000; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
            Ver Petição
          </a>

          <p style="margin-top: 30px; font-size: 12px; color: #666;">
            Se você não realizou esta assinatura, por favor ignore este email.
          </p>
        </div>
      `,
    })

    if (error) {
        console.error('Resend Error:', error);
        throw error;
    }

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
