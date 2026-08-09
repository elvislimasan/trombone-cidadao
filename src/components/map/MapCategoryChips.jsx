import React, { memo, useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import Icon, { categoryIconName, categoryPinToken } from '@/design-system/icons';

// Quantas categorias ficam na faixa antes de virar "Mais". Com 4 + Todas a
// faixa cabe inteira numa tela de 360px sem corte no meio de um chip.
const VISIBLE_COUNT = 5;

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

// Agrupa o excedente. Sem isso, com 9 categorias a faixa vira um scroll longo
// onde as ultimas nunca sao descobertas.
const MoreChip = memo(function MoreChip({ items, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const activeHere = items.some((c) => c.id === value);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('touchstart', handler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('touchstart', handler);
    };
  }, [open]);

  if (items.length === 0) return null;

  const activeLabel = items.find((c) => c.id === value)?.label;

  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 shadow-lg backdrop-blur-sm transition-colors ${
          activeHere
            ? 'border-primary bg-primary/15'
            : 'border-border bg-card/95 hover:border-primary/40'
        }`}
      >
        <span className="text-[11px] font-semibold text-foreground leading-none whitespace-nowrap">
          {activeLabel || 'Mais'}
        </span>
        <ChevronDown
          className={`w-3 h-3 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        // Abre para CIMA: a faixa fica no rodape do mapa, e um menu para baixo
        // sairia da viewport.
        <div className="absolute bottom-full right-0 mb-2 z-20 min-w-[168px] rounded-xl border border-border bg-popover shadow-xl overflow-hidden">
          {items.map((c) => {
            const isActive = value === c.id;
            const token = categoryPinToken(c.id);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { onChange(c.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2.5 text-left text-xs transition-colors hover:bg-muted ${
                  isActive ? 'font-semibold text-primary' : 'text-foreground'
                }`}
              >
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0"
                  style={{
                    background: `rgb(var(--pin-${token}-bg))`,
                    color: `rgb(var(--pin-${token}-fg))`,
                  }}
                >
                  <Icon name={categoryIconName(c.id)} size={12} strokeWidth={2} />
                </span>
                <span className="flex-1 truncate">{c.label}</span>
                {isActive && <Check className="w-3.5 h-3.5 flex-shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});

const MapCategoryChips = ({ categories, value, onChange }) => {
  // Quando a selecao esta no excedente, o proprio botao "Mais" passa a exibir o
  // rotulo dela (ver MoreChip) — o filtro em vigor nunca fica escondido atras
  // de um menu fechado.
  const head = categories.slice(0, VISIBLE_COUNT);
  const tail = categories.slice(VISIBLE_COUNT);

  return (
    <div className="flex-shrink-0 flex gap-2 overflow-x-auto pl-3 pb-1 custom-scrollbar">
      {head.map((c) => (
        <Chip
          key={c.id}
          id={c.id}
          label={c.label}
          active={value === c.id}
          onClick={onChange}
        />
      ))}
      <MoreChip items={tail} value={value} onChange={onChange} />
      {/* Espacador: o padding-right colapsa no fim da rolagem horizontal. */}
      <div className="flex-shrink-0 w-2" aria-hidden="true" />
    </div>
  );
};

export default memo(MapCategoryChips);
