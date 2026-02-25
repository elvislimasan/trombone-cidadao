import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Verifica se está rodando em ambiente nativo (Android/iOS)
const isNative = Capacitor.isNativePlatform();

// Configurações otimizadas para realtime no app nativo
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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
    // Desabilitamos detectSessionInUrl para Web também, pois estamos lidando com a recuperação manualmente
    // no SupabaseAuthContext.jsx para evitar race conditions.
    detectSessionInUrl: false, 
  },
});