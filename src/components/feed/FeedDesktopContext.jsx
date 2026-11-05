import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bookmark, Compass, Grid2X2, Home, Map, MapPin, Megaphone, Radio, ShieldCheck } from 'lucide-react';

const destinations = [
  { label: 'Início', to: '/feed', Icon: Home },
  { label: 'Explorar', to: '/explorar', Icon: Compass },
  { label: 'Mapa', to: '/mapa', Icon: Map },
  { label: 'Radar da cidade', to: '/agora', Icon: Radio },
  { label: 'Acompanhando', to: '/seguindo', Icon: Bookmark },
  { label: 'Todas as funções', to: '/explorar?todas=1', Icon: Grid2X2 },
];

export function FeedDesktopNavigation({ user, onCreateReport }) {
  const workspace = user?.is_admin || user?.is_master ? '/admin' : user?.is_ambassador ? '/embaixador' : null;
  return (
    <aside className="feed-desktop-navigation" aria-label="Navegação da comunidade">
      <nav aria-label="Comunidade">
        <h2 className="feed-desktop-eyebrow">Comunidade</h2>
        <ul className="feed-desktop-links">
          {destinations.map(({ label, to, Icon }) => (
            <li key={to}><Link to={to} aria-current={to === '/feed' ? 'page' : undefined} className="feed-desktop-link"><Icon size={20} aria-hidden="true" /><span>{label}</span></Link></li>
          ))}
          {workspace && <li><Link to={workspace} className="feed-desktop-link"><ShieldCheck size={20} aria-hidden="true" /><span>Área de trabalho</span></Link></li>}
        </ul>
      </nav>
      <section className="feed-desktop-contribute">
        <span className="feed-desktop-context-icon"><Megaphone size={24} aria-hidden="true" /></span>
        <h2>Contribua com a cidade</h2>
        <p>Viu um problema no seu bairro? Registre uma bronca e acompanhe o resultado.</p>
        <button type="button" onClick={onCreateReport} className="feed-desktop-create"><Megaphone size={18} aria-hidden="true" />Fazer uma bronca</button>
      </section>
    </aside>
  );
}

export function FeedDesktopMap({ cityLabel }) {
  return (
    <section className="feed-desktop-map rounded-2xl border border-edge-subtle bg-surface-raised p-5 shadow-sm">
      <span className="feed-desktop-context-icon"><MapPin size={24} aria-hidden="true" /></span>
      <h2 className="mt-3 text-lg font-extrabold text-content-primary">Explore {cityLabel}</h2>
      <p className="mt-1 text-sm leading-5 text-content-secondary">Veja no mapa os relatos da comunidade.</p>
      <Link to="/mapa" className="feed-desktop-map-link" aria-label={`Abrir mapa de ${cityLabel}`}>
        {/* Ilustração de entrada; não representa ruas ou ocorrências reais. */}
        <svg className="feed-desktop-map-art" viewBox="0 0 320 130" fill="none" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
          <rect width="320" height="130" fill="currentColor" className="feed-map-ground" />
          <path d="M235 0H302L254 77H188Z" fill="currentColor" className="feed-map-park" />
          <g stroke="currentColor" className="feed-map-streets" strokeWidth="3">
            <path d="M-30 14L290 150M-10-14L320 127M30-20L350 116M-35 55L235 170M-35 88L160 170M45-15L-25 140M85-15L15 140M125-15L55 140M165-15L95 140M205-15L135 140M245-15L175 140M285-15L215 140M325-15L255 140" />
          </g>
          <path d="M320 94C278 62 252 123 207 115C168 107 138 123 120 145" stroke="currentColor" strokeWidth="16" className="feed-map-water" />
          <g fill="currentColor" className="feed-map-pins">
            {[{ x: 79, y: 73 }, { x: 144, y: 31 }, { x: 236, y: 58 }].map(({ x, y }) => <g key={x} transform={`translate(${x} ${y})`}><path d="M0 18S-10 7-10 0a10 10 0 1 1 20 0C10 7 0 18 0 18Z" /><circle r="3.5" fill="rgb(var(--surface-raised))" /></g>)}
          </g>
        </svg>
        <span className="feed-desktop-map-caption"><Map size={18} aria-hidden="true" /><span>Abrir mapa da cidade</span><ArrowRight size={18} aria-hidden="true" /></span>
      </Link>
    </section>
  );
}
