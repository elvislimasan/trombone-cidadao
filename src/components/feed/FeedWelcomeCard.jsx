import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown, MapPin, Megaphone } from 'lucide-react';
import { useAuth } from '@/contexts/SupabaseAuthContext';

export default function FeedWelcomeCard({ onCreateReport, cityName }) {
  const { user } = useAuth();
  return (
    <section className="rounded-2xl border border-edge-subtle bg-surface-raised p-4 sm:p-5" aria-labelledby="feed-welcome-title" data-testid="feed-welcome">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-content-secondary">{user?.name ? `Olá, ${user.name.trim().split(/\s+/)[0]}` : 'Bem-vindo ao Trombone'}</p>
          <h1 id="feed-welcome-title" className="mt-1 font-display text-xl font-extrabold tracking-tight text-content-primary sm:text-2xl">Sua cidade, sua voz.</h1>
        </div>
        <Link to="/mapa" className="flex min-h-12 max-w-[45%] items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-content-secondary hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand" aria-label={`Ver mapa de ${cityName || 'todas as cidades'}`}>
          <MapPin className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" /><span className="min-w-0 break-words leading-5">{cityName || 'Todas as cidades'}</span>
        </Link>
      </div>
      <p className="mt-2 text-sm leading-6 text-content-secondary">Veja o que acontece e participe do que importa.</p>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={onCreateReport} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-bold text-content-onBrand transition-colors hover:bg-brand-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 active:opacity-90">
          <Megaphone className="h-4 w-4" aria-hidden="true" />Registrar bronca
        </button>
        <Link to="/seguindo" className="inline-flex min-h-12 items-center justify-center rounded-xl px-2 py-3 text-sm font-semibold text-content-secondary transition-colors hover:bg-surface-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">Acompanhando</Link>
      </div>
      <details className="group mt-3 border-t border-edge-subtle pt-1">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-lg py-2 text-sm font-semibold text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">Primeira vez por aqui?<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary>
        <ol className="grid gap-3 pb-3 pt-1 sm:grid-cols-3">
          {['Escolha o problema.', 'Confirme onde acontece.', 'Envie e acompanhe o retorno.'].map((step, index) => <li key={step} className="flex items-start gap-2 text-sm leading-5 text-content-secondary"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-subtleBg text-xs font-bold text-brand">{index + 1}</span><span>{step}</span></li>)}
        </ol>
        <Link to="/explorar" className="mb-2 inline-flex min-h-12 items-center gap-2 text-sm font-semibold text-brand">Conhecer outras formas de participar<ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
      </details>
    </section>
  );
}
