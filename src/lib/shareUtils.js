export const getBaseAppUrl = () => {
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

/** O endereco publico de um acontecimento do Trombone Agora. */
export const getCityEventShareUrl = (id) => `${getBaseAppUrl()}/agora/${id}`;

/**
 * O endereco publico da pagina de uma rua.
 *
 * Prefere o `slug` (`.../rua/rua-pastor-domicio-afonso-dos-santos`) e cai no id
 * quando ele ainda nao existe — rua recem-criada antes de a migracao 226 rodar,
 * ou rua cujo nome nao produz slug nenhum (so pontuacao). A pagina aceita os
 * dois, entao os dois links funcionam.
 */
export const getStreetShareUrl = (street) =>
  `${getBaseAppUrl()}/mapa-pavimentacao/rua/${street?.slug || street?.id || ''}`;

/** O caminho interno, para `<Link to>`. Mesma regra do endereco publico. */
export const streetPath = (street) =>
  `/mapa-pavimentacao/rua/${street?.slug || street?.id || ''}`;
