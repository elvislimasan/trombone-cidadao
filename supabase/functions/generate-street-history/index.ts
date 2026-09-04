import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });

const BUCKET = "pavement-history";
const MAX_DOCUMENTS = 4;

// Inline data vira base64 e cresce cerca de 33%.
// Mantemos 14 MB como limite preventivo da função.
const MAX_TOTAL_BYTES = 14 * 1024 * 1024;

type HistoricalDocument = {
  title?: string;
  description?: string;
  original_name?: string;
  type?: string;
  path?: string;
  url?: string;
};

const storagePath = (document: HistoricalDocument) => {
  if (String(document.path || "").trim()) {
    return String(document.path).trim();
  }

  try {
    const marker = `/storage/v1/object/public/${BUCKET}/`;
    const pathname = new URL(String(document.url || "")).pathname;
    const index = pathname.indexOf(marker);

    return index === -1
      ? ""
      : decodeURIComponent(
          pathname.slice(index + marker.length),
        );
  } catch {
    return "";
  }
};

const isPdf = (document: HistoricalDocument) => {
  const values = [
    document.type,
    document.original_name,
    document.path,
    document.url,
  ].map((value) => String(value || "").toLowerCase());

  return values.some(
    (value) =>
      value === "pdf" ||
      value.includes("application/pdf") ||
      value.endsWith(".pdf"),
  );
};

const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;

  let binary = "";

  for (
    let offset = 0;
    offset < bytes.length;
    offset += chunkSize
  ) {
    binary += String.fromCharCode(
      ...bytes.subarray(offset, offset + chunkSize),
    );
  }

  return btoa(binary);
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error || "unknown_error");
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (req.method !== "POST") {
    return json(
      {
        error: "method_not_allowed",
      },
      405,
    );
  }

  let generationId: string | null = null;

  let admin: ReturnType<typeof createClient> | null = null;

  try {
    /*
     * ============================================================
     * AUTENTICAÇÃO
     * ============================================================
     */

    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return json(
        {
          error: "Faça login para gerar o texto.",
        },
        401,
      );
    }

    /*
     * ============================================================
     * VARIÁVEIS DE AMBIENTE
     * ============================================================
     */

    const supabaseUrl =
      Deno.env.get("SUPABASE_URL") || "";

    const anonKey =
      Deno.env.get("SUPABASE_ANON_KEY") || "";

    const serviceKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

    const geminiKey =
      Deno.env.get("GEMINI_API_KEY") || "";

    const model =
      Deno.env.get("GEMINI_MODEL") ||
      "gemini-2.5-flash-lite";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      console.error(
        "[generate-street-history] Supabase env ausente",
      );

      return json(
        {
          error:
            "A configuração interna do Supabase está incompleta.",
        },
        503,
      );
    }

    if (!geminiKey) {
      console.error(
        "[generate-street-history] GEMINI_API_KEY ausente",
      );

      return json(
        {
          error:
            "A geração por IA ainda não foi configurada.",
        },
        503,
      );
    }

    /*
     * ============================================================
     * USUÁRIO
     * ============================================================
     */

    const userClient = createClient(
      supabaseUrl,
      anonKey,
      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser();

    if (userError || !user) {
      console.error(
        "[generate-street-history] Erro de autenticação:",
        userError,
      );

      return json(
        {
          error: "Sessão inválida ou expirada.",
        },
        401,
      );
    }

    /*
     * ============================================================
     * CLIENT ADMIN
     * ============================================================
     */

    admin = createClient(
      supabaseUrl,
      serviceKey,
    );

    /*
     * ============================================================
     * BODY
     * ============================================================
     */

    let requestBody: {
      street_id?: string;
    };

    try {
      requestBody = await req.json();
    } catch {
      return json(
        {
          error: "Requisição inválida.",
        },
        400,
      );
    }

    const streetId =
      requestBody.street_id;

    if (
      !/^[0-9a-f-]{36}$/i.test(
        String(streetId || ""),
      )
    ) {
      return json(
        {
          error: "Rua inválida.",
        },
        400,
      );
    }

    /*
     * ============================================================
     * BUSCAR PERFIL + RUA
     * ============================================================
     */

    const [
      { data: profile, error: profileError },
      { data: street, error: streetError },
    ] = await Promise.all([
      admin
        .from("profiles")
        .select(
          "is_admin, is_master, is_ambassador",
        )
        .eq("id", user.id)
        .maybeSingle(),

      admin
        .from("pavement_streets")
        .select(
          `
            id,
            name,
            city_id,
            honoree_name,
            biography,
            curiosities,
            historical_documents
          `,
        )
        .eq("id", streetId)
        .maybeSingle(),
    ]);

    if (profileError) {
      console.error(
        "[generate-street-history] Erro ao carregar perfil:",
        profileError,
      );

      throw new Error(
        "Não foi possível verificar suas permissões.",
      );
    }

    if (streetError || !street) {
      console.error(
        "[generate-street-history] Rua:",
        streetError,
      );

      return json(
        {
          error: "Rua não encontrada.",
        },
        404,
      );
    }

    /*
     * ============================================================
     * PERMISSÕES
     * ============================================================
     */

    let authorized = Boolean(
      profile?.is_admin ||
        profile?.is_master,
    );

    if (
      !authorized &&
      profile?.is_ambassador
    ) {
      const {
        data: assignment,
        error: assignmentError,
      } = await admin
        .from("ambassador_cities")
        .select("city_id")
        .eq("user_id", user.id)
        .eq("city_id", street.city_id)
        .eq("status", "active")
        .maybeSingle();

      if (assignmentError) {
        console.error(
          "[generate-street-history] Ambassador:",
          assignmentError,
        );
      }

      authorized = Boolean(
        assignment,
      );
    }

    if (!authorized) {
      return json(
        {
          error:
            "Você não pode gerar conteúdo para esta rua.",
        },
        403,
      );
    }

    /*
     * ============================================================
     * DOCUMENTOS
     * ============================================================
     */

    const historicalDocuments =
      Array.isArray(
        street.historical_documents,
      )
        ? street.historical_documents
        : [];

    const documents =
      historicalDocuments
        .filter(
          (
            document: HistoricalDocument,
          ) =>
            isPdf(document) &&
            storagePath(document),
        )
        .slice(
          0,
          MAX_DOCUMENTS,
        );

    if (
      documents.length === 0
    ) {
      return json(
        {
          error:
            "Anexe e salve pelo menos um documento PDF antes de gerar o texto.",
        },
        400,
      );
    }

    /*
     * ============================================================
     * LOG DA GERAÇÃO
     * ============================================================
     */

    const {
      data: generation,
      error: logError,
    } = await admin
      .from(
        "street_history_ai_generations",
      )
      .insert({
        street_id: street.id,
        user_id: user.id,
        model,
        document_count:
          documents.length,
      })
      .select("id")
      .single();

    if (
      logError ||
      !generation
    ) {
      console.error(
        "[generate-street-history] Erro ao criar log:",
        logError,
      );

      throw new Error(
        "Não foi possível iniciar a geração.",
      );
    }

    generationId =
      generation.id;

    /*
     * ============================================================
     * DOWNLOAD DOS PDFs
     * ============================================================
     */

    let totalBytes = 0;

    const documentParts: Array<
      | {
          text: string;
        }
      | {
          inlineData: {
            mimeType: string;
            data: string;
          };
        }
    > = [];

    for (
      const [
        documentIndex,
        document,
      ] of documents.entries()
    ) {
      const path =
        storagePath(document);

      console.log(
        "[generate-street-history] Baixando PDF:",
        {
          index:
            documentIndex + 1,
          path,
          title:
            document.title ||
            document.original_name ||
            "PDF sem título",
        },
      );

      const {
        data: blob,
        error: downloadError,
      } = await admin.storage
        .from(BUCKET)
        .download(path);

      if (
        downloadError ||
        !blob
      ) {
        console.error(
          "[generate-street-history] Download PDF:",
          {
            path,
            error:
              downloadError,
          },
        );

        throw new Error(
          `Não foi possível ler ${
            document.title ||
            document.original_name ||
            "um dos PDFs"
          }.`,
        );
      }

      if (
        blob.size <= 0
      ) {
        throw new Error(
          `O arquivo ${
            document.title ||
            document.original_name ||
            "PDF"
          } está vazio.`,
        );
      }

      totalBytes += blob.size;

      if (
        totalBytes >
        MAX_TOTAL_BYTES
      ) {
        throw new Error(
          "Os PDFs somados ultrapassam o limite de 14 MB para geração. Reduza os arquivos e tente novamente.",
        );
      }

      documentParts.push({
        text:
          `Documento ${
            documentIndex + 1
          }: ${
            document.title ||
            document.original_name ||
            "PDF sem título"
          }${
            document.description
              ? ` — ${document.description}`
              : ""
          }`,
      });

      const arrayBuffer =
        await blob.arrayBuffer();

      documentParts.push({
        inlineData: {
          mimeType:
            "application/pdf",
          data:
            arrayBufferToBase64(
              arrayBuffer,
            ),
        },
      });
    }

    console.log(
      "[generate-street-history] PDFs preparados:",
      {
        documents:
          documents.length,
        totalBytes,
        model,
      },
    );

    /*
     * ============================================================
     * PROMPT
     * ============================================================
     */

    const prompt = `
Você é um pesquisador de história municipal.

Analise SOMENTE os PDFs fornecidos sobre a rua "${street.name}".

Produza um rascunho factual em português brasileiro para uma plataforma cívica.

REGRAS IMPORTANTES:

- Não use conhecimento externo.
- Não invente datas.
- Não invente cargos.
- Não invente parentescos.
- Não invente realizações.
- Não complete informações usando suposições.
- Se os documentos não trouxerem informação suficiente para um campo, devolva string vazia.
- Diferencie claramente o que a lei efetivamente informa do que aparece apenas na justificativa do projeto de lei.
- Caso haja divergências entre documentos, coloque a divergência em warnings.
- Caso alguma página esteja ilegível, informe em warnings.

Campos esperados:

honoree_name:
Nome completo da pessoa homenageada, apenas se comprovado pelos documentos.

biography:
Texto claro de 2 a 5 parágrafos sobre quem foi a pessoa e a razão da homenagem.

curiosities:
De 2 a 6 itens curtos, um por linha, somente com fatos relevantes presentes nos documentos.

sources:
Referências curtas indicando título ou número do documento e página correspondente.

warnings:
Dúvidas, divergências, páginas ilegíveis ou informações que precisam de conferência humana.

Não inclua referências dentro da biografia.

Retorne somente o JSON solicitado.
`.trim();

    /*
     * ============================================================
     * GEMINI API
     * ============================================================
     */

    const geminiUrl =
      `https://generativelanguage.googleapis.com/v1beta/models/${
        encodeURIComponent(
          model,
        )
      }:generateContent`;

    console.log(
      "[generate-street-history] Chamando Gemini:",
      {
        model,
        documents:
          documents.length,
        totalBytes,
      },
    );

    const response =
      await fetch(
        geminiUrl,
        {
          method: "POST",

          headers: {
            "Content-Type":
              "application/json",

            "x-goog-api-key":
              geminiKey,
          },

          body:
            JSON.stringify({
              contents: [
                {
                  role: "user",

                  parts: [
                    ...documentParts,

                    {
                      text: prompt,
                    },
                  ],
                },
              ],

              generationConfig: {
                temperature: 0.1,

                maxOutputTokens:
                  1800,

                responseMimeType:
                  "application/json",

                responseSchema: {
                  type: "OBJECT",

                  properties: {
                    honoree_name: {
                      type: "STRING",
                    },

                    biography: {
                      type: "STRING",
                    },

                    curiosities: {
                      type: "STRING",
                    },

                    sources: {
                      type: "ARRAY",

                      items: {
                        type:
                          "STRING",
                      },
                    },

                    warnings: {
                      type: "ARRAY",

                      items: {
                        type:
                          "STRING",
                      },
                    },
                  },

                  required: [
                    "honoree_name",
                    "biography",
                    "curiosities",
                    "sources",
                    "warnings",
                  ],
                },
              },
            }),
        },
      );

    /*
     * ============================================================
     * LER RESPOSTA COMO TEXTO PRIMEIRO
     *
     * Isso permite enxergar o erro real mesmo se o Google
     * devolver algo que não seja JSON.
     * ============================================================
     */

    const responseText =
      await response.text();

    let gemini: any =
      {};

    try {
      gemini =
        responseText
          ? JSON.parse(
              responseText,
            )
          : {};
    } catch {
      gemini = {
        raw:
          responseText,
      };
    }

    /*
     * ============================================================
     * ERROS DO GEMINI
     * ============================================================
     */

    if (!response.ok) {
      const providerStatus =
        gemini?.error
          ?.status ||
        `HTTP_${response.status}`;

      const providerMessage =
        gemini?.error
          ?.message ||
        gemini?.raw ||
        responseText ||
        "Erro desconhecido retornado pelo Gemini.";

      const errorDetails =
        gemini?.error
          ?.details ||
        null;

      console.error(
        "[generate-street-history] Gemini error:",
        {
          httpStatus:
            response.status,
          providerStatus,
          providerMessage,
          errorDetails,
          model,
          documentCount:
            documents.length,
          totalBytes,
        },
      );

      /*
       * Limite / quota
       */

      if (
        response.status ===
        429
      ) {
        throw new Error(
          `Gemini 429 (${providerStatus}): limite de uso atingido. ${providerMessage}`,
        );
      }

      /*
       * Chave ou permissão
       */

      if (
        response.status ===
          401 ||
        response.status ===
          403
      ) {
        throw new Error(
          `Gemini ${response.status} (${providerStatus}): problema de autenticação ou permissão da API. ${providerMessage}`,
        );
      }

      /*
       * Payload inválido
       */

      if (
        response.status ===
        400
      ) {
        throw new Error(
          `Gemini 400 (${providerStatus}): requisição inválida. ${providerMessage}`,
        );
      }

      /*
       * Modelo inexistente
       */

      if (
        response.status ===
        404
      ) {
        throw new Error(
          `Gemini 404 (${providerStatus}): modelo "${model}" não encontrado ou indisponível. ${providerMessage}`,
        );
      }

      /*
       * Arquivo/payload muito grande
       */

      if (
        response.status ===
        413
      ) {
        throw new Error(
          `Gemini 413 (${providerStatus}): os documentos enviados são grandes demais. ${providerMessage}`,
        );
      }

      /*
       * Instabilidade
       */

      if (
        response.status >=
        500
      ) {
        throw new Error(
          `Gemini ${response.status} (${providerStatus}): serviço temporariamente indisponível. ${providerMessage}`,
        );
      }

      /*
       * Qualquer outro erro
       */

      throw new Error(
        `Gemini ${response.status} (${providerStatus}): ${providerMessage}`,
      );
    }

    /*
     * ============================================================
     * VALIDAR RESPOSTA
     * ============================================================
     */

    const candidate =
      gemini?.candidates?.[0];

    /*
     * Verifica bloqueio ou motivo de parada
     */

    if (!candidate) {
      console.error(
        "[generate-street-history] Gemini sem candidate:",
        gemini,
      );

      const blockReason =
        gemini
          ?.promptFeedback
          ?.blockReason;

      if (blockReason) {
        throw new Error(
          `O Gemini bloqueou a análise. Motivo: ${blockReason}.`,
        );
      }

      throw new Error(
        "O Gemini não retornou nenhuma resposta válida.",
      );
    }

    const finishReason =
      candidate
        ?.finishReason;

    console.log(
      "[generate-street-history] Gemini response:",
      {
        finishReason,
        promptTokens:
          gemini
            ?.usageMetadata
            ?.promptTokenCount ??
          null,

        outputTokens:
          gemini
            ?.usageMetadata
            ?.candidatesTokenCount ??
          null,

        totalTokens:
          gemini
            ?.usageMetadata
            ?.totalTokenCount ??
          null,
      },
    );

    /*
     * Localizar parte textual
     */

    const rawText =
      candidate
        ?.content
        ?.parts
        ?.find(
          (
            part: any,
          ) =>
            typeof part
              ?.text ===
            "string",
        )
        ?.text;

    if (!rawText) {
      console.error(
        "[generate-street-history] Resposta sem texto:",
        gemini,
      );

      throw new Error(
        `A IA não devolveu um rascunho válido${
          finishReason
            ? ` (finishReason: ${finishReason})`
            : ""
        }.`,
      );
    }

    /*
     * ============================================================
     * PARSE DO JSON
     * ============================================================
     */

    let result: any;

    try {
      result =
        JSON.parse(
          rawText,
        );
    } catch (
      parseError
    ) {
      console.error(
        "[generate-street-history] JSON inválido retornado:",
        {
          parseError,
          rawText:
            rawText.slice(
              0,
              2000,
            ),
        },
      );

      throw new Error(
        "O Gemini respondeu, mas o conteúdo retornado não pôde ser interpretado como JSON.",
      );
    }

    /*
     * ============================================================
     * SANITIZAÇÃO
     * ============================================================
     */

    const clean = {
      honoree_name:
        String(
          result
            ?.honoree_name ||
            "",
        ).trim(),

      biography:
        String(
          result
            ?.biography ||
            "",
        ).trim(),

      curiosities:
        String(
          result
            ?.curiosities ||
            "",
        ).trim(),

      sources:
        Array.isArray(
          result?.sources,
        )
          ? result.sources
              .map(
                (
                  item: unknown,
                ) =>
                  String(
                    item,
                  ).trim(),
              )
              .filter(Boolean)
              .slice(0, 12)
          : [],

      warnings:
        Array.isArray(
          result?.warnings,
        )
          ? result.warnings
              .map(
                (
                  item: unknown,
                ) =>
                  String(
                    item,
                  ).trim(),
              )
              .filter(Boolean)
              .slice(0, 12)
          : [],
    };

    /*
     * ============================================================
     * FINALIZAR LOG
     * ============================================================
     */

    const {
      error:
        completeLogError,
    } = await admin
      .from(
        "street_history_ai_generations",
      )
      .update({
        status:
          "completed",

        input_tokens:
          gemini
            ?.usageMetadata
            ?.promptTokenCount ??
          null,

        output_tokens:
          gemini
            ?.usageMetadata
            ?.candidatesTokenCount ??
          null,

        completed_at:
          new Date()
            .toISOString(),
      })
      .eq(
        "id",
        generationId,
      );

    if (
      completeLogError
    ) {
      console.error(
        "[generate-street-history] Não foi possível atualizar log como completed:",
        completeLogError,
      );
    }

    /*
     * ============================================================
     * RESPOSTA
     * ============================================================
     */

    return json({
      ...clean,

      model,

      document_count:
        documents.length,

      usage: {
        input_tokens:
          gemini
            ?.usageMetadata
            ?.promptTokenCount ??
          null,

        output_tokens:
          gemini
            ?.usageMetadata
            ?.candidatesTokenCount ??
          null,

        total_tokens:
          gemini
            ?.usageMetadata
            ?.totalTokenCount ??
          null,
      },
    });
  } catch (error) {
    const message =
      getErrorMessage(
        error,
      );

    console.error(
      "[generate-street-history]",
      {
        message,
        error,
        generationId,
      },
    );

    /*
     * ============================================================
     * MARCAR GERAÇÃO COMO FALHA
     * ============================================================
     */

    if (
      admin &&
      generationId
    ) {
      const {
        error:
          failureLogError,
      } = await admin
        .from(
          "street_history_ai_generations",
        )
        .update({
          status:
            "failed",

          error_code:
            message.slice(
              0,
              200,
            ),

          completed_at:
            new Date()
              .toISOString(),
        })
        .eq(
          "id",
          generationId,
        );

      if (
        failureLogError
      ) {
        console.error(
          "[generate-street-history] Não foi possível registrar falha:",
          failureLogError,
        );
      }
    }

    /*
     * ============================================================
     * RETORNAR ERRO REAL PARA O FRONT
     * ============================================================
     */

    return json(
      {
        error: message,
      },
      500,
    );
  }
});