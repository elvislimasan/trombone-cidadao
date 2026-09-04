import { useState } from 'react';
import { ChevronRight } from 'lucide-react';

import { formatarKm, percentual } from '@/lib/pavementLength';

// Resumo por bairro, no rodapé do mapa.
//
// É A MESMA PERGUNTA DO TOPO, FEITA ONDE A DECISÃO ACONTECE
//
// A faixa de cima responde "como está a cidade". Esta responde "onde está pior"
// — e é essa que vira ordem de serviço, porque obra se contrata por bairro, não
// por cidade.
//
// A barra é a fração PAVIMENTADA de cada bairro, e por isso é comparável entre
// eles: um bairro de 12 km e outro de 2 km aparecem lado a lado com barras que
// significam a mesma coisa. Mostrar a extensão absoluta faria o bairro grande
// parecer sempre pior.

/** Quantos bairros aparecem antes de "ver todos". Quatro cabem numa linha. */
const VISIVEIS = 4;

// UMA BARRA, E NÃO TRÊS FATIAS.
//
// A versão de três segmentos repetia em cor o que os três números logo abaixo
// já dizem em quilômetros — e, na largura de um cartão, as fatias pequenas
// viravam riscos de 2 px que não se lê. A barra única responde a única pergunta
// que se faz olhando de relance para um bairro: quanto dele já tem asfalto.
const Barra = ({ fracao }) => (
  <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken" aria-hidden="true">
    <div className="h-full rounded-full bg-success-fg transition-[width]" style={{ width: `${fracao}%` }} />
  </div>
);

// A DENSIDADE É O PONTO DESTE CARTÃO.
//
// Ele tinha texto de 14px, recheio de 14px e vãos generosos — e numa coluna de
// 18rem isso rende cinco bairros por tela. Com dezesseis, a pessoa passa a rolar
// para comparar dois que deveriam estar à vista ao mesmo tempo, e comparar é a
// única coisa que se faz com esta lista.
//
// Apertado, ele cabe o dobro. O nome continua sendo o maior elemento porque é
// por ele que se procura; o que encolheu foi o vão em volta.
const CartaoBairro = ({ bairro, emKm }) => {
  const pavimentado = emKm
    ? percentual(bairro.porSituacao.paved, bairro.metros)
    : percentual(bairro.ruasPorSituacao.paved, bairro.ruas);
  const valor = (situacao) => (emKm
    ? formatarKm(bairro.porSituacao[situacao])
    : `${bairro.ruasPorSituacao[situacao]}`);

  return (
    <div className="min-w-0 rounded-xl border border-edge-subtle bg-surface-raised px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-xs font-bold text-content-primary">{bairro.nome}</p>
        <span className="shrink-0 text-[11px] font-extrabold text-content-secondary tabular-nums">
          {pavimentado}%
        </span>
      </div>

      {emKm && <div className="mt-1.5"><Barra fracao={pavimentado} /></div>}

      <dl className="mt-1.5 grid grid-cols-3 gap-1">
        {[
          ['paved', 'Pavim.', 'text-success-fg'],
          ['unpaved', 'Sem pav.', 'text-brand'],
          ['partially_paved', 'Parcial.', 'text-status-pendingFg'],
        ].map(([id, rotulo, cor]) => (
          <div key={id} className="min-w-0">
            <dd className={`truncate text-[11px] font-bold leading-tight tabular-nums ${cor}`}>{valor(id)}</dd>
            <dt className="truncate text-[9px] leading-tight text-content-tertiary">{rotulo}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
};

export default function PavementBairros({ bairros, emKm, coluna = false }) {
  const [todos, setTodos] = useState(false);
  if (!bairros || bairros.length === 0) return null;

  const visiveis = coluna || todos ? bairros : bairros.slice(0, VISIVEIS);

  return (
    <section className="rounded-2xl border border-edge-subtle bg-surface-base p-3.5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className={coluna
          ? "text-[10px] font-bold uppercase tracking-wider text-content-tertiary"
          : "text-sm font-bold text-content-primary"}>
          Resumo por bairro
        </h2>
        {!coluna && bairros.length > VISIVEIS && (
          <button
            type="button"
            onClick={() => setTodos((v) => !v)}
            className="inline-flex items-center gap-1 text-xs font-bold text-brand"
          >
            {todos ? 'Ver menos' : `Ver todos os ${bairros.length} bairros`}
            <ChevronRight className={`h-3.5 w-3.5 transition-transform ${todos ? 'rotate-90' : ''}`} />
          </button>
        )}
      </div>

      {/* No celular rolam na horizontal. Empilhados, quatro cartões empurram o
          rodapé da página para longe — e o rodapé tem o relatório, que é o que
          quem chegou até aqui veio buscar. Da largura de `sm` em diante viram
          grade, onde cabem lado a lado sem rolagem. */}
      <div className={coluna
        ? 'grid gap-1.5'
        : '-mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 scrollbar-none sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4'}>
        {visiveis.map((bairro) => (
          <div key={bairro.id} className={coluna ? '' : 'w-[15rem] shrink-0 snap-start sm:w-auto'}>
            <CartaoBairro bairro={bairro} emKm={emKm} />
          </div>
        ))}
      </div>
    </section>
  );
}
