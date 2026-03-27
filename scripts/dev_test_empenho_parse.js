const stripTagsToText = (html) => {
  let out = html;
  out = out.replace(/<script[\s\S]*?<\/script>/gi, " ");
  out = out.replace(/<style[\s\S]*?<\/style>/gi, " ");
  out = out.replace(/\r/g, "");
  out = out.replace(/<br\s*\/?>/gi, "\n");
  out = out.replace(/<\/(td|th|p|div|tr|li|h\d)>/gi, "\n");
  out = out.replace(/<[^>]+>/g, " ");
  out = out.replace(/&nbsp;/g, " ");
  out = out.replace(/&amp;/g, "&");
  out = out.replace(/&quot;/g, '"');
  out = out.replace(/&#39;/g, "'");
  out = out.replace(/[ \t]+/g, " ");
  return out
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .join("\n");
};

const parseMoneyPtBr = (raw) => {
  const cleaned = String(raw || "").replace(/[^\d.,]/g, "");
  const comma = cleaned.lastIndexOf(",");
  const safe = comma >= 0 && cleaned.length > comma + 3 ? cleaned.slice(0, comma + 3) : cleaned;
  const normalized = safe.replace(/\./g, "").replace(",", ".");
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
};

const parseRows = (text) => {
  const startIdx = text.toLowerCase().indexOf("n° liquidação");
  const body = startIdx >= 0 ? text.slice(startIdx) : text;
  const rowRe =
    /(?:^|\n)(\d+)\s+([\s\S]*?)\s+(\d{2}-\d{2}-\d{4})\s+(\d{2}-\d{2}-\d{4})\s+([A-Za-zÀ-ÿ]+)\s*R\$\s*([\d\.,]+)/g;
  const rows = [];
  for (const m of body.matchAll(rowRe)) {
    rows.push({
      installment: String(m[1]).trim(),
      history: String(m[2]).replace(/\s+/g, " ").trim(),
      opened_at: String(m[3]).trim(),
      due_at: String(m[4]).trim(),
      kind: String(m[5]).trim(),
      value_raw: String(m[6]).trim(),
      value: parseMoneyPtBr(m[6]),
    });
  }
  return rows;
};

const normalizeKey = (v) =>
  String(v || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");

const parseCsvLiquidações = (csv) => {
  const lines = String(csv || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const headerIdx = lines.findIndex((l) => {
    const k = normalizeKey(l);
    return k.includes("liquidacao") && k.includes("historico") && (k.includes("data") || k.includes("vencimento"));
  });
  if (headerIdx < 0) return [];

  const headerLine = lines[headerIdx];
  const delim = headerLine.includes(";") ? ";" : headerLine.includes("\t") ? "\t" : ",";

  const rows = [];
  for (let i = headerIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    const first = (line.split(delim)[0] || "").trim();
    if (!/^\d+$/.test(first)) break;
    const parts = line.split(delim).map((x) => x.trim());
    rows.push({
      installment: parts[0] || "",
      history: parts[1] || "",
      opened_at: parts[2] || "",
      due_at: parts[3] || "",
      kind: parts[4] || "",
      value_raw: parts[5] || "",
      value: parseMoneyPtBr(parts[5]),
    });
  }
  return rows;
};

async function main() {
  const url = process.argv[2];
  if (!url) throw new Error("usage: node scripts/dev_test_empenho_parse.js <url>");
  const res = await fetch(url, { headers: { "User-Agent": "TromboneCidadao/1.0" } });
  const html = await res.text();
  const setCookies = [];
  for (const [k, v] of res.headers.entries()) {
    if (String(k).toLowerCase() === "set-cookie") setCookies.push(String(v));
  }
  const cookieHeader = setCookies.map((c) => c.split(";")[0]).filter(Boolean).join("; ");
  const cookieVal = (setCookies.join("; ").match(/csrfToken=([^;]+)/) || [])[1] || "";
  const cookieDecoded = cookieVal ? decodeURIComponent(cookieVal) : "";
  const csrf = (html.match(/name=\"_csrfToken\"\s+value=\"([^\"]+)\"/i) || [])[1] || null;
  const action = (html.match(/action=\"([^\"]*exportarempenho[^\"]+\/csv)\"/i) || [])[1] || null;

  if (csrf && action) {
    const exportUrl = new URL(action, new URL(url).origin).toString();
    const body = new URLSearchParams({ _method: "POST", _csrfToken: csrf }).toString();
    const csvRes = await fetch(exportUrl, {
      method: "POST",
      headers: {
        "User-Agent": "TromboneCidadao/1.0",
        "Accept": "text/csv,text/plain,*/*",
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      },
      body,
    });
    const csv = await csvRes.text();
    console.log("csv status", csvRes.status, "ct", csvRes.headers.get("content-type"));
    console.log(csv.slice(0, 1200));
    const csvRows = parseCsvLiquidações(csv);
    console.log("csv rows", csvRows.length);
    console.log(csvRows.slice(0, 3));
  } else {
    console.log("csrf/action not found");
  }

  const jsCsrf = ((html.match(/const CSRF\\s*=\\s*\\\"([^\\\"]+)\\\"/i) || [])[1] || "").replace(/\\\//g, "/");
  const slug = url.split("/").pop();
  if (slug && cookieHeader) {
    const empBody = new URLSearchParams({ slug }).toString();
    const tryTokens = [
      { name: "jsCsrf", token: jsCsrf },
      { name: "cookieDecoded", token: cookieDecoded },
      { name: "cookieRaw", token: cookieVal },
    ].filter((x) => x.token);
    for (const t of tryTokens) {
      const rr = await fetch("https://floresta.pe.gov.br/transparencia/despesas/get-empenho", {
        method: "POST",
        headers: {
          "User-Agent": "TromboneCidadao/1.0",
          "Accept": "application/json",
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-CSRF-Token": t.token,
          "X-Requested-With": "XMLHttpRequest",
          "Referer": url,
          "Origin": "https://floresta.pe.gov.br",
          Cookie: cookieHeader,
        },
        body: empBody,
      });
      console.log("get-empenho", t.name, rr.status, rr.headers.get("content-type"));
      const full = await rr.text();
      const preview = full.slice(0, 160);
      console.log(preview.replace(/\s+/g, " "));
      if (rr.status === 200 && t.name === "cookieDecoded") {
        try {
          const data = JSON.parse(full);
          const id = data?.empenho?.ID_EMPENHO;
          console.log("ID_EMPENHO", id);
          const liqBody = new URLSearchParams({ id: String(id) }).toString();
          const liqRes = await fetch("https://floresta.pe.gov.br/transparencia/despesas/get-liquidacao", {
            method: "POST",
            headers: {
              "User-Agent": "TromboneCidadao/1.0",
              "Accept": "application/json",
              "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
              "X-CSRF-Token": t.token,
              "X-Requested-With": "XMLHttpRequest",
              "Referer": url,
              "Origin": "https://floresta.pe.gov.br",
              Cookie: cookieHeader,
            },
            body: liqBody,
          });
          const liqTxt = await liqRes.text();
          console.log("liq status", liqRes.status, liqRes.headers.get("content-type"));
          console.log(liqTxt.slice(0, 400).replace(/\s+/g, " "));
        } catch {}
      }
    }
  }

  const text = stripTagsToText(html);
  const idx = text.toLowerCase().indexOf("n° liquidação");
  console.log("idx", idx);
  console.log(text.slice(Math.max(0, idx), Math.max(0, idx) + 1500));
  const rows = parseRows(text);
  console.log("rows", rows.length);
  console.log(rows.slice(0, 5));
}

main().catch((e) => {
  console.error(e?.message || e);
  process.exitCode = 1;
});
