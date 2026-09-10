import { Link } from 'react-router-dom';
import { ChevronRight, Zap } from 'lucide-react';

import PatrolAvatar from '@/components/patrol/PatrolAvatar';
import { usePatrolAvatar } from '@/hooks/usePatrolAvatar';

/** Entrada principal da central: a patrulha de iluminacao publica. */
export default function LightingPatrolHero() {
  const avatar = usePatrolAvatar();
  const actionClass = 'mt-4 inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-surface-raised text-sm font-extrabold text-brand transition-transform active:scale-[0.98]';

  return (
    <section aria-labelledby="lighting-patrol-title">
      <div className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-brand to-brand-hover text-content-onBrand shadow-elevation-2">
        <div className="patrol-mode-grid absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="relative flex items-stretch gap-3 px-4 py-4">
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex items-start gap-2.5">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15 text-xl ring-1 ring-white/25" aria-hidden="true">💡</span>
              <div className="min-w-0 flex-1">
                <span className="inline-flex rounded-md bg-white/15 px-2 py-1 text-[10px] font-extrabold uppercase leading-none tracking-wider ring-1 ring-white/20">
                  Principal ferramenta da patrulha
                </span>
                <h2 id="lighting-patrol-title" className="mt-1.5 font-display text-xl font-extrabold leading-tight tracking-tight">
                  Patrulha da iluminação pública
                </h2>
                <p className="mt-1 text-xs leading-snug text-content-onBrand/85">
                  Registre postes acesos de dia, apagados, sem braço ou com defeito.
                </p>
              </div>
            </div>

            <p className="mt-3.5 flex items-center gap-1.5 text-xs font-bold text-content-onBrand/90">
              <Zap size={13} aria-hidden="true" /> Disponível de dia e à noite
            </p>

            <Link to="/patrulhar?categoria=iluminacao" className={actionClass}>
              Iniciar patrulha <ChevronRight size={15} />
            </Link>
          </div>

          <div className="relative w-[104px] shrink-0 self-stretch" aria-hidden="true">
            <div className="patrol-mode-journey patrol-mode-journey--palco">
              <PatrolAvatar
                modo="walking"
                avatar={avatar}
                camera="frente"
                emMovimento={false}
                sobreMarca
                tamanho={104}
                className="patrol-avatar-planted"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
