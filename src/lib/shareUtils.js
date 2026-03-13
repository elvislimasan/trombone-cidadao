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

export const getNewsShareUrl = (id) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  // Sempre usar o domínio de produção para garantir que as meta tags (OG) funcionem
  // via redirecionamento da Edge Function do Supabase.
  const prodUrl = supabaseUrl.includes('xxdletrjyjajtrmhwzev') 
    ? 'https://trombone-cidadao.vercel.app' 
    : 'https://trombonecidadao.com.br';

  return `${prodUrl}/share/noticia/${id}`;
};
