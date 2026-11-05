import React, { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Loader2, Megaphone, Route, ShieldCheck, UserPlus, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { Share } from '@capacitor/share';
import { useAuth } from '@/contexts/SupabaseAuthContext';
import { getAppInviteUrl } from '@/lib/shareUtils';

export default function FeedQuickActions({ onCreateReport }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [manualLink, setManualLink] = useState('');
  const inFlight = useRef(false);

  const invite = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true); setFeedback(''); setManualLink('');
    const url = getAppInviteUrl();
    const invitation = { title: 'Trombone Cidadão', text: 'Vamos cuidar da nossa cidade? Participe do Trombone Cidadão: registre problemas, acompanhe melhorias e descubra missões.', url };
    try {
      try {
        if (Capacitor.isNativePlatform()) {
          await Share.share(invitation);
          setFeedback('Compartilhado');
          return;
        }
        if (navigator.share) {
          await navigator.share(invitation);
          setFeedback('Compartilhado');
          return;
        }
      } catch (error) {
        if (/abort|cancel|dismiss/i.test(`${error?.name} ${error?.message}`)) return;
      }
      if (!navigator.clipboard?.writeText) throw new Error('clipboard-unavailable');
      await navigator.clipboard.writeText(url);
      setFeedback('Link copiado');
    } catch {
      setManualLink(url);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="feed-quick-actions" data-testid="feed-quick-actions">
      <nav className="feed-quick-grid" aria-label="Ações da comunidade">
        <button type="button" onClick={onCreateReport} className="feed-quick-card feed-quick-card-primary">
          <span className="feed-quick-icon"><Megaphone className="h-5 w-5" aria-hidden="true" /></span>
          <span className="feed-quick-title">Cadastrar sua bronca</span>
        </button>
        <Link to={user?.is_ambassador ? '/embaixador' : '/seja-embaixador'} className="feed-quick-card" title={user?.is_ambassador ? 'Acessar meu painel de embaixador' : 'Conhecer o programa de embaixadores'}>
          <span className="feed-quick-icon"><ShieldCheck className="h-5 w-5" aria-hidden="true" /></span>
          <span className="feed-quick-title">Painel do embaixador</span>
        </Link>
        <Link to="/missoes" className="feed-quick-card feed-quick-missions" aria-label="Patrulha e missões">
          <span className="feed-quick-icon"><Route className="h-5 w-5" aria-hidden="true" /></span>
          <span className="feed-quick-title">Patrulha e missões</span>
        </Link>
        <button type="button" onClick={invite} className="feed-quick-card" disabled={busy} aria-label="Convidar alguém para o Trombone" aria-busy={busy}>
          <span className="feed-quick-icon">{busy ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : feedback ? <Check className="h-5 w-5" aria-hidden="true" /> : <UserPlus className="h-5 w-5" aria-hidden="true" />}</span>
          <span className="feed-quick-title">{busy ? 'Preparando…' : feedback || 'Convidar'}</span>
        </button>
      </nav>
      <span role="status" className="sr-only">{feedback}</span>
      {manualLink && <div className="feed-invite-fallback">
        <div className="flex items-center justify-between gap-3"><p className="text-sm text-content-secondary" role="status">Copie o link para convidar:</p><button type="button" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label="Fechar link de convite" onClick={() => setManualLink('')}><X className="h-4 w-4" /></button></div>
        <input readOnly value={manualLink} aria-label="Link para convidar" onFocus={event => event.target.select()} className="min-h-12 w-full min-w-0 rounded-xl border border-edge-default bg-surface-base px-3 text-base text-content-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" />
      </div>}
    </div>
  );
}
