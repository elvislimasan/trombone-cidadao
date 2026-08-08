import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Verificação reCAPTCHA Enterprise (mesmo padrão de create-anonymous-report).
// Protege o cadastro de convidado contra criação em massa/abuso de terceiros.
const verifyRecaptcha = async (token: string, siteKey?: string | null) => {
  const apiKey = Deno.env.get('RECAPTCHA_ENTERPRISE_API_KEY')
  const projectId = Deno.env.get('RECAPTCHA_ENTERPRISE_PROJECT_ID')
  const defaultSiteKey = Deno.env.get('RECAPTCHA_ENTERPRISE_SITE_KEY')

  // Rollout seguro: se o ambiente reCAPTCHA não estiver configurado, não bloqueia
  // (mantém compatibilidade). Configure as env vars para tornar obrigatório.
  if (!apiKey || !projectId) {
    console.warn('[create-guest-user] reCAPTCHA Enterprise não configurado — captcha não exigido')
    return { success: true, skipped: true }
  }

  if (!token) return { success: false, error: 'missing_recaptcha_token' }

  const assessmentUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`
  const res = await fetch(assessmentUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: { token, siteKey: siteKey || defaultSiteKey } }),
  })
  const data = await res.json()
  if (!res.ok) return { success: false, error: 'recaptcha_error' }
  const valid = Boolean(data?.tokenProperties?.valid)
  const score = data?.riskAnalysis?.score ?? null
  const scoreOk = typeof score === 'number' ? score >= 0.5 : true
  return { success: valid && scoreOk }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, name, recaptchaToken, siteKey } = await req.json()

    if (!email) {
      throw new Error('Email is required')
    }

    // 🔒 Exige reCAPTCHA (quando configurado) antes de criar qualquer conta.
    const captcha = await verifyRecaptcha(
      recaptchaToken ? String(recaptchaToken) : '',
      siteKey ? String(siteKey) : null,
    )
    if (!captcha.success) {
      return new Response(
        JSON.stringify({ error: 'recaptcha_failed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const password = crypto.randomUUID();
    
    // Create user with auto-confirm enabled
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: { 
          name: name || 'Cidadão',
          full_name: name || 'Cidadão' // Send both to ensure compatibility with triggers
      }
    });

    if (error) {
      // If user already exists, we return a specific code so client knows
      // Supabase returns 422 or specific message for existing user
      if (error.message?.includes('already registered') || error.status === 422) {
         return new Response(
            JSON.stringify({ error: 'User already exists', code: 'USER_EXISTS' }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
         )
      }
      throw error;
    }

    if (data.user) {
      console.log(`User created: ${data.user.id}. Sending reset password email...`);
      
      // Send reset password email so they can change the random password
      const { error: resetError } = await supabaseAdmin.auth.resetPasswordForEmail(email);
      
      if (resetError) {
          console.warn("Reset password email failed:", resetError.message);
      } else {
          console.log("Reset password email sent successfully.");
      }

      // 🔒 NÃO retornar a senha no corpo da resposta. Devolver a senha aleatória
      // permitiria login imediato em conta atrelada a e-mail de terceiro
      // (account squatting). O usuário legítimo define a própria senha pelo
      // e-mail de reset enviado acima.
      return new Response(
        JSON.stringify({
            userId: data.user.id,
            created: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      )
    }

    throw new Error('Failed to create user');

  } catch (error) {
    console.error("Function Error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
