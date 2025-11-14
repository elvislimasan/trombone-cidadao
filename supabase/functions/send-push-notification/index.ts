import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.6";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
// Normalizar VAPID_EMAIL para garantir que comece com mailto:
let rawVapidEmail = Deno.env.get("VAPID_EMAIL") || "mailto:seu-email@exemplo.com";
const VAPID_EMAIL = rawVapidEmail && !rawVapidEmail.startsWith("mailto:") 
  ? "mailto:" + rawVapidEmail 
  : rawVapidEmail;

// 🔥 FCM HTTP v1 API Configuration
// ⚠️ IMPORTANTE: O project_id deve corresponder ao token FCM
// O token FCM é gerado com base no project_id do google-services.json do app Android
// Se o google-services.json usa "trombone-cidadao-572b5", usar esse
// Se o google-services.json usa "trombone-cidadao", usar esse
// A variável de ambiente FIREBASE_PROJECT_ID tem PRIORIDADE sobre o Service Account JSON
const FIREBASE_PROJECT_ID = Deno.env.get("FIREBASE_PROJECT_ID") || "trombone-cidadao-572b5";
const FIREBASE_SERVICE_ACCOUNT = Deno.env.get("FIREBASE_SERVICE_ACCOUNT");
const FIREBASE_PRIVATE_KEY = Deno.env.get("FIREBASE_PRIVATE_KEY");
const FIREBASE_CLIENT_EMAIL = Deno.env.get("FIREBASE_CLIENT_EMAIL");

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("VAPID keys não configuradas! Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas variáveis de ambiente.");
}

// Configurar VAPID keys uma vez
webpush.setVapidDetails(
  VAPID_EMAIL,
  VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY || ""
);

// 🔥 Gerar OAuth 2.0 Access Token para FCM HTTP v1 API
async function getFCMAccessToken(): Promise<string> {
  try {
    let serviceAccount: any;

    // Se tiver Service Account completo como JSON string
    if (FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
      } catch (parseError) {
        console.error("[FCM] Erro ao fazer parse do FIREBASE_SERVICE_ACCOUNT:", parseError);
        throw new Error(`FIREBASE_SERVICE_ACCOUNT não é um JSON válido: ${parseError.message}`);
      }
      
      // Normalizar private_key: converter \n literal para quebra de linha real
      // O JSON pode vir com \\n (duas barras) ou \\\\n (quatro barras) dependendo de como foi copiado
      if (!serviceAccount.private_key) {
        console.error("[FCM] private_key não encontrada no JSON. Chaves disponíveis:", Object.keys(serviceAccount));
        throw new Error("FCM private_key não encontrada no FIREBASE_SERVICE_ACCOUNT. Verifique se o JSON contém o campo 'private_key'");
      }
      
      if (typeof serviceAccount.private_key !== 'string') {
        console.error("[FCM] private_key não é uma string. Tipo:", typeof serviceAccount.private_key);
        throw new Error("FCM private_key no FIREBASE_SERVICE_ACCOUNT não é uma string válida");
      }
      
      serviceAccount.private_key = serviceAccount.private_key
        .replace(/\\\\n/g, '\\n')  // Converter \\\\n para \\n primeiro
        .replace(/\\n/g, '\n')     // Converter \\n para \n (quebra de linha real)
        .replace(/\r\n/g, '\n')    // Converter \r\n para \n
        .replace(/\r/g, '\n');     // Converter \r para \n
      
      // Validar se client_email existe
      if (!serviceAccount.client_email) {
        console.error("[FCM] client_email não encontrada no JSON. Chaves disponíveis:", Object.keys(serviceAccount));
        throw new Error("FCM client_email não encontrada no FIREBASE_SERVICE_ACCOUNT. Verifique se o JSON contém o campo 'client_email'");
      }
      
      if (typeof serviceAccount.client_email !== 'string') {
        console.error("[FCM] client_email não é uma string. Tipo:", typeof serviceAccount.client_email);
        throw new Error("FCM client_email no FIREBASE_SERVICE_ACCOUNT não é uma string válida");
      }
      
      // Log do Service Account sendo usado
      console.log(`📧 [FCM] Client email: ${serviceAccount.client_email}`);
      console.log(`🏢 [FCM] Project ID do Service Account: ${serviceAccount.project_id || 'NÃO DEFINIDO'}`);
      console.log(`🏢 [FCM] Project ID da variável de ambiente: ${FIREBASE_PROJECT_ID || 'NÃO DEFINIDO'}`);
      
      // Verificar se o project_id do Service Account corresponde ao da variável de ambiente
      if (serviceAccount.project_id && FIREBASE_PROJECT_ID && serviceAccount.project_id !== FIREBASE_PROJECT_ID) {
        console.warn(`⚠️ [FCM] ATENÇÃO: Project ID do Service Account (${serviceAccount.project_id}) é diferente da variável de ambiente (${FIREBASE_PROJECT_ID})`);
        console.warn(`⚠️ [FCM] O código vai usar o project_id da variável de ambiente (${FIREBASE_PROJECT_ID}) para enviar notificações`);
        console.warn(`⚠️ [FCM] MAS o Service Account precisa ter permissões no projeto ${FIREBASE_PROJECT_ID}`);
      }
      
      // Usar project_id do JSON se disponível, senão usar variável de ambiente
      if (serviceAccount.project_id && !FIREBASE_PROJECT_ID) {
        // project_id já está no JSON, tudo OK
      }
    } else if (FIREBASE_PRIVATE_KEY && FIREBASE_CLIENT_EMAIL) {
      // Se tiver credenciais separadas
      // Validar se são strings válidas
      if (typeof FIREBASE_PRIVATE_KEY !== 'string' || !FIREBASE_PRIVATE_KEY.trim()) {
        throw new Error("FIREBASE_PRIVATE_KEY não está configurada ou é inválida");
      }
      
      if (typeof FIREBASE_CLIENT_EMAIL !== 'string' || !FIREBASE_CLIENT_EMAIL.trim()) {
        throw new Error("FIREBASE_CLIENT_EMAIL não está configurada ou é inválida");
      }
      
      // Normalizar private_key: converter \n literal para quebra de linha real
      let normalizedKey = FIREBASE_PRIVATE_KEY;
      
      // Se vier com \\n (escaped), converter para \n (quebra de linha real)
      if (normalizedKey.includes('\\n')) {
        normalizedKey = normalizedKey.replace(/\\n/g, '\n');
      }
      
      // Garantir que tem BEGIN e END markers
      if (!normalizedKey.includes('BEGIN PRIVATE KEY')) {
        // Se não tiver os markers, pode estar sem formatação
        // Tentar adicionar (mas geralmente já vem com)
        console.warn("Private key pode estar sem formatação adequada");
      }
      
      serviceAccount = {
        project_id: FIREBASE_PROJECT_ID,
        private_key: normalizedKey,
        client_email: FIREBASE_CLIENT_EMAIL,
      };
    } else {
      throw new Error("FCM credentials não configuradas. Configure FIREBASE_SERVICE_ACCOUNT ou FIREBASE_PRIVATE_KEY + FIREBASE_CLIENT_EMAIL");
    }

    // Criar JWT para OAuth 2.0
    const now = Math.floor(Date.now() / 1000);
    const header = {
      alg: "RS256",
      typ: "JWT",
    };

    // Validar se client_email existe
    if (!serviceAccount.client_email || typeof serviceAccount.client_email !== 'string') {
      throw new Error("FCM client_email não está configurada ou é inválida. Verifique FIREBASE_SERVICE_ACCOUNT ou FIREBASE_CLIENT_EMAIL");
    }
    
    const payload = {
      iss: serviceAccount.client_email,
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600, // 1 hora
      iat: now,
    };

    // Codificar JWT (simplificado - em produção use biblioteca adequada)
    const base64UrlEncode = (str: string) => {
      return btoa(str)
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
    };

    const encodedHeader = base64UrlEncode(JSON.stringify(header));
    const encodedPayload = base64UrlEncode(JSON.stringify(payload));
    const message = `${encodedHeader}.${encodedPayload}`;

    // Assinar JWT (usando Web Crypto API)
    const privateKeyPEM = serviceAccount.private_key;
    
    // Validar se private_key existe e é uma string
    if (!privateKeyPEM || typeof privateKeyPEM !== 'string') {
      throw new Error("FCM private_key não está configurada ou é inválida. Verifique FIREBASE_SERVICE_ACCOUNT ou FIREBASE_PRIVATE_KEY");
    }
    
    const keyData = privateKeyPEM
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s/g, '');
    
    const keyBuffer = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
    
    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      keyBuffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: "SHA-256",
      },
      false,
      ["sign"]
    );

    const signature = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(message)
    );

    const encodedSignature = base64UrlEncode(String.fromCharCode(...new Uint8Array(signature)));
    const jwt = `${message}.${encodedSignature}`;

    // Trocar JWT por Access Token
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: jwt,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erro ao obter access token: ${error}`);
    }

    const data = await response.json();
    return data.access_token;
  } catch (error) {
    console.error("Erro ao gerar FCM access token:", error);
    throw error;
  }
}

// 🔥 Enviar notificação via FCM HTTP v1 API
async function sendFCMNotification(
  fcmToken: string,
  notification: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    image?: string;
    url?: string;
    notificationId?: string;
    type?: string;
    vibrate?: number[];
    actions?: Array<{ action: string; title: string; icon?: string }>;
    requireInteraction?: boolean;
    sound?: string;
    silent?: boolean;
    color?: string;
  }
): Promise<{ success: boolean; error?: string; token?: string }> {
  try {
    // 🔥 IMPORTANTE: O project_id deve corresponder ao token FCM
    // Se o google-services.json usa "trombone-cidadao-572b5", usar esse
    // Se o google-services.json usa "trombone-cidadao", usar esse
    // O token FCM é gerado com base no project_id do google-services.json
    let projectId = null;
    
    // Prioridade 1: Variável de ambiente FIREBASE_PROJECT_ID (mais confiável)
    if (FIREBASE_PROJECT_ID) {
      projectId = FIREBASE_PROJECT_ID;
      console.log(`🏢 [FCM] Usando project_id da variável de ambiente: ${projectId}`);
    }
    
    // Prioridade 2: Service Account JSON (pode ser do projeto antigo ou novo)
    if (!projectId && FIREBASE_SERVICE_ACCOUNT) {
      try {
        const serviceAccount = JSON.parse(FIREBASE_SERVICE_ACCOUNT);
        if (serviceAccount.project_id) {
          projectId = serviceAccount.project_id;
          console.log(`🏢 [FCM] Usando project_id do Service Account: ${projectId}`);
          console.log(`⚠️ [FCM] ATENÇÃO: Verifique se este project_id corresponde ao google-services.json do app!`);
        }
      } catch (e) {
        console.warn("⚠️ [FCM] Não foi possível obter project_id do Service Account:", e.message);
      }
    }
    
    // Prioridade 3: Fallback para o projeto novo (que está no google-services.json)
    if (!projectId) {
      projectId = "trombone-cidadao-572b5";
      console.log(`🏢 [FCM] Usando project_id padrão (fallback): ${projectId}`);
    }
    
    if (!projectId) {
      throw new Error("FIREBASE_PROJECT_ID não configurado e não encontrado no Service Account JSON");
    }
    
    console.log(`🔍 [FCM] Project ID final: ${projectId}`);
    console.log(`🔍 [FCM] Token FCM (primeiros 20 chars): ${fcmToken.substring(0, 20)}...`);
    console.log(`🔍 [FCM] URL FCM: https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`);

    // Obter access token
    const accessToken = await getFCMAccessToken();

    // Construir mensagem FCM v1
    const message = {
      message: {
        token: fcmToken,
        notification: {
          title: notification.title,
          body: notification.body,
        },
          android: {
            priority: "high",
            notification: {
              icon: notification.icon || "logo",
              color: notification.color || "#4a2121",
              sound: notification.sound || "default",
              channel_id: "trombone_cidadao_notifications",
              // vibrate_timing_ms não existe na FCM v1 API
              // Use default_vibrate_timings ou remova para usar padrão do sistema
              // default_vibrate_timings: true,
            },
          },
        data: {
          url: notification.url || "/",
          notificationId: notification.notificationId || "",
          type: notification.type || "system",
          click_action: notification.url || "FLUTTER_NOTIFICATION_CLICK",
        },
      },
    };

    // Enviar via FCM HTTP v1 API
    const fcmUrl = `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`;
    console.log(`📨 [FCM] Enviando mensagem FCM para projeto: ${projectId}`);
    console.log(`📡 [FCM] Fazendo requisição para: ${fcmUrl}`);
    
    const response = await fetch(fcmUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(message),
      });

    console.log(`📡 [FCM] Resposta FCM: ${response.status} ${response.statusText}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`❌ [FCM] Erro FCM: ${errorText}`);
      console.error(`❌ [FCM] Status: ${response.status}`);
      console.error(`❌ [FCM] Project ID usado: ${projectId}`);
      console.error(`❌ [FCM] Token FCM (primeiros 30 chars): ${fcmToken.substring(0, 30)}...`);
      
      let errorData;
      try {
        errorData = JSON.parse(errorText);
        
        // Se for SenderId mismatch, dar dica mais clara
        if (errorData?.error?.details?.[0]?.errorCode === "SENDER_ID_MISMATCH") {
          console.error(`❌ [FCM] SENDER_ID_MISMATCH detectado!`);
          console.error(`❌ [FCM] O project_id usado (${projectId}) não corresponde ao token FCM`);
          console.error(`❌ [FCM] Verifique se o google-services.json do app Android usa o mesmo project_id`);
          console.error(`❌ [FCM] Verifique se a variável FIREBASE_PROJECT_ID no Supabase está correta`);
          console.error(`❌ [FCM] O google-services.json tem project_id: trombone-cidadao-572b5`);
          console.error(`❌ [FCM] Configure FIREBASE_PROJECT_ID=trombone-cidadao-572b5 no Supabase`);
        }
        
        // Se for erro de permissão, dar dica mais clara
        if (response.status === 403 && errorData?.error?.code === 403) {
          console.error(`❌ [FCM] ERRO DE PERMISSÃO detectado!`);
          console.error(`❌ [FCM] O Service Account não tem permissão para enviar mensagens FCM no projeto ${projectId}`);
          console.error(`❌ [FCM] Verifique se o Service Account tem a role "Firebase Cloud Messaging API Admin"`);
          console.error(`❌ [FCM] Verifique se o Service Account é do projeto correto (${projectId})`);
          console.error(`❌ [FCM] O client_email do Service Account deve terminar com @${projectId}.iam.gserviceaccount.com`);
          console.error(`❌ [FCM] Acesse: https://console.cloud.google.com/iam-admin/iam?project=${projectId}`);
          console.error(`❌ [FCM] Encontre o Service Account e adicione a role "Firebase Cloud Messaging API Admin"`);
        }
      } catch {
        errorData = { error: { message: errorText } };
      }
      
      // Detectar token inválido (UNREGISTERED)
      if (response.status === 404 && errorData?.error?.details?.[0]?.errorCode === "UNREGISTERED") {
        return { success: false, error: "token_unregistered", token: fcmToken };
      }
      
      // Detectar outros erros comuns de token inválido
      if (response.status === 400 || response.status === 404) {
        return { success: false, error: "token_invalid", token: fcmToken };
      }
      
      return { success: false, error: `FCM error: ${errorText}` };
    }

    return { success: true };
  } catch (error) {
    console.error("Erro ao enviar FCM notification:", error);
    return { success: false, error: error.message };
  }
}

// Enviar push notification usando Web Push Protocol ou FCM
async function sendPushNotification(
  subscription,
  notification: {
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    image?: string;
    url?: string;
    notificationId?: string;
    type?: string;
    vibrate?: number[];
    actions?: Array<{ action: string; title: string; icon?: string }>;
    requireInteraction?: boolean;
    sound?: string;
    silent?: boolean;
    color?: string;
  }
) {
  try {
    // 🔥 CAPACITOR/FCM: Verificar se é token FCM e usar FCM HTTP v1 API
    if (subscription.type === 'fcm' && subscription.token) {
      const result = await sendFCMNotification(subscription.token, notification);
      // Garantir que o token está incluído no resultado
      if (!result.success && !result.token) {
        result.token = subscription.token;
      }
      return result;
    }

    // 🔥 WEB PUSH: Usar Web Push Protocol (VAPID)
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error("VAPID keys não configuradas");
    }

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      throw new Error("Subscription inválida: faltam campos obrigatórios");
    }

    // Criar payload da notificação personalizado
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || "/logo.png",
      badge: notification.badge || "/logo.png",
      image: notification.image, // Imagem grande (opcional)
      data: {
        url: notification.url || "/",
        notificationId: notification.notificationId,
        type: notification.type,
      },
      tag: notification.notificationId || "default",
      vibrate: notification.vibrate || [100, 50, 100],
      actions: notification.actions || [],
      requireInteraction: notification.requireInteraction || false,
      sound: notification.sound, // Opcional
      silent: notification.silent || false,
      color: notification.color || "#4a2121", // Cor de fundo (rgb(74, 33, 33) em hexadecimal)
      timestamp: Date.now(),
    });

    // Enviar notificação usando web-push
    try {
      await webpush.sendNotification(
        {
          endpoint,
          keys: {
            p256dh,
            auth,
          },
        },
        payload
      );

      return { success: true };
    } catch (pushError) {
      // Se a subscription expirou ou é inválida, retornar erro específico
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        return { success: false, error: "subscription_expired" };
      }
      throw pushError;
    }
  } catch (error) {
    console.error("Erro ao enviar push notification:", error);
    return { success: false, error: error.message };
  }
}

serve(async (req) => {
  try {
    // Verificar método
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Método não permitido" }),
        { status: 405, headers: { "Content-Type": "application/json" } }
      );
    }

    // Obter dados do request
    const body = await req.json();
    let notification, userId;

    // Verificar se é formato de webhook (Database Webhooks)
    if (body.record && body.type === "INSERT") {
      // Formato padrão do Database Webhook
      notification = {
        id: body.record.id,
        user_id: body.record.user_id,
        type: body.record.type,
        message: body.record.message,
        report_id: body.record.report_id,
        work_id: body.record.work_id
      };
      userId = body.record.user_id;
    } else if (body.notification && body.userId) {
      // Formato customizado (Request Body customizado) ou chamada direta
      notification = body.notification;
      userId = body.userId;
    } else {
      console.error("[EDGE FUNCTION] Formato de dados inválido:", body);
      return new Response(
        JSON.stringify({ error: "Formato de dados inválido. Use {notification, userId} ou {record, type}" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!notification || !userId) {
      console.error("[EDGE FUNCTION] Dados faltando:", { notification: !!notification, userId: !!userId });
      return new Response(
        JSON.stringify({ error: "Dados faltando: notification e userId são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 🔥 Verificar preferências do usuário ANTES de buscar subscriptions
    const { data: userPrefs, error: prefError } = await supabase
      .from("user_preferences")
      .select("push_enabled, notification_preferences, notifications_enabled")
      .eq("user_id", userId)
      .single();

    if (prefError && prefError.code !== 'PGRST116') {
      console.error("[EDGE FUNCTION] Erro ao buscar preferências:", prefError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar preferências do usuário", details: prefError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verificar se notificações estão habilitadas
    if (!userPrefs || !userPrefs.notifications_enabled) {
      return new Response(
        JSON.stringify({ message: "Notificações desabilitadas pelo usuário", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verificar se push está habilitado
    if (!userPrefs.push_enabled) {
      return new Response(
        JSON.stringify({ message: "Push desabilitado pelo usuário", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verificar se o tipo de notificação está habilitado
    const notificationType = notification.type || 'system';
    
    // Parsear notification_preferences se for string JSON
    let notificationPrefs = {};
    try {
      if (typeof userPrefs.notification_preferences === 'string') {
        notificationPrefs = JSON.parse(userPrefs.notification_preferences);
      } else if (userPrefs.notification_preferences && typeof userPrefs.notification_preferences === 'object') {
        notificationPrefs = userPrefs.notification_preferences;
      } else {
        notificationPrefs = {};
      }
    } catch (parseError) {
      console.error(`[EDGE FUNCTION] Erro ao parsear notification_preferences:`, parseError);
      notificationPrefs = {};
    }
    
    // Verificar se o tipo está explicitamente desabilitado (false)
    // Se não estiver definido, assumir que está habilitado (padrão)
    if (notificationPrefs.hasOwnProperty(notificationType) && notificationPrefs[notificationType] === false) {
      return new Response(
        JSON.stringify({ 
          message: `Tipo de notificação '${notificationType}' desabilitado pelo usuário`, 
          sent: 0,
          notificationType,
          preferences: notificationPrefs
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Buscar subscriptions do usuário
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("subscription_details")
      .eq("user_id", userId);

    if (subError) {
      console.error("Erro ao buscar subscriptions:", subError);
      return new Response(
        JSON.stringify({ error: "Erro ao buscar subscriptions", details: subError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(
        JSON.stringify({ message: "Usuário não possui subscriptions", sent: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // 🔥 Separar subscriptions FCM e Web Push
    const fcmSubscriptions = subscriptions
      .map((sub) => sub.subscription_details)
      .filter((sub) => sub?.type === 'fcm' && sub?.token);

    const webSubscriptions = subscriptions
      .map((sub) => sub.subscription_details)
      .filter((sub) => {
        // Aceitar apenas Web Push subscriptions
        return sub?.endpoint && sub?.keys?.p256dh && sub?.keys?.auth;
      });

    // Personalizar notificação baseada no tipo
    const getNotificationIcon = (type: string) => {
      const icons: Record<string, string> = {
        'moderation_update': '/icons/status-icon.png',
        'status_update': '/icons/update-icon.png',
        'moderation_required': '/icons/moderation-icon.png',
        'resolution_submission': '/icons/resolution-icon.png',
        'work_update': '/icons/work-icon.png',
        'reports': '/icons/report-icon.png',
        'comments': '/icons/comment-icon.png',
        'system': '/logo.png'
      };
      return icons[type] || '/logo.png';
    };

    const getNotificationVibration = (type: string) => {
      const vibrations: Record<string, number[]> = {
        'moderation_required': [300, 100, 300, 100, 300], // Urgente
        'reports': [200, 100, 200], // Normal-alto
        'status_update': [100, 50, 100], // Normal
        'system': [100, 50, 100] // Normal
      };
      return vibrations[type] || [100, 50, 100];
    };

    const getNotificationActions = (type: string) => {
      if (type === 'resolution_submission') {
        return [
          { action: 'view', title: '👁️ Ver Resolução' },
          { action: 'approve', title: '✅ Aprovar' },
          { action: 'reject', title: '❌ Rejeitar' }
        ];
      }
      if (type === 'moderation_required') {
        return [
          { action: 'moderate', title: '🔧 Moderar' },
          { action: 'view', title: '👁️ Ver' }
        ];
      }
      return [
        { action: 'open', title: 'Abrir' },
        { action: 'close', title: 'Fechar' }
      ];
    };

    // Personalizar notificação
    const notificationData = {
      title: notification.title || "Trombone Cidadão",
      body: notification.body || notification.message || "Nova notificação",
      icon: notification.icon || getNotificationIcon(notification.type || 'system'),
      badge: notification.badge || '/logo.png',
      image: notification.image, // Imagem grande (opcional)
      url: notification.url,
      notificationId: notification.id,
      type: notification.type,
      vibrate: notification.vibrate || getNotificationVibration(notification.type || 'system'),
      actions: notification.actions || getNotificationActions(notification.type || 'system'),
      requireInteraction: notification.requireInteraction || (notification.type === 'moderation_required'),
      sound: notification.sound, // Opcional
      silent: notification.silent || false,
      color: notification.color || "#4a2121" // Cor de fundo rgb(74, 33, 33)
    };

    // Enviar notificações FCM (HTTP v1 API)
    const fcmResults = await Promise.allSettled(
      fcmSubscriptions.map((sub) =>
        sendPushNotification(sub, notificationData)
      )
    );

    // Enviar notificações Web Push (VAPID)
    const webResults = await Promise.allSettled(
      webSubscriptions.map((sub) =>
        sendPushNotification(sub, notificationData)
      )
    );

    // Combinar resultados
    const results = [...fcmResults, ...webResults];

    // 🔥 Remover tokens/subscriptions inválidos da base de dados
    const invalidTokens: string[] = [];
    const invalidSubscriptions: any[] = [];
    
    // Verificar erros FCM
    fcmResults.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.success === false) {
        const error = result.value.error;
        if (error === "token_unregistered" || error === "token_invalid") {
          const token = result.value.token || fcmSubscriptions[index]?.token;
          if (token) {
            invalidTokens.push(token);
            invalidSubscriptions.push(fcmSubscriptions[index]);
          }
        }
      }
    });
    
    // Verificar erros Web Push
    webResults.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value.success === false) {
        const error = result.value.error;
        if (error === "subscription_expired") {
          invalidSubscriptions.push(webSubscriptions[index]);
        }
      }
    });
    
    // Remover tokens/subscriptions inválidos
    if (invalidTokens.length > 0 || invalidSubscriptions.length > 0) {
      try {
        // Buscar todas as subscriptions do usuário novamente para obter os IDs
        const { data: allSubscriptions, error: fetchError } = await supabase
          .from("push_subscriptions")
          .select("id, subscription_details")
          .eq("user_id", userId);
        
        if (fetchError) {
          console.error(`[EDGE FUNCTION] Erro ao buscar subscriptions para limpeza:`, fetchError);
        } else {
          // Remover subscriptions FCM inválidas
          for (const token of invalidTokens) {
            const subscriptionToDelete = allSubscriptions?.find(
              (sub: any) => sub.subscription_details?.type === "fcm" && sub.subscription_details?.token === token
            );
            
            if (subscriptionToDelete) {
              const { error: deleteError } = await supabase
                .from("push_subscriptions")
                .delete()
                .eq("id", subscriptionToDelete.id);
              
              if (deleteError) {
                console.error(`[EDGE FUNCTION] Erro ao remover token inválido:`, deleteError);
              }
            }
          }
          
          // Remover subscriptions Web Push inválidas
          for (const invalidSub of invalidSubscriptions.filter(s => s?.endpoint)) {
            const subscriptionToDelete = allSubscriptions?.find(
              (sub: any) => sub.subscription_details?.endpoint === invalidSub.endpoint
            );
            
            if (subscriptionToDelete) {
              const { error: deleteError } = await supabase
                .from("push_subscriptions")
                .delete()
                .eq("id", subscriptionToDelete.id);
              
              if (deleteError) {
                console.error(`[EDGE FUNCTION] Erro ao remover subscription Web Push inválida:`, deleteError);
              }
            }
          }
        }
      } catch (cleanupError) {
        console.error(`[EDGE FUNCTION] Erro ao limpar subscriptions inválidas:`, cleanupError);
      }
    }

    const successful = results.filter((r) => 
      r.status === "fulfilled" && r.value.success === true
    ).length;
    const failed = results.filter((r) => 
      r.status === "rejected" || (r.status === "fulfilled" && r.value.success === false)
    ).length;

    return new Response(
      JSON.stringify({
        message: "Notificações enviadas",
        sent: successful,
        failed: failed,
        total: subscriptions.length,
        fcm_sent: fcmSubscriptions.length,
        web_sent: webSubscriptions.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Erro na Edge Function:", error);
    return new Response(
      JSON.stringify({ error: "Erro interno do servidor", details: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
