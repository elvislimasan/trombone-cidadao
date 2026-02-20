import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const { token, expectedAction, siteKey } = await req.json()

    if (!token) {
      throw new Error("Missing reCAPTCHA token")
    }

    const apiKey = Deno.env.get("RECAPTCHA_ENTERPRISE_API_KEY")
    const projectId = Deno.env.get("RECAPTCHA_ENTERPRISE_PROJECT_ID")
    const defaultSiteKey = Deno.env.get("RECAPTCHA_ENTERPRISE_SITE_KEY")

    if (!apiKey || !projectId) {
      throw new Error("reCAPTCHA Enterprise environment not configured")
    }

    const assessmentUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`

    const payload: Record<string, unknown> = {
      event: {
        token,
        siteKey: siteKey || defaultSiteKey,
      },
    }

    if (expectedAction) {
      ;(payload.event as Record<string, unknown>).expectedAction = expectedAction
    }

    const googleResponse = await fetch(assessmentUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    })

    const data = await googleResponse.json()

    if (!googleResponse.ok) {
      console.error("reCAPTCHA Enterprise error:", data)
      return new Response(
        JSON.stringify({
          success: false,
          error: "recaptcha_enterprise_error",
          details: data,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
      )
    }

    const valid = Boolean(data.tokenProperties?.valid)
    const action = data.tokenProperties?.action ?? null
    const score = data.riskAnalysis?.score ?? null
    const reasons = data.riskAnalysis?.reasons ?? []

    const actionMatches = expectedAction ? action === expectedAction : true
    const scoreOk = typeof score === "number" ? score >= 0.5 : true

    const success = valid && actionMatches && scoreOk

    return new Response(
      JSON.stringify({
        success,
        valid,
        score,
        action,
        reasons,
        expectedAction: expectedAction || null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (error) {
    console.error("verify-recaptcha error:", error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Unknown error",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})

