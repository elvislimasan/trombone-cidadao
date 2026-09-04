import { Navigation2, Flag } from 'lucide-react';

import { formatarDistancia } from '@/lib/patrolAlvo';

// A bússola do próximo sinal.
//
// PARA QUE ELA EXISTE
//
// Os sinais pendentes já eram pinos no mapa, e o card de ação já aparecia a
// 15 m. Entre uma coisa e outra não havia nada: quem patrulhava escolhia no
// olho para qual ponto ir, ou passava a 30 m de um sem perceber. Esta faixa é
// o meio do caminho — ela não age, só diz para onde e quanto falta.
//
// A SETA GIRA COM A PESSOA, NÃO COM O NORTE
//
// Zero é EM FRENTE, não é norte. Uma bússola de norte só serve com o aparelho
// na horizontal e alguém olhando para ela parada; quem está dirigindo precisa
// de "vira à direita", e é isso que o rumo relativo dá.
//
// Sem rumo do GPS — que é o que acontece parado — a seta some e fica só a
// distância. Uma seta apontando para o lugar errado é pior que nenhuma seta.

/**
 * @param {object|null} alvo        missão escolhida, com `distancia`
 * @param {number|null} rumo        graus relativos ao rumo da pessoa; null esconde a seta
 * @param {string|null} categoriaNome  nome legível da categoria do sinal
 */
export default function PatrolAlvoPointer({ alvo, rumo, categoriaNome = null }) {
  if (!alvo) return null;

  const distancia = formatarDistancia(alvo.distancia);
  const temSeta = Number.isFinite(rumo);

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl border border-edge-subtle bg-surface-overlay/95 px-3 py-2 shadow-lg backdrop-blur-sm pointer-events-auto"
      role="status"
      aria-live="off"
      aria-label={
        temSeta
          ? `Sinal mais próximo a ${distancia}, ${Math.abs(Math.round(rumo))} graus à ${rumo >= 0 ? 'direita' : 'esquerda'}`
          : `Sinal mais próximo a ${distancia}`
      }
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-subtleBg text-brand">
        {temSeta ? (
          // `transition` no transform: entre duas leituras de GPS a seta desliza
          // em vez de saltar. Salto lido de relance parece erro de aparelho.
          <Navigation2
            size={18}
            className="transition-transform duration-500"
            style={{ transform: `rotate(${rumo}deg)` }}
            aria-hidden="true"
          />
        ) : (
          <Flag size={16} aria-hidden="true" />
        )}
      </span>

      <span className="min-w-0">
        <span className="block text-[10px] font-bold uppercase leading-none tracking-wider text-content-tertiary">
          Sinal mais próximo
        </span>
        <span className="mt-0.5 block truncate text-sm font-extrabold leading-tight text-content-primary">
          {distancia}
          {categoriaNome && (
            <span className="ml-1.5 text-xs font-semibold text-content-secondary">{categoriaNome}</span>
          )}
        </span>
      </span>
    </div>
  );
}
