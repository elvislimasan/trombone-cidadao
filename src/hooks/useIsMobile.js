import { useEffect, useState } from 'react';

// Largura abaixo da qual a tela é tratada como celular.
//
// É o `md` do Tailwind (768px), o mesmo ponto em que os cartões destas telas
// trocam de layout — usar outro valor faria a lista mudar de forma num lugar e
// de comportamento em outro.
const MOBILE_MAX_WIDTH = 767;

const QUERY = `(max-width: ${MOBILE_MAX_WIDTH}px)`;

/**
 * `true` enquanto a viewport for de celular.
 *
 * Existe porque a paginação por botões (Anterior / Próxima) é de desktop: no
 * celular a fila se percorre rolando, e um par de botões no fim da tela obriga
 * a mirar num alvo pequeno a cada 8 itens. As telas com lista longa perguntam
 * isto para escolher entre rolar e paginar.
 *
 * O primeiro valor já vem certo — ler `matchMedia` durante o `useState` evita
 * o quadro em que o celular renderiza a versão de desktop e troca em seguida.
 */
export function useIsMobile() {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia(QUERY);
    const aoMudar = (e) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    // `addListener` é o caminho antigo; WebViews velhas de Android ainda caem
    // nele, e é justamente lá que este app roda.
    if (mq.addEventListener) {
      mq.addEventListener('change', aoMudar);
      return () => mq.removeEventListener('change', aoMudar);
    }
    mq.addListener(aoMudar);
    return () => mq.removeListener(aoMudar);
  }, []);

  return isMobile;
}

export default useIsMobile;
