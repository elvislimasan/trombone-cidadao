import { useEffect, useState } from 'react';
import { ChevronDown, List, RefreshCw } from 'lucide-react';

import { SITUACOES, formatarKm, percentual } from '@/lib/pavementLength';

const CORES = {
  paved: 'bg-success-fg',
  partially_paved: 'bg-status-pendingFg',
  unpaved: 'bg-brand',
};

export default function PavementMapLegend({ resumo, atualizadoEm, onRecarregar, embedded = false }) {
  const emKm = resumo.temTracado;
  const [compacta, setCompacta] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(max-width: 979px)').matches
      : false
  ));
  const [aberta, setAberta] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia('(max-width: 979px)');
    const aoMudar = (event) => setCompacta(event.matches);
    setCompacta(media.matches);
    if (media.addEventListener) {
      media.addEventListener('change', aoMudar);
      return () => media.removeEventListener('change', aoMudar);
    }
    media.addListener(aoMudar);
    return () => media.removeListener(aoMudar);
  }, []);

  if (embedded) {
    return (
      <section className="rounded-2xl border border-edge-default bg-surface-raised p-3.5 shadow-sm" aria-label="Legenda do mapa">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-content-primary">Legenda do mapa</h2>
            {atualizadoEm && <p className="mt-0.5 text-[9px] text-content-tertiary">Atualizado em {atualizadoEm}</p>}
          </div>
          <button
            type="button"
            onClick={onRecarregar}
            aria-label="Recarregar as ruas"
            className="shrink-0 rounded-lg border border-edge-subtle p-2 text-content-secondary transition-colors hover:bg-surface-subtle"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
        <ul className="grid gap-2 xs:grid-cols-2">
          {SITUACOES.map(({ id, rotulo }) => (
            <li key={id} className="flex items-center gap-2 rounded-lg bg-surface-subtle px-2.5 py-2">
              <span className={`h-0.5 w-4 shrink-0 rounded-full ${CORES[id]}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[11px] font-medium text-content-secondary">{rotulo}</span>
              <span className="shrink-0 text-[11px] font-extrabold text-content-primary tabular-nums">
                {emKm
                  ? `${formatarKm(resumo.porSituacao[id])} · ${percentual(resumo.porSituacao[id], resumo.metros)}%`
                  : `${resumo.ruasPorSituacao[id]}`}
              </span>
            </li>
          ))}
          {resumo.ruasSemTracado > 0 && (
            <li className="flex items-center gap-2 rounded-lg bg-surface-subtle px-2.5 py-2">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-content-tertiary" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[11px] font-medium text-content-secondary">Rua sem traçado</span>
              <span className="shrink-0 text-[11px] font-extrabold text-content-primary tabular-nums">{resumo.ruasSemTracado}</span>
            </li>
          )}
        </ul>
      </section>
    );
  }

  if (compacta && !aberta) {
    return (
      <button
        type="button"
        aria-expanded="false"
        onClick={() => setAberta(true)}
        className="absolute bottom-[calc(4.75rem+var(--safe-area-bottom,0px))] left-3 z-[700] inline-flex items-center gap-2 rounded-xl border border-edge-subtle bg-surface-overlay/95 px-3 py-2.5 text-xs font-bold text-content-primary shadow-lg backdrop-blur-sm"
      >
        <List className="h-4 w-4 text-brand" /> Legenda
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    );
  }

  if (!compacta) {
    return (
      <section
        aria-label="Legenda do mapa"
        className="absolute bottom-3 left-3 right-[8.5rem] z-[700] overflow-hidden rounded-xl border border-edge-default bg-surface-overlay/95 text-content-primary shadow-xl backdrop-blur-md min-[1440px]:right-3"
      >
        <div className="flex min-w-0 items-center gap-3 px-3 py-2.5">
          <h2 className="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-content-primary">Legenda</h2>
          <ul className="flex min-w-0 flex-1 items-center justify-between gap-2 overflow-hidden">
            {SITUACOES.map(({ id, rotulo }) => (
              <li key={id} className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                <span className={`h-0.5 w-4 shrink-0 rounded-full ${CORES[id]}`} aria-hidden="true" />
                <span className="truncate text-[10px] font-medium text-content-secondary">{rotulo}</span>
                <span className="shrink-0 text-[10px] font-extrabold text-content-primary tabular-nums">
                  {emKm
                    ? `${formatarKm(resumo.porSituacao[id])} · ${percentual(resumo.porSituacao[id], resumo.metros)}%`
                    : `${resumo.ruasPorSituacao[id]}`}
                </span>
              </li>
            ))}
            {resumo.ruasSemTracado > 0 && (
              <li className="flex min-w-0 items-center gap-1 whitespace-nowrap">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-content-tertiary" aria-hidden="true" />
                <span className="truncate text-[10px] font-medium text-content-secondary">Rua sem traçado</span>
                <span className="shrink-0 text-[10px] font-extrabold text-content-primary tabular-nums">
                  {resumo.ruasSemTracado}
                </span>
              </li>
            )}
          </ul>
          <button
            type="button"
            onClick={onRecarregar}
            aria-label={atualizadoEm ? `Recarregar as ruas. Atualizado em ${atualizadoEm}` : 'Recarregar as ruas'}
            title={atualizadoEm ? `Atualizado em ${atualizadoEm}` : 'Recarregar as ruas'}
            className="shrink-0 rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-subtle"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Legenda do mapa"
      className="absolute bottom-[calc(4.75rem+var(--safe-area-bottom,0px))] left-3 z-[700] w-[min(14rem,calc(100%-1.5rem))] overflow-hidden rounded-xl border border-edge-subtle bg-surface-overlay/95 text-content-primary shadow-lg backdrop-blur-sm sm:w-[15rem]"
    >
      <div className="p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-[9px] font-bold uppercase tracking-wider text-content-tertiary">Legenda</h2>
          <button
            type="button"
            aria-label="Recolher legenda"
            aria-expanded="true"
            onClick={() => setAberta(false)}
            className="-m-1 rounded-md p-1 text-content-secondary hover:bg-surface-subtle"
          >
            <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          </button>
        </div>
        <ul className="grid gap-1">
          {SITUACOES.map(({ id, rotulo }) => (
            <li key={id} className="flex items-baseline gap-2">
              <span className={`mt-1.5 h-0.5 w-4 shrink-0 rounded-full ${CORES[id]}`} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[10px] leading-snug text-content-secondary">{rotulo}</span>
              <span className="shrink-0 text-[10px] font-semibold text-content-secondary tabular-nums">
                {emKm
                  ? `${formatarKm(resumo.porSituacao[id])} · ${percentual(resumo.porSituacao[id], resumo.metros)}%`
                  : `${resumo.ruasPorSituacao[id]}`}
              </span>
            </li>
          ))}
          {resumo.ruasSemTracado > 0 && (
            <li className="flex items-baseline gap-2">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-content-tertiary" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[10px] leading-snug text-content-secondary">Rua sem traçado</span>
              <span className="shrink-0 text-[10px] font-semibold text-content-secondary tabular-nums">
                {resumo.ruasSemTracado}
              </span>
            </li>
          )}
        </ul>
      </div>

      {atualizadoEm && (
        <div className="flex items-center justify-between gap-2 border-t border-edge-subtle px-3 py-1.5">
          <p className="min-w-0 truncate text-[9px] text-content-tertiary">{atualizadoEm}</p>
          <button
            type="button"
            onClick={onRecarregar}
            aria-label="Recarregar as ruas"
            className="shrink-0 rounded-md p-1 text-content-secondary transition-colors hover:bg-surface-subtle"
          >
            <RefreshCw className="h-3 w-3" />
          </button>
        </div>
      )}
    </section>
  );
}
