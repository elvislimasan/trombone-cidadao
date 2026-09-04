import { Check } from 'lucide-react';

import { getPatrolPickStep } from '@/lib/patrolPickFlow';

// A régua de passos da preparação.
//
// Ela mostra a trilha DESTA visita, não a trilha completa: quem chegou pelo
// atalho de uma missão vê dois passos, porque o foco já veio decidido e o passo
// dele não existe. Desenhar três e marcar um como concluído sugeriria que a
// pessoa passou por uma tela que nunca viu.

export default function PatrolStepper({ passos, atual }) {
  const indice = Math.max(0, passos.indexOf(atual));

  return (
    <nav aria-label="Progresso da preparação" className="mb-6">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-brand">
        Etapa {indice + 1} de {passos.length}
      </p>

      <ol className="mt-2.5 flex items-start gap-2">
        {passos.map((id, posicao) => {
          const passo = getPatrolPickStep(id);
          const concluido = posicao < indice;
          const ativo = posicao === indice;

          return (
            <li
              key={id}
              className="min-w-0 flex-1"
              aria-current={ativo ? 'step' : undefined}
            >
              <span
                className={`block h-1.5 rounded-full transition-colors duration-300 ${
                  concluido || ativo ? 'bg-brand' : 'bg-surface-subtle'
                }`}
              />
              <span
                className={`mt-1.5 flex items-center gap-1 text-[11px] font-bold leading-none ${
                  ativo
                    ? 'text-brand'
                    : concluido
                    ? 'text-content-secondary'
                    : 'text-content-tertiary'
                }`}
              >
                {concluido && <Check size={11} strokeWidth={3.2} aria-hidden="true" />}
                <span className="truncate">{passo.label}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
