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

  if (typeof window === 'undefined') {
    return `${supabaseUrl}/functions/v1/share-petition?id=${id}`;
  }

  const origin = window.location.origin || '';
  if (origin.includes('localhost')) {
    return `${supabaseUrl}/functions/v1/share-petition?id=${id}`;
  }

  return `${getBaseAppUrl()}/share/abaixo-assinado/${id}`;
};

export const getReportShareUrl = (id) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

  if (typeof window === 'undefined') {
    if (supabaseUrl.includes('xxdletrjyjajtrmhwzev')) {
      return `https://trombone-cidadao.vercel.app/share/bronca/${id}`;
    }
    return `https://trombonecidadao.com.br/share/bronca/${id}`;
  }

  const origin = window.location.origin || '';
  if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
    if (supabaseUrl.includes('xxdletrjyjajtrmhwzev')) {
      return `https://trombone-cidadao.vercel.app/share/bronca/${id}`;
    }
    return `https://trombonecidadao.com.br/share/bronca/${id}`;
  }

  return `${origin}/share/bronca/${id}`;
};

