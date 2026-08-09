import React, { memo, useCallback, useMemo, useRef, useState } from 'react';
import { MapPin } from 'lucide-react';
import Icon, { categoryIconName, categoryPinToken } from '@/design-system/icons';

// Preview das broncas visiveis no mapa. Roda sobre um mapa que ja e pesado,
// entao o componente e deliberadamente barato:
//
//  - nao busca nada: consome o que visibleClusters ja tem em memoria;
//  - corta em MAX_CARDS, porque a area pode ter 300+ broncas e montar tudo
//    trava o arrastar do mapa - ninguem rola 300 cards na horizontal;
//  - imagem com lazy/async, para o scroll nao baixar a lista inteira de uma vez;
//  - memo + key estavel por id, para arrastar o mapa nao remontar os cards que
//    continuam visiveis.
const MAX_CARDS = 20;

const STATUS_LABEL = {
  pending: 'Pendente',
  'in-progress': 'Agora',
  resolved: 'Resolvido',
  duplicate: 'Duplicada',
};

// Fundo escuro fixo com texto colorido, em vez de chip solido na cor do status.
// O badge fica sobre a capa - que, sem foto, e a cor da categoria - e um chip
// laranja sobre card laranja sumia. O fundo neutro funciona sobre qualquer capa,
// foto inclusive.
const BADGE_BASE =
  'absolute top-1.5 left-1.5 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide bg-black/75';

// Tons *-300 direto do primitivo, nao os --status-*: aqueles invertem entre
// temas (pastel no claro, quase-preto no escuro) e no escuro cairiam para ~1.1
// de contraste sobre este badge. Estes valem para os dois temas - no pior caso
// (badge sobre foto branca) ficam entre 5.75 e 7.38.
const STATUS_CLASS = {
  pending: 'text-[rgb(var(--tc-amber-300))]',
  'in-progress': 'text-[rgb(var(--tc-blue-300))]',
  resolved: 'text-[rgb(var(--tc-green-300))]',
  duplicate: 'text-[rgb(var(--tc-neutral-300))]',
};

const Card = memo(function Card({ report, onSelect }) {
  const token = categoryPinToken(report.category);
  const status = report.status || 'pending';

  return (
    <button
      type="button"
      onClick={() => onSelect(report)}
      className="flex-shrink-0 w-[150px] snap-start text-left rounded-xl overflow-hidden border border-border bg-card hover:border-primary/40 transition-colors"
    >
      <div className="relative h-[74px] bg-muted">
        {report.coverImage ? (
          <img
            src={report.coverImage}
            alt=""
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover"
          />
        ) : (
          // Sem foto: a cor da categoria preenche o espaco, mantendo o card
          // reconhecivel pela mesma linguagem visual do pin.
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `rgb(var(--pin-${token}-bg))` }}
          >
            <span style={{ color: `rgb(var(--pin-${token}-fg))` }}>
              <Icon name={categoryIconName(report.category)} size={26} strokeWidth={2} />
            </span>
          </div>
        )}
        <span className={`${BADGE_BASE} ${STATUS_CLASS[status] || STATUS_CLASS.pending}`}>
          {STATUS_LABEL[status] || STATUS_LABEL.pending}
        </span>
      </div>

      <div className="p-2">
        <p className="text-xs font-semibold text-foreground line-clamp-1">
          {report.title || 'Sem título'}
        </p>
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground line-clamp-1">
          <MapPin size={10} className="flex-shrink-0 text-primary" />
          <span className="truncate">{report.address || report.categoryName || '—'}</span>
        </p>
      </div>
    </button>
  );
});

// Altura da faixa de cards. Recolhido, o painel mostra so a alca e o cabecalho.
// Altura da faixa de cards: capa (74) + texto (~40) + respiro. Precisa
// acompanhar as medidas do Card - e o quanto o painel desliza ao recolher.
const CARDS_H = 124;
// Fracao da altura que o dedo precisa vencer para o painel trocar de estado.
const DRAG_RATIO = 0.35;

const MapReportsCarousel = ({ clusters, total, loading, onSelect, onOpenList }) => {
  const [open, setOpen] = useState(true);
  // Deslocamento durante o arrasto. null = nao esta arrastando (o painel volta a
  // ser controlado pela transicao CSS).
  const [dragY, setDragY] = useState(null);
  const drag = useRef(null);

  // So pins individuais viram card: cluster e uma agregacao, nao tem bronca.
  const reports = useMemo(() => {
    const out = [];
    for (const item of clusters || []) {
      if (item.isCluster || !item.report) continue;
      out.push(item.report);
      if (out.length >= MAX_CARDS) break;
    }
    return out;
  }, [clusters]);

  const onPointerDown = useCallback(
    (e) => {
      // Arrasto que comeca sobre os cards e scroll horizontal da lista, nao
      // gesto do painel - sem isso, rolar os cards fecharia o painel.
      if (e.target.closest('[data-cards]')) return;
      drag.current = { y0: e.clientY, open };
      e.currentTarget.setPointerCapture?.(e.pointerId);
    },
    [open]
  );

  const onPointerMove = useCallback((e) => {
    const d = drag.current;
    if (!d) return;
    // Puxar para baixo fecha, para cima abre. Clamp para o painel nao sair da
    // faixa entre aberto (0) e recolhido (CARDS_H).
    const raw = e.clientY - d.y0;
    const base = d.open ? 0 : CARDS_H;
    setDragY(Math.min(CARDS_H, Math.max(0, base + raw)));
  }, []);

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    setDragY((cur) => {
      if (cur != null) {
        // Encaixa no estado mais proximo, com histerese: partindo de aberto,
        // precisa puxar 35% para fechar (e vice-versa).
        const limite = d.open ? CARDS_H * DRAG_RATIO : CARDS_H * (1 - DRAG_RATIO);
        setOpen(cur < limite);
      }
      return null;
    });
  }, []);

  const shift = dragY != null ? dragY : open ? 0 : CARDS_H;

  return (
    <div
      className="flex-shrink-0 bg-background border-t border-border overflow-hidden touch-none"
      style={{
        height: CARDS_H + 52 - shift,
        transition: dragY == null ? 'height 220ms ease' : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {/* Alca: alvo do gesto e affordance de que o painel se move. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? 'Recolher lista de broncas' : 'Expandir lista de broncas'}
        className="w-full flex justify-center pt-2 pb-1 cursor-grab active:cursor-grabbing"
      >
        <span className="w-9 h-1 rounded-full bg-border" />
      </button>

      <div className="flex items-center justify-between px-4 pb-1.5">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            {loading ? (
              <span className="text-muted-foreground">Carregando…</span>
            ) : (
              `${total} ${total === 1 ? 'bronca visível' : 'broncas visíveis'}`
            )}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Mostrando problemas na área selecionada
          </p>
        </div>

        {onOpenList && (
          <button
            type="button"
            onClick={onOpenList}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:border-primary/40 transition-colors"
          >
            Lista
          </button>
        )}
      </div>

      {reports.length > 0 && (
        // data-cards: onPointerDown ignora arrastos daqui, senao rolar a lista
        // na horizontal fecharia o painel. touch-pan-x devolve o scroll que o
        // touch-none do container tirou.
        <div
          data-cards
          className="flex gap-2 overflow-x-auto snap-x px-4 pb-3 custom-scrollbar touch-pan-x"
        >
          {reports.map((r) => (
            <Card key={r.id} report={r} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
};

export default memo(MapReportsCarousel);
