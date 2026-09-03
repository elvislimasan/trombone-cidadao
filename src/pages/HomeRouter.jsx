import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import FeedPage from './FeedPage';
import HomeDesktop from './HomeDesktop';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { resolveHomeEntry } from '@/lib/homeEntry';

// Na web, a raiz é a Home para visitantes e encaminha quem entrou ao feed.
// No aplicativo nativo, a raiz continua sendo o próprio feed.
export default function HomeRouter() {
  const { user, loading } = useAuth();
  const destination = resolveHomeEntry({
    isNative: Capacitor.isNativePlatform(),
    loading,
    user,
  });

  // No nativo esta resposta continua acontecendo antes de `loading`: abrir o
  // app segue levando direto ao feed, seja qual for a sessão ou o modo de UI.
  if (destination.type === 'feed') return <FeedPage />;

  if (destination.type === 'loading') {
    return (
      <div className="flex min-h-[40vh] items-center justify-center" role="status" aria-label="Carregando">
        <Loader2 className="h-6 w-6 animate-spin text-brand" />
      </div>
    );
  }

  if (destination.type === 'redirect') return <Navigate to={destination.to} replace />;
  return <HomeDesktop />;
}
