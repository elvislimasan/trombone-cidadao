import React from 'react';
import Icon from '@/design-system/icons';

// Linha de confirmacoes: avatares empilhados + contador de apoios.
//
// O useFeed traz apenas a CONTAGEM de apoios (signatures(count)), nao a lista de
// quem apoiou. Buscar os avatares reais custaria uma query por card — caro para
// um detalhe visual. Ate existir esse dado no feed, os circulos sao um indicador
// de volume, marcados como decorativos para leitores de tela; o numero ao lado e
// a informacao de verdade.
const STACK_MAX = 4;

const FeedCardSupport = ({ upvotes = 0, className = '' }) => {
  const total = Number(upvotes) || 0;
  if (total <= 0) return null;

  const stack = Math.min(total, STACK_MAX);
  const rest = total - stack;

  return (
    // items-end alinha avatares e contador pela base: com items-center o rotulo
    // "Confirmacoes" empurrava a fileira para baixo e o numero colidia com as
    // acoes ao lado em telas estreitas.
    <div className={`flex items-end gap-2 min-w-0 ${className}`}>
      <div className="min-w-0">
        <p className="text-2xs text-content-tertiary mb-1.5 truncate">Confirmações</p>
        <div className="flex items-center" aria-hidden="true">
          {/* Em tela estreita mostra menos avatares: cada um ocupa 24px uteis
              (32px com a sobreposicao de -8px). */}
          {Array.from({ length: stack }).map((_, i) => (
            <span
              key={i}
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-surface-sunken border-2 border-surface-raised flex items-center justify-center text-content-tertiary -ml-2 first:ml-0 ${
                i >= 2 ? 'hidden xs:flex' : ''
              }`}
            >
              <Icon name="profile" size={13} />
            </span>
          ))}
          {rest > 0 && (
            <span className="-ml-2 w-7 h-7 sm:w-8 sm:h-8 rounded-full border-2 border-surface-raised bg-surface-sunken text-content-secondary text-2xs font-bold flex items-center justify-center">
              +{rest}
            </span>
          )}
        </div>
      </div>

      <div className="text-center flex-shrink-0 leading-none">
        <p className="text-xl sm:text-2xl font-extrabold leading-none text-brand tabular-nums">
          {total}
        </p>
        <p className="text-2xs text-content-tertiary mt-1">
          {total === 1 ? 'apoio' : 'apoios'}
        </p>
      </div>
    </div>
  );
};

export default React.memo(FeedCardSupport);
