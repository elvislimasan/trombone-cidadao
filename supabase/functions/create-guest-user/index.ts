import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.42.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { email, name } = await req.json()

    if (!email) {
      throw new Error('Email is required')
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

      return new Response(
        JSON.stringify({ 
            userId: data.user.id, 
            password: password, // Return password for auto-login
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
