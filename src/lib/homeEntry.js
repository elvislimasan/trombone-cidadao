// O app nativo abre diretamente no feed. Na web, a raiz é a Home pública para
// visitantes e encaminha usuários autenticados para o feed.
export const resolveHomeEntry = ({ isNative, loading, user }) => {
  if (isNative) return { type: 'feed' };
  if (loading) return { type: 'loading' };
  if (user) return { type: 'redirect', to: '/feed' };
  return { type: 'home' };
};

// Sem um destino explícito anterior ao login, abre diretamente o feed.
export const resolvePostAuthFallback = () => '/feed';
