import React, { memo, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
      className="flex-shrink-0 w-[134px] snap-start text-left rounded-xl overflow-hidden border border-border bg-card hover:border-primary/40 transition-colors"
    >
      <div className="relative h-[68px] bg-muted">
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
        {/* Sem line-clamp aqui: ele exige display:-webkit-box e o `flex` deste
            mesmo elemento sobrescreve esse display, entao o clamp nao aplicava
            e a linha crescia para fora do card - era o endereco cortado pela
            borda inferior. O truncate do <span> ja limita a uma linha. */}
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
          <MapPin size={10} className="flex-shrink-0 text-primary" />
          <span className="truncate">{report.address || report.categoryName || '—'}</span>
        </p>
      </div>
    </button>
  );
});

// Fracao da altura que o dedo precisa vencer para o painel trocar de estado.
const DRAG_RATIO = 0.35;
// Referencia de altura da faixa usada so para converter o arrasto em fracao.
const CARDS_H_FALLBACK = 150;
// Respiro abaixo dos cards na faixa rolavel (pb-3).
const CARDS_PADDING = 12;

const MapReportsCarousel = ({ clusters, total, loading, onSelect, onOpenList }) => {
  const [open, setOpen] = useState(true);
  // Deslocamento durante o arrasto. null = nao esta arrastando (o painel volta a
  // ser controlado pela transicao CSS).
  const [dragY, setDragY] = useState(null);
  const drag = useRef(null);

  const cardsRef = useRef(null);
  const [cardsH, setCardsH] = useState(CARDS_H_FALLBACK);

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

  // A altura do painel NAO depende mais desta medida - quem a define e o
  // conteudo, via CSS. cardsH serve so para converter o arrasto do dedo em
  // fracao de abertura. Se vier errada, o gesto fica menos preciso; o card nao
  // corta, que era o efeito grave da versao anterior.
  useLayoutEffect(() => {
    const card = cardsRef.current?.querySelector('button');
    if (!card) return;
    const h = card.offsetHeight;
    if (h > 40) setCardsH(h + CARDS_PADDING);
  }, [reports.length, loading]);

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

  const onPointerMove = useCallback(
    (e) => {
      const d = drag.current;
      if (!d) return;
      // Puxar para baixo fecha, para cima abre. Clamp para o painel nao sair da
      // faixa entre aberto (0) e recolhido (cardsH).
      const raw = e.clientY - d.y0;
      const base = d.open ? 0 : cardsH;
      const next = Math.min(cardsH, Math.max(0, base + raw));
      d.last = next;
      setDragY(next);
    },
    [cardsH]
  );

  const onPointerUp = useCallback(() => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;

    // O deslocamento vem do ref, nao de dentro de um updater do setDragY:
    // chamar setOpen la dentro e efeito colateral em funcao que o React pode
    // executar duas vezes (StrictMode), e a segunda passada revertia o estado -
    // o painel voltava a abrir sozinho ao soltar o dedo.
    const cur = d.last;
    if (cur != null) {
      // Encaixa no estado mais proximo, com histerese: partindo de aberto,
      // precisa puxar 35% para fechar (e vice-versa).
      const limite = d.open ? cardsH * DRAG_RATIO : cardsH * (1 - DRAG_RATIO);
      setOpen(cur < limite);
    }
    setDragY(null);
  }, [cardsH]);

  // Fracao da faixa de cards que continua visivel (1 = aberto, 0 = recolhido).
  const aberturaFaixa =
    dragY != null && cardsH > 0 ? 1 - dragY / cardsH : open ? 1 : 0;

  return (
    <div
      // Sem altura calculada: o painel se dimensiona pelo conteudo.
      //
      // A versao anterior media alca + cabecalho + faixa e aplicava o total como
      // height/flexBasis. Isso cortava o rodape do card ao entrar direto na tela
      // (sem passar por outra rolagem): a medicao acontecia antes do layout
      // estabilizar no dispositivo, o valor vinha baixo e ficava. Deixando o
      // fluxo normal definir a altura, nao ha o que medir errado - o painel
      // sempre cabe no que tem dentro.
      className="flex-shrink-0 bg-background border-t border-border touch-none"
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
        // grid-template-rows anima de 1fr (aberto) ate 0fr (recolhido) sem
        // ninguem precisar saber a altura em pixels - e o que permite o painel
        // recolher mantendo a altura vinda do conteudo.
        <div
          style={{
            display: 'grid',
            gridTemplateRows: `${aberturaFaixa}fr`,
            transition: dragY == null ? 'grid-template-rows 220ms ease' : 'none',
          }}
        >
          {/* data-cards: onPointerDown ignora arrastos daqui, senao rolar a
              lista na horizontal fecharia o painel. touch-pan-x devolve o
              scroll que o touch-none do container tirou.
              min-h-0 e obrigatorio: sem ele o filho do grid nao encolhe abaixo
              da altura do conteudo e o recolhimento nao acontece. */}
          <div
            ref={cardsRef}
            data-cards
            className="flex gap-2 overflow-x-auto overflow-y-hidden snap-x pl-4 pb-3 custom-scrollbar touch-pan-x min-h-0"
          >
            {reports.map((r) => (
              <Card key={r.id} report={r} onSelect={onSelect} />
            ))}
            {/* Espacador em vez de padding-right: em container flex com overflow
                o padding final colapsa, e o ultimo card encostava na borda. */}
            <div className="flex-shrink-0 w-3" aria-hidden="true" />
          </div>
        </div>
      )}
    </div>
  );
};

export default memo(MapReportsCarousel);
