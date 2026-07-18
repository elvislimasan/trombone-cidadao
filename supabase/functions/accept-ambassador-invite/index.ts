import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // 1. Verificar cabeçalho de autorização
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Token de autorização ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Confirmar identidade do usuário pelo JWT
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Usuário não autenticado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Obter token do body
    const body = await req.json();
    const token: string = body?.token;
    if (!token) {
      return new Response(JSON.stringify({ error: "Token de convite ausente" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 4. Client com service role para bypassar RLS
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // 5. Validar o convite
    const { data: invite, error: inviteError } = await supabaseAdmin
      .from("ambassador_invites")
      .select("id, city_id, status, expires_at, cities(name)")
      .eq("token", token)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .single();

    if (inviteError || !invite) {
      return new Response(JSON.stringify({ error: "Convite inválido, expirado ou já utilizado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const cityId: number = invite.city_id;
    const cityName: string = (invite as any).cities?.name ?? "";

    // 6. Upsert em ambassador_cities
    const { error: upsertError } = await supabaseAdmin
      .from("ambassador_cities")
      .upsert(
        {
          user_id: user.id,
          city_id: cityId,
          status: "active",
          invite_id: invite.id,
        },
        { onConflict: "user_id,city_id" }
      );

    if (upsertError) {
      return new Response(JSON.stringify({ error: "Erro ao registrar embaixador: " + upsertError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 7. Marcar convite como aceito
    const { error: updateError } = await supabaseAdmin
      .from("ambassador_invites")
      .update({
        status: "accepted",
        accepted_by: user.id,
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invite.id);

    if (updateError) {
      return new Response(JSON.stringify({ error: "Erro ao atualizar convite: " + updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 8. Retornar sucesso
    return new Response(
      JSON.stringify({ city_id: cityId, city_name: cityName }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
