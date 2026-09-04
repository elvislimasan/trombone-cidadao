import { useEffect, useState } from 'react';
import { Trophy, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

import { PONTOS_POR_ETAPA } from '@/lib/scoring';

const DURATION_MS = 4200;

/**
 * Recompensa visual de missão.
 *
 * É um banner de engajamento próprio, separado do sistema de toast. Ele fica
 * sempre no topo para não cobrir a navegação inferior nem as ações principais
 * de patrulha/conferência.
 */
export default function MissionProgressBanner({ progress, onClose }) {
  const [visible, setVisible] = useState(false);
  const [fraction, setFraction] = useState(0);
  const { pathname } = useLocation();
  const inSession =
    pathname.startsWith('/patrulhar') || pathname.startsWith('/conferir');

  useEffect(() => {
    if (!progress) return;

    const previousFraction =
      progress.alvo == null || progress.para === progress.de
        ? 1
        : Math.max(
            0,
            Math.min(
              1,
              progress.progresso - (progress.para - progress.de) / progress.alvo
            )
          );

    setFraction(previousFraction);
    setVisible(true);

    const nextFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => setFraction(progress.progresso));
    });
    const exitTimer = setTimeout(() => setVisible(false), DURATION_MS - 300);
    const closeTimer = setTimeout(onClose, DURATION_MS);

    return () => {
      cancelAnimationFrame(nextFrame);
      clearTimeout(exitTimer);
      clearTimeout(closeTimer);
    };
  }, [progress, onClose]);

  if (!progress) return null;

  const celebratesMilestone = progress.venceuEtapa;
  const Wrapper = inSession ? 'div' : Link;
  const wrapperProps = inSession
    ? { className: 'block px-4 py-3.5' }
    : { to: '/missoes', className: 'block px-4 py-3.5', onClick: onClose };

  return (
    <div
      className={`fixed inset-x-0 z-[2500] px-4 pointer-events-none ${
        inSession
          ? 'top-[calc(env(safe-area-inset-top,0px)+5.5rem)]'
          : 'top-[calc(env(safe-area-inset-top,0px)+4.75rem)]'
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        key={progress.chave}
        className={`mx-auto max-w-sm rounded-2xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          inSession ? 'pointer-events-none' : 'pointer-events-auto'
        } ${
          visible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-3'
        } ${
          celebratesMilestone
            ? 'bg-brand text-content-onBrand border-brand'
            : 'bg-surface-overlay border-edge-default'
        }`}
      >
        <Wrapper {...wrapperProps}>
          <div className="flex items-center gap-3">
            <span
              className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl ${
                celebratesMilestone ? 'bg-white/20' : 'bg-surface-subtle'
              }`}
            >
              {celebratesMilestone ? <Trophy size={20} /> : progress.icone}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  celebratesMilestone ? 'opacity-80' : 'text-content-tertiary'
                }`}
              >
                {/* O "de N" some depois dos degraus ESCRITOS: passado o último,
                    `etapa` continua subindo e `etapas` não, e a frase virava
                    "Etapa 5 de 4 vencida". O ramo de `completou` saiu junto —
                    com a escada infinita ele não tem mais como acontecer, e um
                    galho que nunca roda é uma promessa que a tela não cumpre. */}
                {progress.venceuEtapa
                  ? (progress.etapa - 1 >= progress.etapas
                      ? `Etapa ${progress.etapa - 1} vencida`
                      : `Etapa ${progress.etapa - 1} de ${progress.etapas} vencida`)
                  : 'Missão em andamento'}
              </p>
              <p
                className={`text-sm font-extrabold leading-tight truncate ${
                  celebratesMilestone ? '' : 'text-content-primary'
                }`}
              >
                {progress.titulo}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-base font-extrabold tabular-nums leading-none">
                {progress.rotulo}
              </p>
              {celebratesMilestone && (
                <p className="text-[11px] font-bold opacity-90 mt-1">
                  +{PONTOS_POR_ETAPA} pts
                </p>
              )}
            </div>

            {!inSession && (
              <ChevronRight
                size={16}
                className={`shrink-0 ${
                  celebratesMilestone ? 'opacity-70' : 'text-content-tertiary'
                }`}
              />
            )}
          </div>

          {progress.alvo != null && (
            <div
              className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${
                celebratesMilestone ? 'bg-white/25' : 'bg-surface-sunken'
              }`}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                  celebratesMilestone ? 'bg-white' : 'bg-brand'
                }`}
                style={{ width: `${fraction * 100}%` }}
              />
            </div>
          )}
        </Wrapper>
      </div>
    </div>
  );
}
