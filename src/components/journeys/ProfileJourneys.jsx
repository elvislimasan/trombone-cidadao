import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Bell, ClipboardList, FileText, Sprout } from 'lucide-react';
import { useProfileJourneySummary } from '@/hooks/useProfileJourneySummary';

export default function ProfileJourneys({ cityId }) {
  const location = useLocation();
  const totals = useProfileJourneySummary(cityId);
  const contributions = new URLSearchParams(location.search);
  contributions.set('tab', 'reports');
  const city = cityId ? `&cidade=${encodeURIComponent(cityId)}` : '';
  const journeys = [
    { key: 'reports', to: '#minhas-contribuicoes', label: 'Minhas broncas', noun: ['bronca', 'broncas'], Icon: FileText },
    { key: 'following', to: '/seguindo?aba=novidades', label: 'Acompanhando', noun: ['item salvo', 'itens salvos'], Icon: Bell },
    { key: 'trees', to: `/arvores-da-comunidade?aba=minhas${city}`, label: 'Minhas árvores', noun: ['árvore', 'árvores'], Icon: Sprout },
    { key: 'requests', to: `/adoteumaarvore?aba=minhas${city}`, label: 'Meus pedidos', noun: ['pedido', 'pedidos'], Icon: ClipboardList },
  ];
  return <nav className="personal-journeys" aria-label="Minhas participações">
    {journeys.map(({ key, to, label, noun, Icon }) => {
      const total = totals[key];
      const quantity = typeof total === 'number' ? `${total.toLocaleString('pt-BR')} ${noun[total === 1 ? 0 : 1]}` : '—';
      const accessibleLabel = `${label}, ${quantity}`;
      const content = <><span className="personal-journey-icon"><Icon size={20} aria-hidden="true" /></span><span className="personal-journey-copy"><strong>{label}</strong><small className="personal-journey-count">{quantity}</small></span></>;
      return to.startsWith('#') ? <Link key={key} aria-label={accessibleLabel} to={{ pathname: location.pathname, search: `?${contributions}`, hash: to }} onClick={() => requestAnimationFrame(() => {
        const target = document.getElementById('minhas-contribuicoes');
        target?.focus({ preventScroll: true });
        target?.scrollIntoView({ block: 'start', behavior: 'auto' });
      })}>{content}</Link> : <Link key={key} aria-label={accessibleLabel} to={to}>{content}</Link>;
    })}
  </nav>;
}
