import { useRef, useCallback, useMemo } from 'react';

/**
 * Troca de aba por arrasto horizontal (esquerda/direita).
 *
 * Devolve handlers de Pointer Events para espalhar no container da lista.
 * Pointer Events cobrem toque, caneta e mouse com um so conjunto de eventos —
 * com touch* seria preciso duplicar tudo para o mouse.
 *
 * Regras que o gesto respeita:
 *
 * - So reage a arrasto predominantemente horizontal. Sem isso, rolar o feed
 *   verticalmente com o polegar em diagonal trocaria de aba sem querer, que e o
 *   jeito mais rapido de deixar o gesto irritante.
 * - Ignora o arrasto que comeca sobre um elemento marcado com
 *   [data-no-swipe]. O carrossel de midia do card tem o proprio arrasto
 *   horizontal; sem essa saida, os dois gestos disputariam o mesmo movimento.
 * - Nao circula do fim para o comeco: na primeira aba, arrastar para a direita
 *   nao faz nada. Circular desorienta — a barra de abas mostra posicao, e pular
 *   da ultima para a primeira contradiz o que se ve.
 */

// Distancia minima em px. Abaixo disso e toque tremido, nao arrasto.
const MIN_DISTANCE = 60;
// Quanto o movimento precisa ser mais horizontal que vertical.
const DIRECTION_RATIO = 1.5;

export function useSwipeTabs({ tabs, activeTab, onChange, enabled = true }) {
  const start = useRef(null);

  const activeIndex = useMemo(
    () => tabs.findIndex((t) => t.key === activeTab),
    [tabs, activeTab],
  );

  const onPointerDown = useCallback((e) => {
    // Mouse: so o botao principal. Em toque/caneta, button e 0 tambem.
    if (e.button !== 0) return;
    if (e.target?.closest?.('[data-no-swipe]')) {
      start.current = null;
      return;
    }
    start.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback((e) => {
    const from = start.current;
    start.current = null;
    if (!from || !enabled || activeIndex < 0) return;

    const dx = e.clientX - from.x;
    const dy = e.clientY - from.y;

    if (Math.abs(dx) < MIN_DISTANCE) return;
    if (Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO) return;

    // Arrastar para a esquerda avanca: o conteudo acompanha o dedo, como
    // virar a pagina de um livro.
    const forward = dx < 0;
    const nextIndex = forward ? activeIndex + 1 : activeIndex - 1;
    if (nextIndex < 0 || nextIndex >= tabs.length) return;

    onChange(tabs[nextIndex].key, forward ? 'forward' : 'back');
  }, [enabled, activeIndex, tabs, onChange]);

  // Cancelamento (chamada recebida, gesto do sistema) deve limpar o estado,
  // senao o proximo pointerup compara com uma origem velha.
  const onPointerCancel = useCallback(() => { start.current = null; }, []);

  return useMemo(
    () => ({ onPointerDown, onPointerUp, onPointerCancel }),
    [onPointerDown, onPointerUp, onPointerCancel],
  );
}

export default useSwipeTabs;
