import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

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
    detectSessionInUrl: false, // Importante para apps nativos
  },
});