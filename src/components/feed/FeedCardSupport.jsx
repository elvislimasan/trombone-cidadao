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
    <div className={`flex items-center gap-3 min-w-0 ${className}`}>
      <div className="min-w-0">
        <p className="text-2xs text-content-tertiary mb-1.5">Confirmações</p>
        <div className="flex items-center" aria-hidden="true">
          {Array.from({ length: stack }).map((_, i) => (
            <span
              key={i}
              className="w-8 h-8 rounded-full bg-surface-sunken border-2 border-surface-raised flex items-center justify-center text-content-tertiary -ml-2 first:ml-0"
            >
              <Icon name="profile" size={14} />
            </span>
          ))}
          {rest > 0 && (
            <span className="-ml-2 w-8 h-8 rounded-full border-2 border-surface-raised bg-surface-sunken text-content-secondary text-2xs font-bold flex items-center justify-center">
              +{rest}
            </span>
          )}
        </div>
      </div>

      <div className="text-center flex-shrink-0">
        <p className="text-2xl font-extrabold leading-none text-brand tabular-nums">
          {total}
        </p>
        <p className="text-2xs text-content-tertiary mt-0.5">
          {total === 1 ? 'apoio' : 'apoios'}
        </p>
      </div>
    </div>
  );
};

export default React.memo(FeedCardSupport);
