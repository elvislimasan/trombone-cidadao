import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.42.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const normalizeCity = (raw: unknown) => {
  return String(raw ?? "").trim().toLowerCase();
};

const extractCityFromNominatim = (payload: Record<string, unknown>) => {
  const address = (payload.address ?? {}) as Record<string, unknown>;
  const city =
    address.city ??
    address.town ??
    address.village ??
    address.municipality ??
    address.county ??
    "";
  return String(city ?? "").trim() || null;
};

const reverseGeocode = async (lat: number, lng: number) => {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("accept-language", "pt-BR");

  const userAgent = Deno.env.get("APP_USER_AGENT") || "TromboneCidadao/1.0";
  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": userAgent,
      "Accept": "application/json",
    },
  });

  const data = await res.json();
  if (!res.ok) {
    return { ok: false, raw: data, city: null as string | null };
  }
  const city = extractCityFromNominatim(data as Record<string, unknown>);
  return { ok: true, raw: data, city };
};

const verifyRecaptcha = async (token: string, siteKey?: string | null) => {
  const apiKey = Deno.env.get("RECAPTCHA_ENTERPRISE_API_KEY");
  const projectId = Deno.env.get("RECAPTCHA_ENTERPRISE_PROJECT_ID");
  const defaultSiteKey = Deno.env.get("RECAPTCHA_ENTERPRISE_SITE_KEY");

  if (!apiKey || !projectId) {
    throw new Error("reCAPTCHA Enterprise environment not configured");
  }

  const assessmentUrl = `https://recaptchaenterprise.googleapis.com/v1/projects/${projectId}/assessments?key=${apiKey}`;

  const payload: Record<string, unknown> = {
    event: {
      token,
      siteKey: siteKey || defaultSiteKey,
    },
  };

  const googleResponse = await fetch(assessmentUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await googleResponse.json();
  if (!googleResponse.ok) {
    return { success: false, details: data };
  }

  const valid = Boolean((data as Record<string, unknown>)?.tokenProperties?.valid);
  const score = (data as Record<string, unknown>)?.riskAnalysis?.score ?? null;
  const scoreOk = typeof score === "number" ? score >= 0.5 : true;
  return { success: valid && scoreOk, score, details: data };
};

const formatPoleLabel = (raw: unknown) => {
  const s = String(raw ?? "").trim();
  if (!s) return "";
  return s.replace(/^\s*\d+\s*[-–—]\s*/u, "").trim();
};

const sanitizeFileName = (raw: unknown) => {
  const name = String(raw ?? "").trim();
  if (!name) return `arquivo_${Date.now()}`;
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 405,
    });
  }

  try {
    const { token, siteKey, report, media } = await req.json();

    const tokenStr = String(token ?? "").trim();
    if (!tokenStr) {
      return new Response(JSON.stringify({ error: "missing_recaptcha_token" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const captcha = await verifyRecaptcha(tokenStr, siteKey ? String(siteKey) : null);
    if (!captcha.success) {
      return new Response(JSON.stringify({ error: "recaptcha_failed", details: captcha.details }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const title = String(report?.title ?? "").trim();
    const description = String(report?.description ?? "").trim();
    const category = String(report?.category ?? "").trim();
    const address = String(report?.address ?? "").trim();
    const lat = Number(report?.location?.lat);
    const lng = Number(report?.location?.lng);

    if (!title || !category || !address || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      return new Response(JSON.stringify({ error: "invalid_payload" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const geo = await reverseGeocode(lat, lng);
    const cityNorm = normalizeCity(geo.city);
    if (cityNorm !== "floresta") {
      return new Response(JSON.stringify({ error: "not_allowed_city", city: geo.city }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const isLighting = category === "iluminacao";
    const isBuracos = category === "buracos";

    const poleNumber = isLighting ? String(report?.pole_number ?? "").trim() : "";
    const poleId = isLighting ? (report?.pole_id ?? null) : null;
    const issueType = isLighting ? String(report?.issue_type ?? "").trim() : "";
    const reportedPostIdentifier = isLighting
      ? (formatPoleLabel(report?.reported_post_identifier) || formatPoleLabel(poleNumber) || null)
      : null;
    const reportedPlate = isLighting
      ? (formatPoleLabel(report?.reported_plate) || formatPoleLabel(poleNumber) || null)
      : null;
    const reportedPoleDistanceM = isLighting
      ? (Number.isFinite(Number(report?.reported_pole_distance_m)) ? Number(report?.reported_pole_distance_m) : null)
      : null;

    if (isLighting && reportedPostIdentifier) {
      const { data: dupData, error: dupError } = await supabaseAdmin
        .from("reports")
        .select("id")
        .eq("category_id", "iluminacao")
        .eq("reported_post_identifier", reportedPostIdentifier)
        .neq("status", "duplicate")
        .in("status", ["pending", "in-progress"])
        .limit(1);

      if (!dupError && Array.isArray(dupData) && dupData.length > 0) {
        return new Response(JSON.stringify({ error: "duplicate_pole_report", report_id: dupData[0]?.id || null }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 409,
        });
      }
    }

    const insertPayload: Record<string, unknown> = {
      title,
      description,
      category_id: category,
      address,
      location: `POINT(${lng} ${lat})`,
      author_id: null,
      protocol: `TROMB-${Date.now()}`,
      status: "pending",
      moderation_status: "pending_approval",
      is_anonymous: true,
      pole_number: isLighting ? (poleNumber || null) : null,
      pole_id: isLighting ? poleId : null,
      reported_post_identifier: isLighting ? reportedPostIdentifier : null,
      reported_plate: isLighting ? reportedPlate : null,
      reported_pole_distance_m: isLighting ? reportedPoleDistanceM : null,
      issue_type: isLighting ? (issueType || null) : null,
      is_from_water_utility: isBuracos ? Boolean(report?.is_from_water_utility) : null,
    };

    const { data, error } = await supabaseAdmin
      .from("reports")
      .insert(insertPayload)
      .select("id")
      .single();

    if (error) {
      return new Response(JSON.stringify({ error: error.message || "insert_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const reportId = data?.id ? String(data.id) : null;
    if (!reportId) {
      return new Response(JSON.stringify({ error: "insert_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const mediaList: Array<Record<string, unknown>> = Array.isArray(media) ? media : [];
    if (mediaList.length === 0) {
      return new Response(JSON.stringify({ error: "missing_media" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const uploads: Array<Record<string, unknown>> = [];
    const mediaRows: Array<Record<string, unknown>> = [];

    for (const m of mediaList) {
      const clientId = String(m?.clientId ?? "").trim();
      const type = String(m?.type ?? "").trim();
      const contentType = String(m?.contentType ?? "").trim();
      const originalName = String(m?.name ?? "").trim();

      if (!clientId || (type !== "photo" && type !== "video")) {
        continue;
      }

      const safeName = sanitizeFileName(originalName);
      const filePath = `anonymous/${reportId}/${Date.now()}-${safeName}`;
      const publicUrl = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/reports-media/${filePath}`;

      const { data: signed, error: signedErr } = await supabaseAdmin.storage
        .from("reports-media")
        .createSignedUploadUrl(filePath, 3600);

      if (signedErr || !signed?.signedUrl) {
        continue;
      }

      uploads.push({
        clientId,
        type,
        contentType: contentType || null,
        filePath,
        publicUrl,
        signedUrl: signed.signedUrl,
      });

      mediaRows.push({
        report_id: reportId,
        url: publicUrl,
        type,
        name: originalName || safeName,
      });
    }

    if (uploads.length === 0) {
      await supabaseAdmin.from("reports").delete().eq("id", reportId);
      return new Response(JSON.stringify({ error: "signed_upload_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const { error: mediaInsertError } = await supabaseAdmin.from("report_media").insert(mediaRows);
    if (mediaInsertError) {
      await supabaseAdmin.from("reports").delete().eq("id", reportId);
      return new Response(JSON.stringify({ error: mediaInsertError.message || "media_insert_failed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    return new Response(JSON.stringify({ id: reportId, uploads }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || "unknown_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});
