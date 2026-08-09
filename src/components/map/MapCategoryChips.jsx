import React, { memo } from 'react';
import Icon, { categoryIconName, categoryPinToken } from '@/design-system/icons';

// Faixa horizontal de categorias. Usa os mesmos tokens --pin-* dos marcadores,
// entao o chip e o pin no mapa nunca divergem de cor.
//
// Formato pill: icone e rotulo lado a lado, numa linha so. A contagem saiu —
// os proprios pins no mapa ja mostram o volume, e o numero dobrava a altura da
// faixa sobre o mapa.
// Flutua sobre o mapa: cada chip precisa de fundo opaco e sombra propria, senao
// o texto compete com as ruas do tile.
const Chip = memo(function Chip({ id, label, active, onClick }) {
  const token = categoryPinToken(id);
  // "Todas" nao tem cor propria: usaria a de 'outros' e passaria a impressao de
  // ser mais uma categoria. Fica neutro, com a marca indicando a selecao.
  const isAll = id === 'all';

  return (
    <button
      type="button"
      onClick={() => onClick(id)}
      aria-pressed={active}
      className={`flex-shrink-0 inline-flex items-center gap-1 rounded-full border pl-1 pr-2.5 py-1 shadow-lg backdrop-blur-sm transition-colors ${
        active
          ? 'border-primary bg-primary/15'
          : 'border-border bg-card/95 hover:border-primary/40'
      }`}
    >
      <span
        className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
        style={
          isAll
            ? undefined
            : {
                background: `rgb(var(--pin-${token}-bg))`,
                color: `rgb(var(--pin-${token}-fg))`,
              }
        }
      >
        {isAll ? (
          <span className="grid grid-cols-2 gap-0.5">
            {['pothole', 'lighting', 'sewage', 'cleaning'].map((t) => (
              <span
                key={t}
                className="w-[5px] h-[5px] rounded-[1px]"
                style={{ background: `rgb(var(--pin-${t}-bg))` }}
              />
            ))}
          </span>
        ) : (
          <Icon name={categoryIconName(id)} size={12} strokeWidth={2} />
        )}
      </span>
      <span className="text-[11px] font-semibold text-foreground leading-none whitespace-nowrap">
        {label}
      </span>
    </button>
  );
});

// Todas as categorias ficam na faixa, que ja rola na horizontal.
//
// Havia um botao "Mais" agrupando o excedente, mas ele nao acrescentava nada:
// a faixa e rolavel, entao as categorias escondidas ja estavam a um deslize de
// distancia - o menu so somava um toque e um estado a mais para chegar nelas.
const MapCategoryChips = ({ categories, value, onChange }) => (
  <div className="flex-shrink-0 flex gap-2 overflow-x-auto pl-3 pb-1 custom-scrollbar">
    {categories.map((c) => (
      <Chip
        key={c.id}
        id={c.id}
        label={c.label}
        active={value === c.id}
        onClick={onChange}
      />
    ))}
    {/* Espacador: o padding-right colapsa no fim da rolagem horizontal. */}
    <div className="flex-shrink-0 w-2" aria-hidden="true" />
  </div>
);

export default memo(MapCategoryChips);
