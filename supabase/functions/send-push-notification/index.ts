import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.6";

const VAPID_PUBLIC_KEY = Deno.env.get("VAPID_PUBLIC_KEY");
const VAPID_PRIVATE_KEY = Deno.env.get("VAPID_PRIVATE_KEY");
const VAPID_EMAIL = Deno.env.get("VAPID_EMAIL") || "mailto:seu-email@exemplo.com";

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  console.error("VAPID keys não configuradas! Configure VAPID_PUBLIC_KEY e VAPID_PRIVATE_KEY nas variáveis de ambiente.");
}

// Configurar VAPID keys uma vez
webpush.setVapidDetails(
  VAPID_EMAIL,
  VAPID_PUBLIC_KEY || "",
  VAPID_PRIVATE_KEY || ""
);

// Enviar push notification usando Web Push Protocol
async function sendPushNotification(
  subscription,
  notification
) {
  try {
    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      throw new Error("VAPID keys não configuradas");
    }

    const endpoint = subscription.endpoint;
    const p256dh = subscription.keys?.p256dh;
    const auth = subscription.keys?.auth;

    if (!endpoint || !p256dh || !auth) {
      throw new Error("Subscription inválida: faltam campos obrigatórios");
    }

    // Criar payload da notificação
    const payload = JSON.stringify({
      title: notification.title,
      body: notification.body,
      icon: notification.icon || "/icons/icon-192x192.png",
      badge: notification.badge || "/icons/badge-72x72.png",
      data: {
        url: notification.url || "/",
        notificationId: notification.notificationId,
        type: notification.type,
      },
      tag: notification.notificationId || "default",
      vibrate: [100, 50, 100],
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
    const { notification, userId } = await req.json();

    if (!notification || !userId) {
      return new Response(
        JSON.stringify({ error: "Dados faltando: notification e userId são obrigatórios" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Criar cliente Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar subscriptions do usuário
    const { data: subscriptions, error: subError } = await supabase
      .from("push_subscriptions")
      .select("subscription")
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

    // Enviar notificação para todas as subscriptions do usuário
    const results = await Promise.allSettled(
      subscriptions.map((sub) =>
        sendPushNotification(sub.subscription, {
          title: notification.title || "Trombone Cidadão",
          body: notification.body || notification.message || "Nova notificação",
          icon: notification.icon,
          badge: notification.badge,
          url: notification.url,
          notificationId: notification.id,
          type: notification.type,
        })
      )
    );

    const successful = results.filter((r) => r.status === "fulfilled").length;
    const failed = results.filter((r) => r.status === "rejected").length;

    return new Response(
      JSON.stringify({
        message: "Notificações enviadas",
        sent: successful,
        failed: failed,
        total: subscriptions.length,
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

