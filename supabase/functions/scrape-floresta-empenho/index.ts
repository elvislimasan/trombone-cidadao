import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const stripTagsToText = (html: string) => {
  let out = html
  out = out.replace(/<script[\s\S]*?<\/script>/gi, " ")
  out = out.replace(/<style[\s\S]*?<\/style>/gi, " ")
  out = out.replace(/\r/g, "")
  out = out.replace(/<br\s*\/?>/gi, "\n")
  out = out.replace(/<\/(td|th|p|div|tr|li|h\d)>/gi, "\n")
  out = out.replace(/<[^>]+>/g, " ")
  out = out.replace(/&nbsp;/g, " ")
  out = out.replace(/&amp;/g, "&")
  out = out.replace(/&quot;/g, '"')
  out = out.replace(/&#39;/g, "'")
  out = out.replace(/[ \t]+/g, " ")
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.join("\n")
}

const parseCommitmentFromUrl = (url: URL) => {
  const m = url.pathname.match(/empenho-n-(\d+)-(\d{4})/i)
  if (!m) return { number: null as string | null, year: null as string | null }
  return { number: m[1], year: m[2] }
}

const parseMoneyPtBr = (raw: string) => {
  const cleaned = raw.replace(/[^\d.,]/g, "")
  const comma = cleaned.lastIndexOf(",")
  const safe =
    comma >= 0 && cleaned.length > comma + 3
      ? cleaned.slice(0, comma + 3)
      : cleaned
  const normalized = safe.replace(/\./g, "").replace(",", ".")
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

const parseRows = (text: string) => {
  const startIdx = text.toLowerCase().indexOf("n° liquidação")
  const body = startIdx >= 0 ? text.slice(startIdx) : text

  const rows: Array<{
    installment: string
    history: string
    opened_at: string
    due_at: string
    kind: string
    value: number | null
    value_raw: string
  }> = []

  const rowRe =
    /(?:^|\n)(\d+)\s+([\s\S]*?)\s+(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+([A-Za-zÀ-ÿ]+)\s*R\$\s*([\d\.\,]+)/g

  for (const match of body.matchAll(rowRe)) {
    const installment = String(match[1]).trim()
    const history = String(match[2]).replace(/\s+/g, " ").trim()
    const openedAt = String(match[3]).trim()
    const dueAt = String(match[4]).trim()
    const kind = String(match[5]).trim()
    const valueRaw = String(match[6]).trim()
    rows.push({
      installment,
      history,
      opened_at: openedAt,
      due_at: dueAt,
      kind,
      value: parseMoneyPtBr(valueRaw),
      value_raw: valueRaw,
    })
  }

  return rows
}

const normalizeKey = (v: string) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")

const parseCsvLiquidações = (csv: string) => {
  const lines = String(csv || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  if (!lines.length) return []

  const headerIdx = lines.findIndex((l) => {
    const k = normalizeKey(l)
    return k.includes("liquidacao") && k.includes("historico") && (k.includes("data") || k.includes("vencimento"))
  })
  if (headerIdx < 0) return []

  const headerLine = lines[headerIdx]
  const delim = headerLine.includes(";") ? ";" : headerLine.includes("\t") ? "\t" : ","

  const rows: Array<{
    installment: string
    history: string
    opened_at: string
    due_at: string
    kind: string
    value: number | null
    value_raw: string
  }> = []

  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const line = lines[i]
    const first = line.split(delim)[0]?.trim() || ""
    if (!/^\d+$/.test(first)) break

    const parts = line.split(delim).map((x) => x.trim())
    const installment = parts[0] || ""
    const history = parts[1] || ""
    const openedAt = parts[2] || ""
    const dueAt = parts[3] || ""
    const kind = parts[4] || ""
    const valueRaw = parts[5] || ""
    rows.push({
      installment,
      history,
      opened_at: openedAt,
      due_at: dueAt,
      kind,
      value: parseMoneyPtBr(valueRaw),
      value_raw: valueRaw,
    })
  }

  return rows
}

const extractCookies = (headers: Headers) => {
  const cookies: string[] = []
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] }
  if (typeof anyHeaders.getSetCookie === "function") {
    const setCookies = anyHeaders.getSetCookie() || []
    for (const c of setCookies) {
      const pair = String(c || "").split(";")[0]?.trim()
      if (pair) cookies.push(pair)
    }
    return cookies.join("; ")
  }

  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() !== "set-cookie") continue
    const pair = String(v || "").split(";")[0]?.trim()
    if (pair) cookies.push(pair)
  }
  return cookies.join("; ")
}

const extractCsrfToken = (html: string) => {
  const m = String(html || "").match(/name=\"_csrfToken\"\\s+value=\"([^\"]+)\"/i)
  return m?.[1] ? String(m[1]).trim() : null
}

const extractExportAction = (html: string, ext: string) => {
  const re = new RegExp(`action=\\\"([^\\\"]*exportarempenho[^\\\"]+\\/${ext})\\\"`, "i")
  const m = String(html || "").match(re)
  return m?.[1] ? String(m[1]).trim() : null
}

const extractCsrfFromJs = (html: string) => {
  const m = String(html || "").match(/const\\s+CSRF\\s*=\\s*\"([^\"]+)\"/i)
  const raw = m?.[1] ? String(m[1]) : null
  if (!raw) return null
  return raw.replace(/\\\//g, "/")
}

const extractCsrfCookie = (cookieHeader: string) => {
  const m = String(cookieHeader || "").match(/(?:^|;\\s*)csrfToken=([^;]+)/i)
  return m?.[1] ? String(m[1]).trim() : null
}

const postPortalJson = async (url: string, body: Record<string, string>, csrf: string, cookieHeader: string, referer: string, userAgent: string) => {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "User-Agent": userAgent,
      "Accept": "application/json, text/plain, */*",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrf,
      "Referer": referer,
      "Origin": "https://floresta.pe.gov.br",
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: new URLSearchParams(body).toString(),
  })

  const text = await res.text()
  if (!res.ok) {
    throw new Error(`portal_request_failed_${res.status}`)
  }
  try {
    return JSON.parse(text)
  } catch {
    throw new Error("portal_invalid_json")
  }
}

const parsePortalMoney = (raw: unknown) => parseMoneyPtBr(String(raw ?? ""))

const parsePortalDate = (raw: unknown) => {
  const str = String(raw ?? "").trim()
  return /^\d{2}-\d{2}-\d{4}$/.test(str) ? str : null
}

const toIsoDate = (raw: unknown) => {
  const str = String(raw ?? "").trim()
  if (!str) return null
  const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const dmyDash = str.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2]}-${dmyDash[1]}`
  const dmySlash = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmySlash) return `${dmySlash[3]}-${dmySlash[2]}-${dmySlash[1]}`
  return null
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "method_not_allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 405,
      })
    }

    const { url } = await req.json()
    if (!url || typeof url !== "string") {
      return new Response(JSON.stringify({ error: "missing_url" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return new Response(JSON.stringify({ error: "invalid_url" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
      return new Response(JSON.stringify({ error: "invalid_protocol" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    if (parsedUrl.hostname !== "floresta.pe.gov.br") {
      return new Response(JSON.stringify({ error: "host_not_allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    if (!parsedUrl.pathname.startsWith("/transparencia/despesas/detalhes/empenho-n-")) {
      return new Response(JSON.stringify({ error: "path_not_allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const userAgent = Deno.env.get("APP_USER_AGENT") || "TromboneCidadao/1.0"
    const pageRes = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    })

    const pageHtml = await pageRes.text()
    const cookieHeader = extractCookies(pageRes.headers)
    const csrfCookieEncoded = extractCsrfCookie(cookieHeader)
    const csrfFromCookie = csrfCookieEncoded ? decodeURIComponent(csrfCookieEncoded) : null
    const csrfFromJs = extractCsrfFromJs(pageHtml)
    const csrfFromHidden = extractCsrfToken(pageHtml)
    const csrfHeaderToken = csrfFromCookie || csrfFromJs || csrfFromHidden

    let payments: Array<{
      installment: string
      history: string
      opened_at: string
      due_at: string
      kind: string
      value: number | null
      value_raw: string
    }> = []

    const text = stripTagsToText(pageHtml)

    const fromUrl = parseCommitmentFromUrl(parsedUrl)

    const headerRe = /Empenho\s+([A-Za-zÀ-ÿ]+)\s*N[°ºo]?\s*(\d+)/i
    const headerMatch = text.match(headerRe)
    const commitmentTypeFromHeader = headerMatch?.[1] ? String(headerMatch[1]).trim() : null
    const commitmentNumber = headerMatch?.[2] ? String(headerMatch[2]).trim() : fromUrl.number

    const typeMatch = text.match(/(?:^|\n)Tipo:\s*([A-Za-zÀ-ÿ]+)/i)
    let commitmentType = commitmentTypeFromHeader || (typeMatch?.[1] ? String(typeMatch[1]).trim() : null)

    const commitmentDateMatch = text.match(/Data do Empenho[^:]*:\s*(\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4})/i)
    let commitmentDate = commitmentDateMatch?.[1] ? toIsoDate(commitmentDateMatch[1]) : null

    const authMatch = text.match(/C[oó]digo de autenticidade[^:]*:\s*([A-F0-9]{6,})/i)
    const portalAuthCode = authMatch?.[1] ? String(authMatch[1]).trim().toUpperCase() : null

    const creditorMatch = text.match(/(?:^|\n)Favorecido:\s*([^\n]+)/i)
    let creditorName = creditorMatch?.[1] ? String(creditorMatch[1]).trim() : null

    const slug = parsedUrl.pathname.split("/").filter(Boolean).pop() || null

    if (csrfHeaderToken && cookieHeader && slug) {
      const origin = parsedUrl.origin
      const empenhoUrl = new URL("/transparencia/despesas/get-empenho", origin).toString()
      const empenhoData = await postPortalJson(
        empenhoUrl,
        { slug },
        csrfHeaderToken,
        cookieHeader,
        parsedUrl.toString(),
        userAgent,
      )

      const apiTypeRaw =
        empenhoData?.empenho?.TIPO_EMPENHO ??
        empenhoData?.empenho?.tipo_empenho ??
        empenhoData?.empenho?.TipoEmpenho ??
        empenhoData?.empenho?.tipo ??
        null
      const apiType = apiTypeRaw != null ? String(apiTypeRaw).trim() : null
      if (apiType) commitmentType = apiType

      const apiCommitmentDateRaw =
        empenhoData?.empenho?.DATA_EMPENHO ??
        empenhoData?.empenho?.data_empenho ??
        empenhoData?.empenho?.DATA_EMPENHO_GLOBAL ??
        empenhoData?.empenho?.data_empenho_global ??
        null
      const apiCommitmentDate = toIsoDate(apiCommitmentDateRaw) || toIsoDate(parsePortalDate(apiCommitmentDateRaw))
      if (apiCommitmentDate) commitmentDate = apiCommitmentDate

      const apiCreditorRaw =
        empenhoData?.empenho?.FAVORECIDO ??
        empenhoData?.empenho?.favorecido ??
        empenhoData?.empenho?.CREDOR ??
        empenhoData?.empenho?.credor ??
        null
      const apiCreditor = apiCreditorRaw != null ? String(apiCreditorRaw).trim() : null
      if (apiCreditor) creditorName = apiCreditor

      const id = empenhoData?.empenho?.ID_EMPENHO
      const idStr = id != null ? String(id) : null

      if (idStr) {
        const liquidacaoUrl = new URL("/transparencia/despesas/get-liquidacao", origin).toString()
        const liquidacaoData = await postPortalJson(
          liquidacaoUrl,
          { id: idStr },
          csrfHeaderToken,
          cookieHeader,
          parsedUrl.toString(),
          userAgent,
        )

        const liquidacaoBody = Array.isArray(liquidacaoData?.tbody) ? liquidacaoData.tbody : []
        const liquidacoes = liquidacaoBody
          .map((r: Record<string, unknown>) => ({
            numero_liquidacao: String(r.NUMERO_LIQUIDACAO ?? r.numero_liquidacao ?? "").trim(),
            historico: String(r.HISTORICO ?? r.historico ?? "").trim(),
            data_abertura: parsePortalDate(r.DATA_ABERTURA ?? r.data_abertura),
            data_vencimento: parsePortalDate(r.DATA_VENCIMENTO ?? r.data_vencimento),
            valor_liquidado_raw: String(r.VALOR_LIQUIDADO ?? r.valor_liquidado ?? r.VALOR ?? r.valor ?? "").trim(),
          }))
          .filter((x: { numero_liquidacao: string }) => x.numero_liquidacao)

        const liquidacaoByNumber = new Map(liquidacoes.map((l: { numero_liquidacao: string }) => [l.numero_liquidacao, l]))

        const pagamentosUrl = new URL("/transparencia/despesas/get-pagamentos", origin).toString()
        const pagamentosData = await postPortalJson(
          pagamentosUrl,
          { id: idStr },
          csrfHeaderToken,
          cookieHeader,
          parsedUrl.toString(),
          userAgent,
        )

        const pagamentosBody = Array.isArray(pagamentosData?.tbody) ? pagamentosData.tbody : []
        payments = pagamentosBody
          .map((r: Record<string, unknown>, idx: number) => {
            const numeroLiquidacao = String(r.NUMERO_LIQUIDACAO ?? "").trim()
            const liq = numeroLiquidacao ? liquidacaoByNumber.get(numeroLiquidacao) : undefined

            const parcela = String(r.PARCELA ?? r.parcela ?? "").trim()
            const paymentDate = parsePortalDate(r.DATA_PAGAMENTO ?? r.data_pagamento)
            const valuePaidRaw = String(r.VALOR_PAGAMENTO ?? r.valor_pagamento ?? "").trim()
            const valueFallbackRaw = String(r.VALOR ?? r.valor ?? "").trim()
            const valueRaw = valuePaidRaw || valueFallbackRaw

            const history = String(liq?.historico || "").trim()
            const dueAt = String(liq?.data_vencimento || "").trim() || null

            const installment = parcela || (numeroLiquidacao ? `L${numeroLiquidacao}` : String(idx + 1))

            return {
              installment,
              history,
              opened_at: paymentDate || (liq?.data_abertura || null),
              due_at: dueAt,
              kind: "Pagamento",
              value: parsePortalMoney(valueRaw),
              value_raw: valueRaw,
            }
          })
          .filter((p: { opened_at: string | null; value: number | null }) => Boolean(p.opened_at) && Boolean(p.value))
      }
    }

    if (!payments.length) {
      payments = parseRows(text)
    }

    return new Response(
      JSON.stringify({
        portal_link: parsedUrl.toString(),
        portal_auth_code: portalAuthCode,
        commitment_number: commitmentNumber,
        commitment_year: fromUrl.year,
        commitment_type: commitmentType,
        commitment_date: commitmentDate,
        creditor_name: creditorName,
        payments,
        raw_text_preview: text.slice(0, 5000),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || "unknown_error" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    })
  }
})
