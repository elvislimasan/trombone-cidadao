// O que o provedor de e-mail disse sobre o relatório da secretaria.
//
// É AQUI QUE A ETAPA `encaminhada` NASCE
//
// Não no envio. A migração 222 explica por quê: o app chamando uma API não é
// prova de encaminhamento — é o app afirmando sobre si mesmo. O evento
// `email.delivered` é a afirmação de um terceiro de que a mensagem entrou na
// caixa do destinatário, e é a única coisa que autoriza gravar a etapa. Todo
// evento é guardado cru em `orgao_envio_eventos` antes de qualquer decisão.
//
// VERIFICAÇÃO DE ASSINATURA, NÃO SEGREDO NA URL
//
// Este endpoint é público — o Resend precisa alcançá-lo — e ele grava numa
// tabela que produz etapa oficial. Sem verificação, qualquer um que descobrisse
// a URL poderia afirmar entrega de qualquer envio.
//
// O Resend assina no padrão Standard Webhooks (Svix). São ~20 linhas de
// HMAC-SHA256 com a Web Crypto, e por isso não há dependência aqui: uma
// biblioteca externa neste caminho seria código de terceiro no ponto exato em
// que se decide o que é verdade sobre a prefeitura.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

const base64ParaBytes = (b64: string) =>
  Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

const bytesParaBase64 = (bytes: ArrayBuffer) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)));

/** Comparação sem atalho de tempo: sair no primeiro byte diferente vaza o prefixo correto. */
const iguais = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
};

/**
 * Standard Webhooks: HMAC-SHA256 sobre `id.timestamp.corpo`, chave = a parte
 * depois de `whsec_`, decodificada de base64.
 *
 * O header traz uma LISTA de assinaturas (`v1,aaa v1,bbb`) porque o segredo
 * pode estar em rotação. Basta uma bater.
 */
const assinaturaConfere = async (
  segredo: string,
  id: string,
  timestamp: string,
  corpo: string,
  header: string,
) => {
  const chave = await crypto.subtle.importKey(
    "raw",
    base64ParaBytes(segredo.replace(/^whsec_/, "")),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const assinado = `${id}.${timestamp}.${corpo}`;
  const esperado = bytesParaBase64(
    await crypto.subtle.sign("HMAC", chave, new TextEncoder().encode(assinado)),
  );

  return header
    .split(" ")
    .map((p) => p.split(",")[1] ?? "")
    .some((sig) => sig && iguais(sig, esperado));
};

/** Nosso vocabulário de evento. O do provedor é dele e muda quando ele quiser. */
const TIPO: Record<string, string> = {
  "email.sent": "enviado",
  "email.delivered": "entregue",
  "email.delivery_delayed": "adiado",
  "email.bounced": "devolvido",
  "email.complained": "reclamacao",
  "email.opened": "aberto",
  "email.clicked": "clicado",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const corpo = await req.text();

    const segredo = Deno.env.get("RESEND_WEBHOOK_SECRET");
    if (!segredo) throw new Error("RESEND_WEBHOOK_SECRET não configurada");

    const id = req.headers.get("svix-id") ?? req.headers.get("webhook-id") ?? "";
    const ts = req.headers.get("svix-timestamp") ?? req.headers.get("webhook-timestamp") ?? "";
    const sig = req.headers.get("svix-signature") ?? req.headers.get("webhook-signature") ?? "";

    if (!id || !ts || !sig) {
      return new Response(JSON.stringify({ error: "assinatura ausente" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Uma requisição legítima capturada e reenviada meses depois não pode
    // reafirmar entrega. Cinco minutos é a tolerância do padrão.
    const idade = Math.abs(Date.now() / 1000 - Number(ts));
    if (!Number.isFinite(idade) || idade > 300) {
      return new Response(JSON.stringify({ error: "timestamp fora da janela" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!(await assinaturaConfere(segredo, id, ts, corpo, sig))) {
      return new Response(JSON.stringify({ error: "assinatura invalida" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const evento = JSON.parse(corpo);
    const tipo = TIPO[evento?.type];
    const messageId = evento?.data?.email_id;

    // Evento que não conhecemos, ou de um e-mail que não é relatório de órgão
    // (esta chave do Resend manda outros e-mails do app). 200 de propósito:
    // devolver erro faria o provedor retentar para sempre.
    if (!tipo || !messageId) {
      return new Response(JSON.stringify({ ok: true, ignorado: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: envio } = await supabase
      .from("orgao_envios")
      .select("id, status")
      .eq("provider_message_id", messageId)
      .maybeSingle();

    if (!envio) {
      return new Response(JSON.stringify({ ok: true, ignorado: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ocorrido = evento?.created_at
      ? new Date(evento.created_at).toISOString()
      : new Date().toISOString();

    // O rastro cru vai primeiro, sempre. Se a decisão abaixo falhar, ainda
    // sobra o que o provedor disse e quando — que é o que uma auditoria pede.
    await supabase.from("orgao_envio_eventos").insert({
      envio_id: envio.id,
      tipo,
      payload: evento,
      ocorrido_em: ocorrido,
    });

    if (tipo === "entregue") {
      const { data: etapas } = await supabase.rpc("registrar_entrega_do_envio", {
        p_envio: envio.id,
        p_ocorrido: ocorrido,
      });
      return new Response(JSON.stringify({ ok: true, etapas: etapas ?? 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (tipo === "devolvido" || tipo === "reclamacao") {
      const bounce = evento?.data?.bounce ?? {};
      // Bounce transitório (caixa cheia, servidor fora) não derruba o canal —
      // a retentativa do cron cobre. Sem informação de tipo, tratamos como
      // permanente: continuar mandando para um endereço quebrado queima a
      // reputação do domínio, e religar o canal é um clique do admin.
      const permanente =
        tipo === "reclamacao" ||
        String(bounce?.type ?? "Permanent").toLowerCase() !== "transient";

      const motivo =
        tipo === "reclamacao"
          ? "O destinatário marcou o relatório como spam."
          : `Devolvido pelo servidor do destinatário: ${
              bounce?.subType || bounce?.type || "sem detalhe"
            }.`;

      await supabase.rpc("registrar_falha_do_envio", {
        p_envio: envio.id,
        p_motivo: motivo,
        p_derruba: permanente,
      });

      return new Response(JSON.stringify({ ok: true, canal_derrubado: permanente }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true, tipo }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: String((error as Error)?.message ?? error) }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
