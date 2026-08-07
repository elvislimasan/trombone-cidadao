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
    <div className={`flex items-center justify-between gap-3 ${className}`}>
      <div className="min-w-0">
        <p className="text-2xs text-content-tertiary mb-1">Confirmações</p>
        <div className="flex items-center" aria-hidden="true">
          {Array.from({ length: stack }).map((_, i) => (
            <span
              key={i}
              className="w-6 h-6 rounded-full bg-surface-sunken border-2 border-surface-raised flex items-center justify-center text-content-tertiary -ml-1.5 first:ml-0"
            >
              <Icon name="profile" size={12} />
            </span>
          ))}
          {rest > 0 && (
            <span className="ml-1 h-6 px-1.5 rounded-full bg-brand text-content-onBrand text-2xs font-bold flex items-center">
              +{rest}
            </span>
          )}
        </div>
      </div>

      <div className="text-right flex-shrink-0">
        <p className="text-lg font-bold leading-none text-brand tabular-nums">{total}</p>
        <p className="text-2xs text-content-tertiary">
          {total === 1 ? 'apoio' : 'apoios'}
        </p>
      </div>
    </div>
  );
};

export default React.memo(FeedCardSupport);
