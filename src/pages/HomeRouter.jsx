import React, { useState, useEffect } from 'react';
import FeedPage from './FeedPage';
import HomeDesktop from './HomeDesktop';

// Breakpoint lg = 980px (mesma referência do tailwind.config e do lg:hidden do BottomNav)
const LG_BREAKPOINT = 980;

function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.innerWidth >= LG_BREAKPOINT
  );

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${LG_BREAKPOINT}px)`);
    const handler = (e) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return isDesktop;
}

// A home do desktop virou uma visão geral da cidade (HomeDesktop). A anterior,
// que era o feed com busca, filtros e mapa expansível, continua inteira em
// `/home-legado` — e o feed completo em `/broncas`, que é para onde os botões
// "Ver todas" desta página apontam.
export default function HomeRouter() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <HomeDesktop /> : <FeedPage />;
}
