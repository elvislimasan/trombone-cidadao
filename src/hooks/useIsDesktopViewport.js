import { useEffect, useState } from 'react';

export const DESKTOP_BREAKPOINT = 980;
const DESKTOP_QUERY = `(min-width: ${DESKTOP_BREAKPOINT}px)`;

// Compartilha exatamente o breakpoint `lg` configurado para o produto. Além
// do layout, algumas experiências de campo precisam saber se estão na web
// desktop antes de iniciar sensores ou esconder a navegação principal.
export function useIsDesktopViewport() {
  const [isDesktop, setIsDesktop] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(DESKTOP_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const media = window.matchMedia(DESKTOP_QUERY);
    const handleChange = (event) => setIsDesktop(event.matches);
    setIsDesktop(media.matches);

    if (media.addEventListener) {
      media.addEventListener('change', handleChange);
      return () => media.removeEventListener('change', handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, []);

  return isDesktop;
}

export default useIsDesktopViewport;
