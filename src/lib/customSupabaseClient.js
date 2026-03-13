import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verifica se está rodando em ambiente nativo (Android/iOS)
const isNative = Capacitor.isNativePlatform();

// Configurações otimizadas para realtime no app nativo
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    // Interceptor global de fetch para tratar erros de autenticação (401/403)
    // que ocorrem quando o token está expirado ou corrompido no storage local.
    fetch: async (url, options) => {
      try {
        const response = await fetch(url, options);
        
        // Se recebermos 401 (Unauthorized) ou 403 (Forbidden), e o request tiver um token de auth
        // Isso indica que o token salvo no storage local não é mais válido.
        if (response.status === 401) {
            const authHeader = options?.headers?.Authorization || "";
            // Se o request tinha um token de usuário (não a anon key) e falhou com 401
            if (authHeader && authHeader !== `Bearer ${supabaseAnonKey}`) {
               console.warn("Detected 401 error with auth token. The session might be invalid. Forcing logout to clear state.");
               // Não precisamos de await aqui, queremos apenas disparar a limpeza do storage local
               // para que o próximo refresh da página/app já venha limpo.
               // Evitamos chamar em requests de auth para não criar loops.
               if (!url.includes('/auth/v1/')) {
                  supabase.auth.signOut().catch(e => console.error("Error signing out after 401:", e));
               }
            }
         }
        
        return response;
      } catch (err) {
        // Se falhar o fetch (ex: offline), propagar o erro
        throw err;
      }
    }
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    // Configurações de reconexão para melhor funcionamento no app nativo
    heartbeatIntervalMs: 30000,
    reconnectAfterMs: (tries) => Math.min(tries * 1000, 30000),
  },
  // Configurações gerais do cliente
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: 'supabase-trombone-auth',
    storage: window.localStorage,
    // Desabilitamos detectSessionInUrl para Web também, pois estamos lidando com a recuperação manualmente
    // no SupabaseAuthContext.jsx para evitar race conditions.
    detectSessionInUrl: false, 
  },
});