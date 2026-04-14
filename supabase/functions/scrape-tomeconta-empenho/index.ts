import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
}

const RAPIDSSL_TLS_RSA_CA_G1_PEM = `-----BEGIN CERTIFICATE-----
MIIEszCCA5ugAwIBAgIQCyWUIs7ZgSoVoE6ZUooO+jANBgkqhkiG9w0BAQsFADBh
MQswCQYDVQQGEwJVUzEVMBMGA1UEChMMRGlnaUNlcnQgSW5jMRkwFwYDVQQLExB3
d3cuZGlnaWNlcnQuY29tMSAwHgYDVQQDExdEaWdpQ2VydCBHbG9iYWwgUm9vdCBH
MjAeFw0xNzExMDIxMjI0MzNaFw0yNzExMDIxMjI0MzNaMGAxCzAJBgNVBAYTAlVT
MRUwEwYDVQQKEwxEaWdpQ2VydCBJbmMxGTAXBgNVBAsTEHd3dy5kaWdpY2VydC5j
b20xHzAdBgNVBAMTFlJhcGlkU1NMIFRMUyBSU0EgQ0EgRzEwggEiMA0GCSqGSIb3
DQEBAQUAA4IBDwAwggEKAoIBAQC/uVklRBI1FuJdUEkFCuDL/I3aJQiaZ6aibRHj
ap/ap9zy1aYNrphe7YcaNwMoPsZvXDR+hNJOo9gbgOYVTPq8gXc84I75YKOHiVA4
NrJJQZ6p2sJQyqx60HkEIjzIN+1LQLfXTlpuznToOa1hyTD0yyitFyOYwURM+/CI
8FNFMpBhw22hpeAQkOOLmsqT5QZJYeik7qlvn8gfD+XdDnk3kkuuu0eG+vuyrSGr
5uX5LRhFWlv1zFQDch/EKmd163m6z/ycx/qLa9zyvILc7cQpb+k7TLra9WE17YPS
n9ANjG+ECo9PDW3N9lwhKQCNvw1gGoguyCQu7HE7BnW8eSSFAgMBAAGjggFmMIIB
YjAdBgNVHQ4EFgQUDNtsgkkPSmcKuBTuesRIUojrVjgwHwYDVR0jBBgwFoAUTiJU
IBiV5uNu5g/6+rkS7QYXjzkwDgYDVR0PAQH/BAQDAgGGMB0GA1UdJQQWMBQGCCsG
AQUFBwMBBggrBgEFBQcDAjASBgNVHRMBAf8ECDAGAQH/AgEAMDQGCCsGAQUFBwEB
BCgwJjAkBggrBgEFBQcwAYYYaHR0cDovL29jc3AuZGlnaWNlcnQuY29tMEIGA1Ud
HwQ7MDkwN6A1oDOGMWh0dHA6Ly9jcmwzLmRpZ2ljZXJ0LmNvbS9EaWdpQ2VydEds
b2JhbFJvb3RHMi5jcmwwYwYDVR0gBFwwWjA3BglghkgBhv1sAQEwKjAoBggrBgEF
BQcCARYcaHR0cHM6Ly93d3cuZGlnaWNlcnQuY29tL0NQUzALBglghkgBhv1sAQIw
CAYGZ4EMAQIBMAgGBmeBDAECAjANBgkqhkiG9w0BAQsFAAOCAQEAGUSlOb4K3Wtm
SlbmE50UYBHXM0SKXPqHMzk6XQUpCheF/4qU8aOhajsyRQFDV1ih/uPIg7YHRtFi
CTq4G+zb43X1T77nJgSOI9pq/TqCwtukZ7u9VLL3JAq3Wdy2moKLvvC8tVmRzkAe
0xQCkRKIjbBG80MSyDX/R4uYgj6ZiNT/Zg6GI6RofgqgpDdssLc0XIRQEotxIZcK
zP3pGJ9FCbMHmMLLyuBd+uCWvVcF2ogYAawufChS/PT61D9rqzPRS5I2uqa3tmIT
44JhJgWhBnFMb7AGQkvNq9KNS9dd3GWc17H/dXa1enoxzWjE0hBdFjxPhUb0W3wi
8o34/m8Fxw==
-----END CERTIFICATE-----`

const getTomeContaHttpClient = () => {
  const extra = Deno.env.get("TOMECONTA_CA_PEM") || ""
  const caCerts = [RAPIDSSL_TLS_RSA_CA_G1_PEM, extra].map((x) => String(x || "").trim()).filter(Boolean)
  if (!caCerts.length) return null
  try {
    return Deno.createHttpClient({ caCerts })
  } catch {
    return null
  }
}

const decodeHtmlEntities = (value: string) => {
  let out = String(value || "")
  out = out.replace(/&nbsp;/g, " ")
  out = out.replace(/&amp;/g, "&")
  out = out.replace(/&quot;/g, '"')
  out = out.replace(/&#39;/g, "'")
  out = out.replace(/&lt;/g, "<")
  out = out.replace(/&gt;/g, ">")
  return out
}

const stripCellToText = (html: string) => {
  let out = String(html || "")
  out = out.replace(/<script[\s\S]*?<\/script>/gi, " ")
  out = out.replace(/<style[\s\S]*?<\/style>/gi, " ")
  out = out.replace(/\r/g, "")
  out = out.replace(/<br\s*\/?>/gi, " ")
  out = out.replace(/<\/(td|th|p|div|tr|li|h\d)>/gi, " ")
  out = out.replace(/<[^>]+>/g, " ")
  out = decodeHtmlEntities(out)
  out = out.replace(/[ \t\n]+/g, " ").trim()
  return out
}

const stripTagsToText = (html: string) => {
  let out = String(html || "")
  out = out.replace(/<script[\s\S]*?<\/script>/gi, " ")
  out = out.replace(/<style[\s\S]*?<\/style>/gi, " ")
  out = out.replace(/\r/g, "")
  out = out.replace(/<br\s*\/?>/gi, "\n")
  out = out.replace(/<\/(td|th|p|div|tr|li|h\d)>/gi, "\n")
  out = out.replace(/<[^>]+>/g, " ")
  out = decodeHtmlEntities(out)
  out = out.replace(/[ \t]+/g, " ")
  const lines = out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  return lines.join("\n")
}

const parseMoneyPtBr = (raw: string) => {
  const cleaned = String(raw || "").replace(/[^\d.,]/g, "")
  const comma = cleaned.lastIndexOf(",")
  const safe =
    comma >= 0 && cleaned.length > comma + 3
      ? cleaned.slice(0, comma + 3)
      : cleaned
  const normalized = safe.replace(/\./g, "").replace(",", ".")
  const value = Number(normalized)
  return Number.isFinite(value) ? value : null
}

const countReplacementChars = (value: string) => (String(value || "").match(/\uFFFD/g) || []).length

const decodeHtmlFromResponse = async (res: Response) => {
  const ab = await res.arrayBuffer()
  const bytes = new Uint8Array(ab)
  const utf8 = new TextDecoder("utf-8", { fatal: false }).decode(bytes)
  const win1252 = new TextDecoder("windows-1252", { fatal: false }).decode(bytes)
  const latin1 = new TextDecoder("iso-8859-1", { fatal: false }).decode(bytes)

  const candidates = [
    { encoding: "utf-8", html: utf8, bad: countReplacementChars(utf8) },
    { encoding: "windows-1252", html: win1252, bad: countReplacementChars(win1252) },
    { encoding: "iso-8859-1", html: latin1, bad: countReplacementChars(latin1) },
  ]
  candidates.sort((a, b) => a.bad - b.bad)
  return candidates[0]
}

const toDashDate = (raw: string) => {
  const str = String(raw || "").trim()
  const dmySlash = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmySlash) return `${dmySlash[1]}-${dmySlash[2]}-${dmySlash[3]}`
  const dmyDash = str.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmyDash) return `${dmyDash[1]}-${dmyDash[2]}-${dmyDash[3]}`
  return null
}

const toIsoDate = (raw: string) => {
  const str = String(raw || "").trim()
  const ymd = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`
  const dmySlash = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (dmySlash) return `${dmySlash[3]}-${dmySlash[2]}-${dmySlash[1]}`
  const dmyDash = str.match(/^(\d{2})-(\d{2})-(\d{4})$/)
  if (dmyDash) return `${dmyDash[3]}-${dmyDash[2]}-${dmyDash[1]}`
  return null
}

const isoToDashDate = (iso: string) => {
  const str = String(iso || "").trim()
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return `${m[3]}-${m[2]}-${m[1]}`
}

const normalizeKey = (value: string) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")

const normalizeLooseKey = (value: string) => normalizeKey(value).replace(/[^a-z0-9 _:-]+/g, "")

const extractStrongListItemValueByLabelKey = (pageHtml: string, labelKey: string) => {
  const re = /<li[^>]*>[\s\S]*?<strong[^>]*>([\s\S]*?)<\/strong>\s*([\s\S]*?)<\/li>/gi
  for (const m of String(pageHtml || "").matchAll(re)) {
    const labelRaw = stripCellToText(String(m[1] || "")).replace(/\s+/g, " ").trim().replace(/:$/, "")
    const labelNorm = normalizeKey(labelRaw)
    if (labelNorm !== labelKey) continue
    const valueRaw = stripCellToText(String(m[2] || ""))
    return valueRaw ? String(valueRaw).trim() : null
  }
  return null
}

const extractMultilineField = (text: string, label: string, stopLabels: string[]) => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  const labelKey = normalizeKey(label)
  const stopKeys = stopLabels.map((s) => normalizeKey(s)).filter(Boolean)

  let started = false
  const parts: string[] = []

  for (const line of lines) {
    const key = normalizeKey(line)
    if (!started) {
      if (key.startsWith(`${labelKey}:`) || key === labelKey) {
        started = true
        const idx = line.indexOf(":")
        const rest = idx >= 0 ? line.slice(idx + 1).trim() : ""
        if (rest) parts.push(rest)
      }
      continue
    }

    if (stopKeys.some((s) => key.startsWith(`${s}:`) || key === s)) break
    parts.push(line)
  }

  const out = parts.join(" ").replace(/\s+/g, " ").trim()
  return out || null
}

const escapeRegExp = (value: string) => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")

const extractStrongListItemValue = (pageHtml: string, label: string) => {
  const re = new RegExp(`<strong>\\s*${escapeRegExp(label)}\\s*:<\\/strong>\\s*([\\s\\S]*?)<\\/li>`, "i")
  const m = String(pageHtml || "").match(re)
  if (!m?.[1]) return null
  return stripCellToText(String(m[1]))
}

const buildPortalAuthCode = (url: URL) => {
  const sp = url.searchParams
  const idUG =
    sp.get("despesas.idUG") ||
    sp.get("unidadeJurisEstadual.codigo") ||
    sp.get("unidadeJurisEstadual.codigoTCE") ||
    ""
  const anoRef = sp.get("despesas.anoRef") || ""
  const idEmpenho =
    sp.get("despesas.idEmpenho") ||
    sp.get("despesas.numeroEmpenho") ||
    ""
  const parts = ["TOMECONTA", idUG, anoRef, idEmpenho].map((x) => String(x || "").trim()).filter(Boolean)
  return parts.length >= 2 ? parts.join("_") : null
}

const extractCommitmentNumber = (url: URL, text: string, pageHtml: string) => {
  const fromHtml = extractStrongListItemValueByLabelKey(pageHtml, "empenho") || extractStrongListItemValue(pageHtml, "Empenho")
  if (fromHtml) {
    const token = String(fromHtml).trim().split(/\s+/)[0] || ""
    if (token) return token
  }
  const fromText = extractMultilineField(text, "Empenho", [
    "Unidade Jurisdicionada",
    "Unidade Orçamentária",
    "Histórico Empenho",
    "Data Empenho",
    "CPF/CNPJ do Credor",
    "Nome/Razão Social",
    "Fonte de Recurso",
    "Classificação",
  ])
  if (fromText) {
    const token = String(fromText).trim().split(/\s+/)[0] || ""
    if (token) return token
  }
  const sp = url.searchParams
  return (
    sp.get("despesas.numeroEmpenho") ||
    sp.get("despesas.idEmpenho") ||
    sp.get("despesas.idEmpenhoMunicipal") ||
    ""
  ).trim() || null
}

const extractCommitmentDateIso = (url: URL, text: string) => {
  const sp = url.searchParams
  const fromQuery =
    sp.get("despesas.dataEmpenhoFormatada") ||
    sp.get("despesas.dataEmpenho") ||
    ""
  const qIso = toIsoDate(fromQuery)
  if (qIso) return qIso

  const lines = String(text || "")
  const m =
    lines.match(/(?:^|\n)\s*Data\s+Empenho\s*:\s*(\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})/i) ||
    lines.match(/(?:^|\n)\s*Data\s+do\s+Empenho\s*:\s*(\d{2}\/\d{2}\/\d{4}|\d{2}-\d{2}-\d{4}|\d{4}-\d{2}-\d{2})/i)
  const tIso = m?.[1] ? toIsoDate(m[1]) : null
  return tIso || null
}

const extractCreditorName = (url: URL, text: string) => {
  const sp = url.searchParams
  const fromQuery = (sp.get("pessoa.nome") || sp.get("despesas.nomeFornecedor") || "").trim()
  if (fromQuery) return fromQuery
  const lines = String(text || "")
  const m =
    lines.match(/(?:^|\n)\s*Nome\/Raz[aã]o\s+Social\s*:\s*([^\n]+)/i) ||
    lines.match(/(?:^|\n)\s*Fornecedor\s*:\s*([^\n]+)/i)
  const parsed = m?.[1] ? String(m[1]).trim() : null
  return parsed || null
}

const extractCommitmentHistory = (text: string) => {
  return extractMultilineField(text, "Histórico Empenho", [
    "Data Empenho",
    "Data do Empenho",
    "CPF/CNPJ do Credor",
    "CPF / CNPJ",
    "Nome/Razão Social",
    "Fonte de Recurso",
    "Classificação",
  ])
}

const extractCommitmentHistoryFromHtml = (pageHtml: string) => {
  const fromHtml =
    extractStrongListItemValueByLabelKey(pageHtml, "historico_empenho") ||
    extractStrongListItemValueByLabelKey(pageHtml, "historico empenho") ||
    extractStrongListItemValue(pageHtml, "Histórico Empenho")
  return fromHtml ? String(fromHtml).replace(/\s+/g, " ").trim() || null : null
}

const extractCommitmentHistoryFlexible = (text: string) => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  const isStop = (line: string) => {
    const k = normalizeLooseKey(line)
    return (
      k.startsWith("data empenho:") ||
      k.startsWith("data do empenho:") ||
      k.startsWith("cpf/cnpj") ||
      k.startsWith("cpf / cnpj") ||
      k.startsWith("nome/razao social") ||
      k.startsWith("fonte de recurso") ||
      k.startsWith("classificacao")
    )
  }

  let started = false
  const parts: string[] = []

  for (const line of lines) {
    const k = normalizeLooseKey(line)
    if (!started) {
      const looksLikeHistoryLabel = k.startsWith("hist") && k.includes("empenho:") && line.includes(":")
      if (looksLikeHistoryLabel) {
        started = true
        const idx = line.indexOf(":")
        const rest = idx >= 0 ? line.slice(idx + 1).trim() : ""
        if (rest) parts.push(rest)
      }
      continue
    }

    if (isStop(line)) break
    parts.push(line)
  }

  const out = parts.join(" ").replace(/\s+/g, " ").trim()
  return out || null
}

const parsePaymentsFromText = (text: string, defaultHistory: string | null, fallbackOpenedAt: string | null) => {
  const lines = String(text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)

  const idxStart = lines.findIndex((l) => normalizeLooseKey(l).startsWith("total pago"))
  if (idxStart < 0) return []

  const payments: Array<{
    installment: string
    history: string
    opened_at: string
    due_at: string
    kind: string
    value: number | null
    value_raw: string
  }> = []

  let lastOpenedAt: string | null = null

  const isStop = (line: string) => normalizeLooseKey(line).startsWith("fonte:")
  const isHeader = (line: string) => {
    const k = normalizeLooseKey(line)
    return k === "descricao" || k.startsWith("data pagamento") || k.startsWith("valor pago")
  }

  for (let i = idxStart + 1; i < lines.length; i += 1) {
    const line = lines[i]
    if (!line) continue
    if (isStop(line)) break
    if (isHeader(line)) continue

    const k = normalizeLooseKey(line)
    const isPaymentRow = k.startsWith("pagamento")
    if (!isPaymentRow) continue

    const kind = line
    const isRetencao = normalizeLooseKey(kind).includes("retenc")

    let openedAt: string | null = null
    if (i + 1 < lines.length) {
      const next = lines[i + 1]
      const maybeDate = toDashDate(next)
      if (maybeDate) {
        openedAt = maybeDate
        lastOpenedAt = maybeDate
        i += 1
      }
    }

    let valueRaw = ""
    let value: number | null = null
    for (let j = i + 1; j < Math.min(lines.length, i + 12); j += 1) {
      const candidate = lines[j]
      if (isStop(candidate)) break
      const m = parseMoneyPtBr(candidate)
      if (m != null && /r\$\s*[\d\.\,]+/i.test(candidate) || candidate.includes("R$")) {
        valueRaw = candidate
        value = m
        i = j
        break
      }
    }

    if (!openedAt && isRetencao) {
      openedAt = lastOpenedAt || fallbackOpenedAt || null
    }

    if (!openedAt || value == null) continue

    const history = String(defaultHistory || "").trim() || kind
    payments.push({
      installment: "1",
      history,
      opened_at: openedAt,
      due_at: "",
      kind,
      value,
      value_raw: valueRaw || `R$ ${String(value).replace(".", ",")}`,
    })
  }

  return payments
}

const extractPaymentsFromHtml = (pageHtml: string, defaultHistory: string | null, fallbackOpenedAt: string | null) => {
  const lower = String(pageHtml || "").toLowerCase()
  const markerIdx = lower.indexOf("total pago")
  const scope = markerIdx >= 0 ? pageHtml.slice(markerIdx) : pageHtml
  const tableMatches = Array.from(scope.matchAll(/<table[^>]*>[\s\S]*?<\/table>/gi))
  const tables = tableMatches.map((m) => String(m[0] || "")).filter(Boolean)
  if (!tables.length) return []

  const payments: Array<{
    installment: string
    history: string
    opened_at: string
    due_at: string
    kind: string
    value: number | null
    value_raw: string
  }> = []

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
  const cellRe = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  let lastOpenedAt: string | null = null

  for (const tableHtml of tables) {
    for (const trMatch of tableHtml.matchAll(trRe)) {
      const rowHtml = String(trMatch[1] || "")
      const cells: string[] = []
      for (const cellMatch of rowHtml.matchAll(cellRe)) {
        const cellText = stripCellToText(String(cellMatch[1] || ""))
        cells.push(cellText)
      }
      const cols = cells.map((c) => String(c ?? "").replace(/\s+/g, " ").trim())
      const anyValue = cols.some((c) => Boolean(String(c || "").trim()))
      if (!anyValue) continue

      const headerKey = normalizeKey(cols.join(" "))
      if (headerKey.includes("descricao") && headerKey.includes("data") && headerKey.includes("valor")) continue

      const kind = String(cols[0] || "").trim() || "Pagamento"
      const isRetencao = normalizeKey(kind).includes("retenc")

      const dateCell =
        cols.find((c) => /\d{2}\/\d{2}\/\d{4}/.test(String(c || "")) || /\d{2}-\d{2}-\d{4}/.test(String(c || ""))) ||
        ""
      let openedAt = toDashDate(dateCell)
      if (openedAt) lastOpenedAt = openedAt
      if (!openedAt && isRetencao) {
        openedAt = lastOpenedAt || fallbackOpenedAt || null
      }

      let valueRaw = ""
      for (let i = cols.length - 1; i >= 0; i -= 1) {
        const candidate = cols[i]
        const money = parseMoneyPtBr(candidate)
        if (money != null) {
          valueRaw = candidate
          break
        }
      }
      const value = parseMoneyPtBr(valueRaw)

      if (!openedAt || value == null) continue

      const history = String(defaultHistory || "").trim() || kind

      payments.push({
        installment: "1",
        history,
        opened_at: openedAt,
        due_at: "",
        kind,
        value,
        value_raw: valueRaw,
      })
    }
  }

  return payments
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

    if (parsedUrl.hostname !== "tomeconta.tcepe.tc.br") {
      return new Response(JSON.stringify({ error: `host_not_allowed:${parsedUrl.hostname}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const allowedPath = parsedUrl.pathname.startsWith("/dados/") && parsedUrl.pathname.toLowerCase().includes("detalhesempenhos")
    if (!allowedPath) {
      return new Response(JSON.stringify({ error: "path_not_allowed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const userAgent =
      Deno.env.get("APP_USER_AGENT") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    const client = getTomeContaHttpClient()
    const pageRes = await fetch(parsedUrl.toString(), {
      ...(client ? { client } : {}),
      headers: {
        "User-Agent": userAgent,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      },
    })

    const decoded = await decodeHtmlFromResponse(pageRes)
    const pageHtml = decoded.html
    if (!pageRes.ok) {
      return new Response(JSON.stringify({ error: `portal_request_failed_${pageRes.status}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      })
    }

    const text = stripTagsToText(pageHtml)
    const commitmentHistoryFromHtml = extractCommitmentHistoryFromHtml(pageHtml)
    const commitmentHistory = commitmentHistoryFromHtml || extractCommitmentHistoryFlexible(text) || extractCommitmentHistory(text)
    const portalAuthCode = buildPortalAuthCode(parsedUrl)
    const commitmentNumber = extractCommitmentNumber(parsedUrl, text, pageHtml)
    const commitmentDate = extractCommitmentDateIso(parsedUrl, text)
    const creditorName = extractCreditorName(parsedUrl, text)

    const fallbackOpenedAt = commitmentDate ? isoToDashDate(commitmentDate) : null
    let payments = extractPaymentsFromHtml(pageHtml, commitmentHistory, fallbackOpenedAt)
    if (!payments.length || payments.filter((p) => normalizeLooseKey(p.kind).includes("retenc")).length === 0) {
      const fromText = parsePaymentsFromText(text, commitmentHistory, fallbackOpenedAt)
      if (fromText.length > payments.length) payments = fromText
    }
    const paymentsRetencaoCount = payments.filter((p) => normalizeKey(p.kind).includes("retenc")).length
    const htmlLower = String(pageHtml || "").toLowerCase()
    const htmlHasRetencao = htmlLower.includes("reten") || htmlLower.includes("retenc")
    const htmlHasTotalPago = htmlLower.includes("total pago")
    const encoding = decoded.encoding

    return new Response(
      JSON.stringify({
        parser_version: "tomeconta_v7",
        portal_link: parsedUrl.toString(),
        portal_auth_code: portalAuthCode,
        commitment_number: commitmentNumber,
        commitment_year: parsedUrl.searchParams.get("despesas.anoRef") || null,
        commitment_type: null,
        commitment_date: commitmentDate,
        creditor_name: creditorName,
        payments,
        payments_count: payments.length,
        payments_retencao_count: paymentsRetencaoCount,
        commitment_history_present: Boolean(commitmentHistory),
        commitment_history_source: commitmentHistoryFromHtml ? "html" : commitmentHistory ? "text" : "",
        html_has_retencao: htmlHasRetencao,
        html_has_total_pago: htmlHasTotalPago,
        html_length: String(pageHtml || "").length,
        html_encoding: encoding,
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
