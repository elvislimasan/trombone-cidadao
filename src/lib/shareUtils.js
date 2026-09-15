import { Capacitor } from '@capacitor/core';

const getConfiguredPublicUrl = () => {
  const configured = String(import.meta.env.VITE_APP_URL || '').trim().replace(/\/$/, '');
  if (configured && !configured.includes('localhost')) return configured;

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
  return supabaseUrl.includes('xxdletrjyjajtrmhwzev')
    ? 'https://trombone-cidadao.vercel.app'
    : 'https://trombonecidadao.com.br';
};

export const getBaseAppUrl = () => {
  // Capacitor serve o bundle Android/iOS por uma origem local. Essa origem só
  // existe dentro do WebView e nunca pode sair numa mensagem compartilhada.
  if (Capacitor.isNativePlatform()) return getConfiguredPublicUrl();

  if (typeof window !== 'undefined') {
    const origin = window.location.origin;
    if (origin.includes('localhost')) {
      return origin;
    }
    if (
      origin.includes('trombone-cidadao.vercel.app') ||
      origin.includes('vercel.app')
    ) {
      return origin;
    }
    if (origin.includes('trombonecidadao.com.br')) {
      return 'https://trombonecidadao.com.br';
    }
    return origin;
  }

  if (import.meta.env.VITE_APP_URL) {
    return import.meta.env.VITE_APP_URL;
  }

  return 'https://trombonecidadao.com.br';
};

export const getPetitionShareUrl = (id) => {
  const supabaseUrl =
    import.meta.env.VITE_SUPABASE_URL ||
    'https://xxdletrjyjajtrmhwzev.supabase.co';

  const prodUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev') 
    ? 'https://trombone-cidadao.vercel.app' 
    : 'https://trombonecidadao.com.br';

  return `${prodUrl}/share/abaixo-assinado/${id}`;
};

export const getReportShareUrl = (id) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  const prodUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev') 
    ? 'https://trombone-cidadao.vercel.app' 
    : 'https://trombonecidadao.com.br';

  return `${prodUrl}/share/bronca/${id}`;
};

export const getWorkShareUrl = (id) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  const prodUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev') 
    ? 'https://trombone-cidadao.vercel.app' 
    : 'https://trombonecidadao.com.br';

  return `${prodUrl}/share/obra/${id}`;
};

export const getPatrolShareUrl = (id) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  const prodUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev')
    ? 'https://trombone-cidadao.vercel.app'
    : 'https://trombonecidadao.com.br';

  return `${prodUrl}/share/patrulha/${id}`;
};

export const getNewsShareUrl = (id) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  // Sempre usar o domínio de produção para garantir que as meta tags (OG) funcionem
  // via redirecionamento da Edge Function do Supabase.
  const prodUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev') 
    ? 'https://trombone-cidadao.vercel.app' 
    : 'https://trombonecidadao.com.br';

  return `${prodUrl}/share/noticia/${id}`;
};

/** O endereco publico de um acontecimento do Radar, com previa social. */
export const getCityEventShareUrl = (event) => {
  const id = typeof event === 'object' ? event?.id : event;
  const updatedAt = typeof event === 'object' ? event?.updated_at : null;
  const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : '';
  return `${getBaseAppUrl()}/share/radar/${id}${version}`;
};

/**
 * O endereco publico da pagina de uma rua.
 *
 * Prefere o `slug` (`.../rua/rua-pastor-domicio-afonso-dos-santos`) e cai no id
 * quando ele ainda nao existe — rua recem-criada antes de a migracao 226 rodar,
 * ou rua cujo nome nao produz slug nenhum (so pontuacao). A pagina aceita os
 * dois, entao os dois links funcionam.
 */
export const getStreetShareUrl = (street) => {
  const key = street?.slug || street?.id || '';
  // WhatsApp mantem a previa por URL. Quando a foto ou a biografia muda, o
  // `updated_at` cria um endereco novo sem mudar o slug publico.
  const version = street?.updated_at ? `?v=${encodeURIComponent(street.updated_at)}` : '';
  return `${getBaseAppUrl()}/share/rua/${key}${version}`;
};

/** O caminho interno, para `<Link to>`. Mesma regra do endereco publico. */
export const streetPath = (street) =>
  `/mapa-pavimentacao/rua/${street?.slug || street?.id || ''}`;

/** O endereço público curto e canônico de um perfil cívico (/:username). */
export const getPublicProfileShareUrl = (username) => {
  const clean = String(username || '').trim().toLowerCase().replace(/^@/, '');
  return `${getBaseAppUrl()}/${encodeURIComponent(clean)}`;
};

/** URL com prévia social rica de uma página legislativa. */
export const getCouncilorShareUrl = (councilor) => {
  const cityId = councilor?.city_id || '';
  const slug = councilor?.slug || '';
  return `${getBaseAppUrl()}/share/vereador/${encodeURIComponent(cityId)}/${encodeURIComponent(slug)}`;
};
