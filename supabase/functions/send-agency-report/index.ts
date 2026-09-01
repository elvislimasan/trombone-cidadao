// Envia o relatório de broncas pendentes para uma secretaria.
//
// Chamada por `disparar_envios_do_orgao()` (migração 222) via pg_net,
// nunca pelo cliente.
//
// O corpo é:
// { envio_id }
//
// A autorização é feita por x-orgao-secret.
//
// IMPORTANTE:
// Esta função NÃO decide quais demandas entram no relatório.
// A seleção já foi feita no banco e congelada em `orgao_envio_itens`.
//
// Também NÃO grava a etapa "encaminhada".
// Essa etapa nasce do webhook de entrega.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-orgao-secret",
};

/* =========================================================
   CORES DO E-MAIL
========================================================= */

const BRAND = "#E63946";
const BRAND_DARK = "#C92734";

const TEXT = "#111827";
const TEXT_SOFT = "#374151";
const MUTED = "#6B7280";
const MUTED_LIGHT = "#9CA3AF";

const BORDER = "#E5E7EB";
const BG = "#F4F6F8";
const CARD = "#FFFFFF";

const DARK = "#171D26";
const DARK_SOFT = "#242C37";

const BRAND_LIGHT = "#FFF1F2";
const BRAND_BORDER = "#FECACA";

/* =========================================================
   HELPERS
========================================================= */

/**
 * Nada do que entra aqui é digitado por nós.
 * Título/endereço/nome podem vir do banco.
 */
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const MES = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

const capitalizar = (texto: string) => {
  if (!texto) return texto;
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

/**
 * Retorna o período de forma legível.
 *
 * `referencia` é uma data ISO sem fuso.
 * Ex.: 2026-08-01
 */
const periodoPorExtenso = (
  periodo: string,
  referencia: string,
) => {
  const [ano, mes, dia] = referencia.split("-").map(Number);

  if (periodo === "mensal") {
    return `${MES[mes - 1]} de ${ano}`;
  }

  const fim = new Date(
    Date.UTC(
      ano,
      mes - 1,
      dia + 6,
    ),
  );

  const d = (n: number) =>
    String(n).padStart(2, "0");

  return `${d(dia)}/${d(mes)} a ${d(
    fim.getUTCDate(),
  )}/${d(
    fim.getUTCMonth() + 1,
  )}/${fim.getUTCFullYear()}`;
};

/**
 * Período completo usado no hero do e-mail.
 */
const periodoCompleto = (
  periodo: string,
  referencia: string,
) => {
  const [ano, mes, dia] = referencia.split("-").map(Number);

  const d = (n: number) =>
    String(n).padStart(2, "0");

  if (periodo === "mensal") {
    const ultimoDia = new Date(
      Date.UTC(ano, mes, 0),
    ).getUTCDate();

    return `${d(1)}/${d(mes)}/${ano} a ${d(
      ultimoDia,
    )}/${d(mes)}/${ano}`;
  }

  const fim = new Date(
    Date.UTC(
      ano,
      mes - 1,
      dia + 6,
    ),
  );

  return `${d(dia)}/${d(mes)}/${ano} a ${d(
    fim.getUTCDate(),
  )}/${d(
    fim.getUTCMonth() + 1,
  )}/${fim.getUTCFullYear()}`;
};

/* =========================================================
   EDGE FUNCTION
========================================================= */

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(
      "ok",
      {
        headers: corsHeaders,
      },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  let envioId: string | null = null;

  try {
    /* =====================================================
       SEGURANÇA
    ===================================================== */

    const segredo =
      Deno.env.get("ORGAO_FUNCTION_SECRET");

    if (
      segredo &&
      req.headers.get("x-orgao-secret") !== segredo
    ) {
      return new Response(
        JSON.stringify({
          error: "unauthorized",
        }),
        {
          status: 401,
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    const apiKey =
      Deno.env.get("RESEND_API_KEY");

    if (!apiKey) {
      throw new Error(
        "RESEND_API_KEY não configurada",
      );
    }

    /* =====================================================
       BODY
    ===================================================== */

    const body = await req.json();

    envioId =
      body?.envio_id ?? null;

    if (!envioId) {
      throw new Error(
        "envio_id é obrigatório",
      );
    }

    /* =====================================================
       CONFIGURAÇÕES
    ===================================================== */

    const appUrl =
      Deno.env.get("APP_URL") ||
      "https://trombonecidadao.com.br";

    const remetente =
      Deno.env.get("ORGAO_FROM_EMAIL") ||
      Deno.env.get("RESEND_FROM_EMAIL") ||
      "Trombone Cidadão <naoresponda@trombonecidadao.com.br>";

    /**
     * Opcional.
     *
     * Caso você depois queira colocar uma imagem institucional
     * no topo do e-mail, configure:
     *
     * ORGAO_EMAIL_HERO_URL=https://...
     *
     * Se não existir, o layout continua funcionando normalmente.
     */
    const heroImageUrl =
      Deno.env.get("ORGAO_EMAIL_HERO_URL") || "";

    /* =====================================================
       BUSCA ENVIO
    ===================================================== */

    const {
      data: envio,
      error: envioError,
    } = await supabase
      .from("orgao_envios")
      .select(
        "*, canal:orgao_canais(*)",
      )
      .eq("id", envioId)
      .single();

    if (
      envioError ||
      !envio
    ) {
      throw new Error(
        "envio não encontrado",
      );
    }

    /* =====================================================
       IDEMPOTÊNCIA
    ===================================================== */

    if (
      envio.status === "enviado" ||
      envio.status === "entregue"
    ) {
      return new Response(
        JSON.stringify({
          ok: true,
          ja_enviado: true,
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    /* =====================================================
       CANAL
    ===================================================== */

    const canal = envio.canal;

    if (!canal) {
      throw new Error(
        "canal não encontrado",
      );
    }

    if (!canal.ativo) {
      await supabase.rpc(
        "registrar_falha_do_envio",
        {
          p_envio: envioId,
          p_motivo:
            "Canal desativado antes do disparo.",
          p_derruba: false,
        },
      );

      return new Response(
        JSON.stringify({
          ok: false,
          motivo: "canal_inativo",
        }),
        {
          headers: {
            ...corsHeaders,
            "Content-Type":
              "application/json",
          },
        },
      );
    }

    /* =====================================================
       ITENS DO RELATÓRIO
    ===================================================== */

    const {
      data: itens,
      error: itensError,
    } = await supabase
      .from("orgao_envio_itens")
      .select("primeira_vez")
      .eq("envio_id", envioId);

    if (itensError) {
      throw itensError;
    }

    if (
      !itens ||
      itens.length === 0
    ) {
      throw new Error(
        "envio sem broncas",
      );
    }

    /* =====================================================
       CIDADE
    ===================================================== */

    const {
      data: cidade,
    } = await supabase
      .from("cities")
      .select(
        "name, states(uf)",
      )
      .eq(
        "id",
        canal.city_id,
      )
      .maybeSingle();

    const nomeCidade =
      cidade?.name
        ? `${cidade.name}${
            cidade?.states?.uf
              ? `/${cidade.states.uf}`
              : ""
          }`
        : "";

    /* =====================================================
       INFORMAÇÕES DO RELATÓRIO
    ===================================================== */

    const rotuloPeriodo =
      periodoPorExtenso(
        envio.periodo,
        envio.referencia,
      );

    const intervaloPeriodo =
      periodoCompleto(
        envio.periodo,
        envio.referencia,
      );

    const novas =
      itens.filter(
        (i: any) =>
          i.primeira_vez,
      ).length;

    const repetidas =
      itens.length - novas;

    const quantidade =
      itens.length;

    const demandaLabel =
      quantidade === 1
        ? "demanda"
        : "demandas";

    const periodoTipo =
      envio.periodo === "semanal"
        ? "semanal"
        : "mensal";

    /* =====================================================
       RESUMO
    ===================================================== */

    const resumo =
      envio.periodo === "semanal"
        ? `${
            itens.length
          } ${
            itens.length === 1
              ? "demanda que este órgão ainda não havia recebido"
              : "demandas que este órgão ainda não havia recebido"
          }, em ${esc(
            nomeCidade,
          )}, todas sem solução até agora.`
        : `${
            itens.length
          } ${
            itens.length === 1
              ? "demanda continua aberta"
              : "demandas continuam abertas"
          } em ${esc(
            nomeCidade,
          )}${
            repetidas > 0
              ? ` — ${repetidas} ${
                  repetidas === 1
                    ? "já constava"
                    : "já constavam"
                } de relatórios anteriores`
              : ""
          }.`;

    /* =====================================================
       ASSUNTO
    ===================================================== */

    const assunto =
      envio.periodo === "semanal"
        ? `[${nomeCidade}] ${itens.length} nova(s) demanda(s) — ${canal.nome} — ${rotuloPeriodo}`
        : `[${nomeCidade}] Relatório mensal de pendências — ${canal.nome} — ${rotuloPeriodo}`;

    /* =====================================================
       LINKS
    ===================================================== */

    const linkRelatorio =
      `${appUrl}/orgao/relatorio/${envio.token}`;

    const homeUrl =
      appUrl;

    /* =====================================================
       HERO OPCIONAL
    ===================================================== */

    const heroImagemHtml =
      heroImageUrl
        ? `
          <tr>
            <td style="
              padding:0;
              margin:0;
              line-height:0;
            ">
              <img
                src="${esc(heroImageUrl)}"
                alt=""
                width="680"
                style="
                  display:block;
                  width:100%;
                  max-width:680px;
                  height:auto;
                  border:0;
                  margin:0;
                "
              />
            </td>
          </tr>
        `
        : "";

    /* =====================================================
       HTML DO E-MAIL
    ===================================================== */

    const html = `
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1"
  />
  <meta
    name="color-scheme"
    content="light only"
  />
  <meta
    name="supported-color-schemes"
    content="light"
  />
  <title>${esc(assunto)}</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:${BG};
    font-family:
      Arial,
      Helvetica,
      sans-serif;
    color:${TEXT};
  "
>

  <!-- PREHEADER -->
  <div
    style="
      display:none;
      max-height:0;
      overflow:hidden;
      opacity:0;
      color:transparent;
      line-height:1px;
      font-size:1px;
    "
  >
    ${quantidade} ${demandaLabel} aguardam acompanhamento de ${esc(canal.nome)} em ${esc(nomeCidade)}.
  </div>

  <table
    role="presentation"
    width="100%"
    cellspacing="0"
    cellpadding="0"
    border="0"
    style="
      width:100%;
      background:${BG};
      border-collapse:collapse;
    "
  >
    <tr>
      <td
        align="center"
        style="
          padding:32px 16px;
        "
      >

        <!-- =================================================
             CONTAINER PRINCIPAL
        ================================================== -->

        <table
          role="presentation"
          width="680"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            width:100%;
            max-width:680px;
            border-collapse:separate;
            border-spacing:0;
          "
        >

          <!-- =================================================
               CABEÇALHO
          ================================================== -->

          <tr>
            <td
              style="
                padding:0 4px 18px 4px;
              "
            >
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
              >
                <tr>

                  <td
                    valign="middle"
                    style="
                      font-size:20px;
                      line-height:26px;
                      font-weight:700;
                      color:${TEXT};
                    "
                  >
                    <span
                      style="
                        color:${BRAND};
                        font-weight:800;
                      "
                    >
                      Trombone
                    </span>
                    Cidadão
                  </td>

                  <td
                    align="right"
                    valign="middle"
                    style="
                      font-size:11px;
                      line-height:16px;
                      color:${MUTED};
                    "
                  >
                    Comunicação institucional
                  </td>

                </tr>
              </table>
            </td>
          </tr>

          <!-- =================================================
               CARD PRINCIPAL
          ================================================== -->

          <tr>
            <td
              style="
                background:${CARD};
                border:1px solid ${BORDER};
                border-radius:20px;
                overflow:hidden;
                box-shadow:
                  0 8px 24px
                  rgba(17,24,39,.06);
              "
            >

              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                  border-collapse:collapse;
                  width:100%;
                "
              >

                ${heroImagemHtml}

                <!-- ===========================================
                     HERO
                ============================================ -->

                <tr>
                  <td
                    style="
                      padding:34px 34px 32px 34px;
                      background:${DARK};
                      border-bottom:
                        4px solid ${BRAND};
                    "
                  >

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                    >
                      <tr>

                        <td
                          width="6"
                          style="
                            width:6px;
                            background:${BRAND};
                            border-radius:99px;
                          "
                        >
                          &nbsp;
                        </td>

                        <td
                          style="
                            padding-left:20px;
                          "
                        >

                          <div
                            style="
                              margin:0 0 8px 0;
                              color:#FF5663;
                              font-size:12px;
                              line-height:16px;
                              font-weight:700;
                              letter-spacing:1.4px;
                              text-transform:uppercase;
                            "
                          >
                            Relatório ${periodoTipo}
                          </div>

                          <div
                            style="
                              color:#FFFFFF;
                              font-size:34px;
                              line-height:40px;
                              font-weight:800;
                              letter-spacing:-0.5px;
                            "
                          >
                            ${esc(
                              capitalizar(
                                rotuloPeriodo,
                              ),
                            )}
                          </div>

                          <div
                            style="
                              margin-top:10px;
                              color:#CBD5E1;
                              font-size:13px;
                              line-height:20px;
                            "
                          >
                            Período de referência:
                            ${esc(intervaloPeriodo)}
                          </div>

                        </td>

                      </tr>
                    </table>

                  </td>
                </tr>

                <!-- ===========================================
                     CONTEÚDO
                ============================================ -->

                <tr>
                  <td
                    style="
                      padding:32px;
                    "
                  >

                    <!-- =======================================
                         DESTINATÁRIO + TOTAL
                    ======================================== -->

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="
                        width:100%;
                        border-collapse:collapse;
                      "
                    >
                      <tr>

                        <!-- DESTINATÁRIO -->
                        <td
                          valign="middle"
                          style="
                            width:62%;
                            padding-right:24px;
                          "
                        >

                          <table
                            role="presentation"
                            cellspacing="0"
                            cellpadding="0"
                            border="0"
                          >
                            <tr>

                              <td
                                width="62"
                                valign="middle"
                              >
                                <div
                                  style="
                                    width:54px;
                                    height:54px;
                                    border-radius:50%;
                                    background:${BRAND_LIGHT};
                                    border:1px solid ${BRAND_BORDER};
                                    text-align:center;
                                    line-height:54px;
                                    font-size:25px;
                                  "
                                >
                                  🏛️
                                </div>
                              </td>

                              <td
                                valign="middle"
                                style="
                                  padding-left:8px;
                                "
                              >

                                <div
                                  style="
                                    color:${MUTED};
                                    font-size:10px;
                                    line-height:14px;
                                    font-weight:700;
                                    letter-spacing:1px;
                                    text-transform:uppercase;
                                    margin-bottom:5px;
                                  "
                                >
                                  Destinatário
                                </div>

                                <div
                                  style="
                                    color:${TEXT};
                                    font-size:22px;
                                    line-height:28px;
                                    font-weight:800;
                                  "
                                >
                                  ${esc(canal.nome)}
                                </div>

                                <div
                                  style="
                                    color:${MUTED};
                                    font-size:13px;
                                    line-height:20px;
                                    margin-top:5px;
                                  "
                                >
                                  📍 ${esc(nomeCidade)}
                                </div>

                              </td>

                            </tr>
                          </table>

                        </td>

                        <!-- TOTAL -->
                        <td
                          valign="middle"
                          style="
                            width:38%;
                            padding-left:26px;
                            border-left:1px solid ${BORDER};
                          "
                        >

                          <div
                            style="
                              color:${MUTED};
                              font-size:10px;
                              line-height:14px;
                              font-weight:700;
                              letter-spacing:1px;
                              text-transform:uppercase;
                              margin-bottom:6px;
                            "
                          >
                            Total de demandas
                          </div>

                          <div
                            style="
                              color:${BRAND};
                              font-size:40px;
                              line-height:44px;
                              font-weight:800;
                              letter-spacing:-1px;
                            "
                          >
                            ${quantidade}
                          </div>

                          <div
                            style="
                              color:${TEXT};
                              font-size:14px;
                              line-height:20px;
                              font-weight:700;
                              margin-top:2px;
                            "
                          >
                            ${
                              quantidade === 1
                                ? "demanda aberta"
                                : "demandas abertas"
                            }
                          </div>

                        </td>

                      </tr>
                    </table>

                    <!-- =======================================
                         RESUMO
                    ======================================== -->

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="
                        width:100%;
                        margin-top:28px;
                        background:${BRAND_LIGHT};
                        border:1px solid ${BRAND_BORDER};
                        border-radius:14px;
                      "
                    >
                      <tr>

                        <td
                          width="60"
                          valign="middle"
                          style="
                            padding:
                              18px 0 18px 18px;
                          "
                        >
                          <div
                            style="
                              width:42px;
                              height:42px;
                              border-radius:50%;
                              background:#FFFFFF;
                              color:${BRAND};
                              text-align:center;
                              line-height:42px;
                              font-size:20px;
                              border:1px solid ${BRAND_BORDER};
                            "
                          >
                            📄
                          </div>
                        </td>

                        <td
                          valign="middle"
                          style="
                            padding:
                              18px 20px 18px 12px;
                            color:${TEXT_SOFT};
                            font-size:14px;
                            line-height:22px;
                          "
                        >
                          Estas demandas foram registradas
                          por moradores de
                          <strong>${esc(nomeCidade)}</strong>
                          no
                          <strong
                            style="
                              color:${BRAND};
                            "
                          >
                            Trombone Cidadão
                          </strong>,
                          com foto e localização,
                          e passaram por moderação.

                          A lista completa fica na página
                          do relatório, com endereço,
                          categoria e data de cada uma.
                        </td>

                      </tr>
                    </table>

                    <!-- =======================================
                         RESUMO DA SITUAÇÃO
                    ======================================== -->

                    <div
                      style="
                        margin-top:20px;
                        color:${MUTED};
                        font-size:13px;
                        line-height:20px;
                        text-align:center;
                      "
                    >
                      ${resumo}
                    </div>

                    <!-- =======================================
                         CTA
                    ======================================== -->

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="
                        margin-top:24px;
                      "
                    >
                      <tr>
                        <td align="center">

                          <table
                            role="presentation"
                            cellspacing="0"
                            cellpadding="0"
                            border="0"
                          >
                            <tr>
                              <td
                                align="center"
                                bgcolor="${BRAND}"
                                style="
                                  background:${BRAND};
                                  border-radius:10px;
                                  box-shadow:
                                    0 6px 14px
                                    rgba(230,57,70,.18);
                                "
                              >
                                <a
                                  href="${esc(linkRelatorio)}"
                                  target="_blank"
                                  style="
                                    display:inline-block;
                                    padding:
                                      16px 30px;
                                    font-family:
                                      Arial,
                                      Helvetica,
                                      sans-serif;
                                    font-size:15px;
                                    line-height:20px;
                                    font-weight:700;
                                    color:#FFFFFF;
                                    text-decoration:none;
                                    border-radius:10px;
                                  "
                                >
                                  Abrir o relatório ·
                                  ${quantidade}
                                  ${demandaLabel}
                                </a>
                              </td>
                            </tr>
                          </table>

                        </td>
                      </tr>
                    </table>

                    <!-- =======================================
                         AÇÕES DISPONÍVEIS
                    ======================================== -->

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="
                        width:100%;
                        margin-top:24px;
                        border:1px solid ${BORDER};
                        border-radius:14px;
                      "
                    >
                      <tr>

                        <td
                          width="62"
                          valign="top"
                          style="
                            padding:
                              20px 0 20px 20px;
                          "
                        >
                          <div
                            style="
                              width:40px;
                              height:40px;
                              border-radius:50%;
                              border:2px solid ${BRAND};
                              color:${BRAND};
                              text-align:center;
                              line-height:38px;
                              font-size:20px;
                            "
                          >
                            ↓
                          </div>
                        </td>

                        <td
                          valign="top"
                          style="
                            padding:
                              20px 22px 20px 10px;
                          "
                        >

                          <div
                            style="
                              margin-bottom:7px;
                              color:${TEXT};
                              font-size:14px;
                              line-height:20px;
                              font-weight:700;
                            "
                          >
                            O que você pode fazer no relatório
                          </div>

                          <div
                            style="
                              color:${TEXT_SOFT};
                              font-size:13px;
                              line-height:21px;
                            "
                          >
                            Na página é possível
                            <strong>
                              baixar o relatório em PDF
                            </strong>
                            para anexar ao processo,
                            abrir cada demanda individualmente
                            e
                            <strong>
                              confirmar o recebimento
                            </strong>.

                            Se houver um número de protocolo
                            interno, ele também poderá ser
                            informado.
                          </div>

                          <div
                            style="
                              color:${MUTED};
                              font-size:12px;
                              line-height:19px;
                              margin-top:9px;
                            "
                          >
                            A confirmação ficará registrada
                            na página pública das demandas,
                            indicando que este órgão recebeu
                            oficialmente a relação enviada.
                          </div>

                        </td>

                      </tr>
                    </table>

                    <!-- =======================================
                         ENVIO AUTOMÁTICO
                    ======================================== -->

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="
                        width:100%;
                        margin-top:14px;
                        background:#F8FAFC;
                        border:1px solid ${BORDER};
                        border-radius:14px;
                      "
                    >
                      <tr>

                        <td
                          width="62"
                          valign="top"
                          style="
                            padding:
                              20px 0 20px 20px;
                          "
                        >
                          <div
                            style="
                              width:40px;
                              height:40px;
                              border-radius:10px;
                              background:${BRAND_LIGHT};
                              border:1px solid ${BRAND_BORDER};
                              color:${BRAND};
                              text-align:center;
                              line-height:40px;
                              font-size:19px;
                            "
                          >
                            ◷
                          </div>
                        </td>

                        <td
                          valign="top"
                          style="
                            padding:
                              20px 22px 20px 10px;
                          "
                        >

                          <div
                            style="
                              color:${TEXT_SOFT};
                              font-size:13px;
                              line-height:21px;
                            "
                          >
                            Este relatório é gerado
                            automaticamente e enviado
                            ${
                              envio.periodo === "semanal"
                                ? "toda segunda-feira"
                                : "no primeiro dia útil de cada mês"
                            }.

                            Para corrigir o destinatário,
                            indicar outro órgão responsável
                            ou deixar de receber,
                            basta
                            <strong>
                              responder este e-mail
                            </strong>.
                          </div>

                          <div
                            style="
                              margin-top:8px;
                              color:${MUTED};
                              font-size:12px;
                              line-height:19px;
                            "
                          >
                            A resposta será direcionada ao
                            representante do Trombone Cidadão
                            em
                            <strong>${esc(nomeCidade)}</strong>.
                          </div>

                        </td>

                      </tr>
                    </table>

                  </td>
                </tr>

                <!-- ===========================================
                     RODAPÉ INTERNO
                ============================================ -->

                <tr>
                  <td
                    style="
                      border-top:
                        3px solid ${BRAND};
                      padding:
                        24px 32px;
                      background:#FFFFFF;
                    "
                  >

                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                    >
                      <tr>

                        <td
                          valign="middle"
                          style="
                            color:${TEXT};
                            font-size:17px;
                            line-height:22px;
                            font-weight:700;
                          "
                        >
                          <span
                            style="
                              color:${BRAND};
                            "
                          >
                            Trombone
                          </span>
                          Cidadão

                          <div
                            style="
                              color:${MUTED};
                              font-size:11px;
                              line-height:17px;
                              font-weight:400;
                              margin-top:5px;
                            "
                          >
                            Transparência,
                            participação e cidade
                            melhor para todos.
                          </div>
                        </td>

                        <td
                          align="right"
                          valign="middle"
                          style="
                            color:${MUTED};
                            font-size:11px;
                            line-height:17px;
                          "
                        >
                          ${esc(nomeCidade)}
                        </td>

                      </tr>
                    </table>

                  </td>
                </tr>

              </table>

            </td>
          </tr>

          <!-- =================================================
               RODAPÉ EXTERNO
          ================================================== -->

          <tr>
            <td
              align="center"
              style="
                padding:
                  18px 16px 4px;
                color:${MUTED_LIGHT};
                font-size:10px;
                line-height:17px;
              "
            >
              Este é um e-mail institucional
              enviado automaticamente pelo
              Trombone Cidadão.

              <br />

              © ${new Date().getFullYear()}
              Trombone Cidadão ·
              ${esc(nomeCidade)}

              <br />

              <a
                href="${esc(homeUrl)}"
                target="_blank"
                style="
                  color:${MUTED};
                  text-decoration:none;
                "
              >
                trombonecidadao.com.br
              </a>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>
`;

    /* =====================================================
       VERSÃO TEXTO
    ===================================================== */

    const texto = `
TROMBONE CIDADÃO

RELATÓRIO ${periodoTipo.toUpperCase()}
${capitalizar(rotuloPeriodo)}

Período de referência:
${intervaloPeriodo}

Órgão:
${canal.nome}

Município:
${nomeCidade}

TOTAL:
${quantidade} ${demandaLabel}

${resumo}

Estas demandas foram registradas por moradores de ${nomeCidade} no Trombone Cidadão, com foto e localização, e passaram por moderação.

Acesse o relatório:
${linkRelatorio}

Na página você poderá:

- visualizar todas as demandas;
- abrir cada demanda individualmente;
- baixar o relatório em PDF;
- confirmar o recebimento;
- informar um protocolo interno, se houver.

Este relatório é enviado ${
  envio.periodo === "semanal"
    ? "toda segunda-feira"
    : "no primeiro dia útil de cada mês"
}.

Para corrigir o destinatário, indicar outro órgão responsável ou deixar de receber, basta responder este e-mail.

Trombone Cidadão
${nomeCidade}
${appUrl}
`;

    /* =====================================================
       DESTINATÁRIOS
    ===================================================== */

    const destinatarios = [
      canal.email,
    ];

    const copias =
      Array.isArray(
        canal.emails_copia,
      )
        ? canal.emails_copia.filter(
            (e: string) =>
              !!e &&
              e !== canal.email,
          )
        : [];

    /* =====================================================
       ENVIO RESEND
    ===================================================== */

    const resposta =
      await fetch(
        "https://api.resend.com/emails",
        {
          method: "POST",

          headers: {
            Authorization:
              `Bearer ${apiKey}`,

            "Content-Type":
              "application/json",
          },

          body: JSON.stringify({
            from:
              remetente,

            to:
              destinatarios,

            ...(copias.length > 0
              ? {
                  cc: copias,
                }
              : {}),

            reply_to:
              canal.reply_to,

            subject:
              assunto,

            html,

            text:
              texto,

            tags: [
              {
                name:
                  "envio",
                value:
                  String(envio.id),
              },
            ],
          }),
        },
      );

    const resultado =
      await resposta
        .json()
        .catch(
          () => ({}),
        );

    /* =====================================================
       ERRO RESEND
    ===================================================== */

    if (!resposta.ok) {
      const motivo =
        resultado?.message ||
        `Resend respondeu ${resposta.status}`;

      await supabase.rpc(
        "registrar_falha_do_envio",
        {
          p_envio:
            envioId,

          p_motivo:
            motivo,

          p_derruba:
            false,
        },
      );

      throw new Error(
        motivo,
      );
    }

    /* =====================================================
       ATUALIZA ENVIO
    ===================================================== */

    await supabase
      .from("orgao_envios")
      .update({
        status:
          "enviado",

        enviado_em:
          new Date().toISOString(),

        provider_message_id:
          resultado?.id ?? null,
      })
      .eq(
        "id",
        envioId,
      );

    /* =====================================================
       EVENTO
    ===================================================== */

    await supabase
      .from("orgao_envio_eventos")
      .insert({
        envio_id:
          envioId,

        tipo:
          "enviado",

        payload:
          resultado ?? {},
      });

    /* =====================================================
       RETORNO
    ===================================================== */

    return new Response(
      JSON.stringify({
        ok:
          true,

        broncas:
          itens.length,

        novas,

        repetidas,
      }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  } catch (error) {
    /* =====================================================
       REGISTRA ERRO
    ===================================================== */

    if (envioId) {
      await supabase
        .from(
          "orgao_envio_eventos",
        )
        .insert({
          envio_id:
            envioId,

          tipo:
            "erro",

          payload: {
            mensagem:
              String(
                (error as Error)
                  ?.message ??
                  error,
              ),
          },
        })
        .then(
          () => {},
          () => {},
        );
    }

    /* =====================================================
       RETORNO DE ERRO
    ===================================================== */

    return new Response(
      JSON.stringify({
        error:
          String(
            (error as Error)
              ?.message ??
              error,
          ),
      }),
      {
        status:
          400,

        headers: {
          ...corsHeaders,
          "Content-Type":
            "application/json",
        },
      },
    );
  }
});