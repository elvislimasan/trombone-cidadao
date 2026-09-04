import { useEffect, useState } from 'react';

// A largura a partir da qual uma tela de mapa passa a ter colunas.
//
// É o mesmo 1100px em que o mapa de pavimentação abre a coluna de filtros
// (`min-[1100px]:grid-cols-...`). Usar outro valor faria as telas de mapa
// trocarem de forma em pontos diferentes — que é justamente o contrário de
// padronizar.
//
// Abaixo disso o mapa ocupa a tela inteira com os controles flutuando por cima,
// que é o certo no celular: três colunas num aparelho estreito deixariam o mapa
// com 400px, menos útil que o mapa inteiro e os controles empilhados.
const LARGURA_DE_COLUNAS = 1100;

const CONSULTA = `(min-width: ${LARGURA_DE_COLUNAS}px)`;

/**
 * `true` quando a viewport comporta o layout de colunas das telas de mapa.
 *
 * O primeiro valor já vem certo — ler `matchMedia` dentro do `useState` evita o
 * quadro em que o desktop monta a versão de celular e troca em seguida, que num
 * mapa custa uma montagem inteira do Leaflet.
 */
export function useTelaLarga() {
  const [larga, setLarga] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(CONSULTA).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const mq = window.matchMedia(CONSULTA);
    const aoMudar = (e) => setLarga(e.matches);
    setLarga(mq.matches);
    // `addListener` é o caminho antigo; WebView velha de Android ainda cai
    // nele, e é justamente lá que este app roda.
    if (mq.addEventListener) {
      mq.addEventListener('change', aoMudar);
      return () => mq.removeEventListener('change', aoMudar);
    }
    mq.addListener(aoMudar);
    return () => mq.removeListener(aoMudar);
  }, []);

  return larga;
}

export default useTelaLarga;
