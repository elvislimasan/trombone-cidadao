import { Check, ChevronRight } from 'lucide-react';

import { CATEGORIAS_SINAL } from '@/lib/reportCategories';
import { getPatrolPickStep } from '@/lib/patrolPickFlow';

// Primeiro passo: o que a patrulha vai procurar.
//
// NÃO EXISTE "PATRULHA COMPLETA"
//
// Uma patrulha de tudo entregava alertas de categorias misturadas, e quem sai à
// noite para conferir postes não quer parar num buraco. Com uma categoria por
// vez, o corredor traz só o que interessa e o card sabe o que dizer.
//
// Esta é a PRIMEIRA pergunta porque é a decisão de verdade — o ritmo do passo
// seguinte é consequência dela: postes se conferem a pé, buracos se varrem de
// carro.

const CartaoPatrulha = ({
  icone,
  titulo,
  descricao,
  desabilitado,
  selecionado,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={desabilitado}
    role="radio"
    aria-checked={selecionado}
    className={`group w-full flex items-center gap-4 rounded-2xl px-4 py-4 text-left transition-[background-color,box-shadow,transform] duration-200 ${
      desabilitado
        ? 'bg-surface-subtle opacity-60 cursor-not-allowed ring-1 ring-edge-subtle/60'
        : selecionado
        ? 'bg-brand-subtleBg shadow-elevation-2 ring-2 ring-brand'
        : 'bg-surface-raised shadow-elevation-1 ring-1 ring-edge-subtle/70 hover:bg-surface-subtle active:scale-[0.99]'
    }`}
  >
    <span className={`shrink-0 w-12 h-12 rounded-xl flex items-center justify-center text-2xl transition-colors ${
      selecionado ? 'bg-brand text-content-onBrand' : 'bg-brand-subtleBg'
    }`}>
      {icone}
    </span>

    <span className="min-w-0 flex-1">
      <span className="block text-[15px] font-bold text-content-primary leading-tight">
        {titulo}
      </span>
      <span className="block text-xs text-content-secondary mt-0.5 leading-snug">
        {descricao}
      </span>
    </span>

    {!desabilitado && (
      <span className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-colors ${
        selecionado
          ? 'bg-brand text-content-onBrand'
          : 'text-content-tertiary group-hover:bg-surface-subtleHover'
      }`}>
        {selecionado ? <Check size={16} strokeWidth={3} /> : <ChevronRight size={19} />}
      </span>
    )}
  </button>
);

export default function PatrolFocusStep({ selecionada, onSelecionar }) {
  const passo = getPatrolPickStep('foco');

  return (
    <section aria-labelledby="patrol-category-title">
      <h2
        id="patrol-category-title"
        className="font-display text-2xl font-extrabold tracking-tight text-content-primary"
      >
        {passo.titulo}
      </h2>
      <p className="mt-1.5 mb-4 text-sm leading-relaxed text-content-secondary">
        {passo.descricao}
      </p>

      <div role="radiogroup" aria-label="Categoria da patrulha" className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
        {/* CATEGORIAS_SINAL é a lista sem "outros" — a mesma que a folha de
            sinalização usa, e pela mesma razão: uma patrulha de "outros" não
            conseguiria dizer o que procurar. */}
        {CATEGORIAS_SINAL.map((categoria) => {
          return (
            <CartaoPatrulha
              key={categoria.id}
              icone={categoria.icon}
              titulo={`Patrulha de ${categoria.name.toLowerCase()}`}
              descricao={
                categoria.id === 'iluminacao'
                  ? 'Encontre postes acesos de dia, apagados, sem braço ou com defeito'
                  : `Só as broncas de ${categoria.name.toLowerCase()}`
              }
              desabilitado={false}
              selecionado={selecionada === categoria.id}
              onClick={() => onSelecionar(categoria.id)}
            />
          );
        })}
      </div>
    </section>
  );
}
