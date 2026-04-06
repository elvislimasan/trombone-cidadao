import React, { useState, useEffect } from 'react';
import FeedPage from './FeedPage';
import HomePageImproved from './HomePage-improved';

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

export default function HomeRouter() {
  const isDesktop = useIsDesktop();
  return isDesktop ? <HomePageImproved /> : <FeedPage />;
}
