import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Briefcase, ChevronDown, Map, Megaphone, Sprout } from 'lucide-react';
import CommunityScene from '@/components/feed/CommunityScene';

const paths = [
  { to: '/mapa', title: 'Explorar o mapa', description: 'Conheça seu entorno', icon: Map, tone: 'brand' },
  { to: '/explorar?jornada=cuidar', title: 'Cuidar de árvores', description: 'Um gesto que cresce', icon: Sprout, tone: 'green' },
  { to: '/guia-da-cidade', title: 'Serviços locais', description: 'Encontre o que precisa', icon: Briefcase, tone: 'amber' },
];

export default function FeedEmptyState({ tab = 'recent', cityName, onCreateReport, onChangeTab, showCreateAction = true }) {
  const recent = tab === 'recent' || !['nearby', 'trending', 'resolved'].includes(tab);
  const title = recent ? 'Sua cidade começa com você' : tab === 'nearby' ? 'Um olhar para o seu entorno' : tab === 'trending' ? 'Toda causa começa com uma voz' : 'Cada melhoria merece ser contada';
  const description = recent
    ? `Ainda não há broncas por aqui. Viu um problema${cityName ? ` em ${cityName}` : ' na sua cidade'}? Registre e ajude a dar o primeiro passo.`
    : tab === 'nearby' ? 'Nenhuma bronca encontrada num raio de 15 km. Você pode registrar um problema ou descobrir outras formas de participar.'
      : tab === 'trending' ? 'Ainda não há broncas em alta nos últimos 7 dias. Conheça os relatos recentes e apoie o que importa para você.'
        : 'Quando uma bronca for resolvida, a conquista terá espaço aqui. Enquanto isso, descubra como participar.';
  const showRecent = tab === 'trending' && onChangeTab;

  return (
    <div className="feed-empty" data-testid="feed-empty">
      <section className="feed-empty-story" aria-labelledby="feed-empty-title">
        <CommunityScene />
        <div className="feed-empty-copy">
          <p className="feed-empty-eyebrow">{recent ? 'Vamos construir essa história?' : 'Sua participação faz a diferença'}</p>
          <h2 id="feed-empty-title">{title}</h2>
          <p className="feed-empty-description">{description}</p>
          {(showRecent || (showCreateAction && tab !== 'resolved' && onCreateReport)) && (
            <button type="button" onClick={showRecent ? () => onChangeTab('recent') : onCreateReport} className="feed-primary-action feed-empty-primary">
              {showRecent ? <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" /> : <Megaphone className="h-5 w-5 shrink-0" aria-hidden="true" />}
              <span>{showRecent ? 'Ver broncas recentes' : 'Registrar bronca'}</span>
              <ArrowRight className="ml-auto h-4 w-4 shrink-0" aria-hidden="true" />
            </button>
          )}
        </div>
      </section>
      <section aria-labelledby="feed-other-paths-title" className="feed-other-paths">
        <h3 id="feed-other-paths-title">Há mais de um jeito de fazer parte</h3>
        <div className="feed-participation-links">
          {paths.map(({ to, title: label, description: detail, icon: Icon, tone }) => (
            <Link key={to} to={to} className="feed-participation-link">
              <span className={`feed-path-icon feed-path-${tone}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
              <span className="feed-path-label">{label}</span>
              <span className="feed-path-description">{detail}</span>
            </Link>
          ))}
        </div>
      </section>
      <details className="feed-empty-help group" data-testid="feed-help">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-2 rounded-xl text-sm font-medium text-content-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand [&::-webkit-details-marker]:hidden">Como registrar uma bronca<ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none" aria-hidden="true" /></summary>
        <ol className="grid gap-3 pb-3 pt-2 sm:grid-cols-3">
          {['Escolha o problema.', 'Confirme onde acontece.', 'Envie e acompanhe o retorno.'].map((step, index) => <li key={step} className="flex items-start gap-2 text-sm leading-5 text-content-secondary"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-subtleBg text-xs font-bold text-brand">{index + 1}</span><span>{step}</span></li>)}
        </ol>
      </details>
    </div>
  );
}
