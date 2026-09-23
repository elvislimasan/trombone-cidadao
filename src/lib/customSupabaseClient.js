import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { prepareSupabaseAuthStorage } from './supabaseSessionStorage';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const authStorage = window.localStorage;
const authStorageKey = prepareSupabaseAuthStorage({
  storage: authStorage,
  supabaseUrl,
});
let invalidSessionRecovery = null;

const authorizationHeader = (headers) => {
  try {
    return new Headers(headers || {}).get('authorization') || '';
  } catch {
    return headers?.Authorization || headers?.authorization || '';
  }
};

// Verifica se esta rodando em ambiente nativo (Android/iOS).
const isNative = Capacitor.isNativePlatform();

// Configuracoes otimizadas para realtime no app nativo.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  global: {
    // Trata tokens expirados, corrompidos ou pertencentes a outro projeto.
    fetch: async (url, options) => {
      try {
        const response = await fetch(url, options);
        const requestUrl = typeof url === 'string' ? url : url?.url || '';

        if (response.status === 401) {
          const authHeader = authorizationHeader(options?.headers);
          const hasRejectedUserToken = authHeader
            && authHeader !== `Bearer ${supabaseAnonKey}`;

          if (hasRejectedUserToken && !requestUrl.includes('/auth/v1/')) {
            console.warn('Invalid Supabase user session detected. Clearing local session.');

            // A limpeza local nao depende de o projeto remoto reconhecer o JWT
            // que acabou de rejeitar.
            if (!invalidSessionRecovery) {
              invalidSessionRecovery = supabase.auth
                .signOut({ scope: 'local' })
                .catch((error) => console.error('Error clearing invalid local session:', error))
                .finally(() => { invalidSessionRecovery = null; });
            }
            await invalidSessionRecovery;

            // Consultas publicas podem ser refeitas imediatamente com a chave
            // anonima. Isso evita tela vazia e dispensa um recarregamento manual.
            const method = String(options?.method || 'GET').toUpperCase();
            if ((method === 'GET' || method === 'HEAD') && requestUrl.includes('/rest/v1/')) {
              const retryHeaders = new Headers(options?.headers || {});
              retryHeaders.set('Authorization', `Bearer ${supabaseAnonKey}`);
              return fetch(url, { ...options, headers: retryHeaders });
            }
          }
        }

        return response;
      } catch (error) {
        // Falhas de rede continuam sendo entregues ao chamador.
        throw error;
      }
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    heartbeatIntervalMs: 30000,
    reconnectAfterMs: (tries) => Math.min(tries * 1000, 30000),
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: authStorageKey,
    storage: authStorage,
    // O callback e recuperado manualmente no SupabaseAuthContext.
    detectSessionInUrl: false,
  },
});
