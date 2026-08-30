import { Route as Road, CheckCircle2, AlertTriangle, HelpCircle } from 'lucide-react';

import { SITUACOES, formatarKm, percentual } from '@/lib/pavementLength';

// A faixa de números do topo do mapa de pavimentação.
//
// A faixa combina duas leituras: a extensão total informa quanto do mapa possui
// traçado, enquanto os cartões de situação mostram a quantidade operacional de
// ruas. A leitura por quilômetro continua na legenda do mapa, onde ajuda a
// comparar a extensão ocupada por cada situação.

const CARTOES = [
  { id: 'paved', Icone: CheckCircle2, cor: 'text-success-fg', fundo: 'bg-success-bg' },
  { id: 'unpaved', Icone: AlertTriangle, cor: 'text-brand', fundo: 'bg-brand-subtleBg' },
  { id: 'partially_paved', Icone: Road, cor: 'text-status-pendingFg', fundo: 'bg-status-pendingBg' },
];

const Cartao = ({ Icone, cor, fundo, rotulo, valor, parte, onClick }) => {
  const Elemento = onClick ? "button" : "div";
  return (
  <Elemento
    {...(onClick ? { type: "button", onClick } : {})}
    className={`flex min-w-0 items-center gap-2 rounded-2xl border border-edge-subtle bg-surface-raised px-2.5 py-2.5 text-left xs:gap-3 xs:px-3.5 xs:py-3 ${onClick ? "transition-colors hover:border-brand/40 hover:bg-surface-subtle" : ""}`}
  >
    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl xs:h-9 xs:w-9 ${fundo} ${cor}`}>
      <Icone className="h-4 w-4 xs:h-[1.125rem] xs:w-[1.125rem]" />
    </span>
    <div className="min-w-0">
      <p className="truncate text-[9px] font-medium text-content-secondary xs:text-[11px]">{rotulo}</p>
      <p className="flex items-baseline gap-1 xs:gap-1.5">
        <span className="text-base font-extrabold leading-tight text-content-primary tabular-nums xs:text-lg">{valor}</span>
        {parte != null && (
          <span className={`text-[9px] font-bold xs:text-[11px] ${cor} tabular-nums`}>{parte}%</span>
        )}
      </p>
    </div>
  </Elemento>
  );
};

export default function PavementStats({ resumo, onSelecionar }) {
  const emKm = resumo.temTracado;
  const valorDe = (situacao) => {
    const quantidade = resumo.ruasPorSituacao[situacao];
    return `${quantidade} ${quantidade === 1 ? 'rua' : 'ruas'}`;
  };
  const parteDe = (situacao) => percentual(resumo.ruasPorSituacao[situacao], resumo.ruas);

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4 lg:gap-2.5">
      <Cartao
        Icone={Road}
        cor="text-content-secondary"
        fundo="bg-surface-subtle"
        rotulo={emKm ? 'Extensão mapeada' : 'Ruas mapeadas'}
        valor={emKm ? formatarKm(resumo.metros) : `${resumo.ruas}`}
      />
      {CARTOES.map(({ id, ...visual }) => (
        <Cartao
          key={id}
          {...visual}
          rotulo={SITUACOES.find((s) => s.id === id).rotulo}
          valor={valorDe(id)}
          parte={parteDe(id)}
          onClick={onSelecionar ? () => onSelecionar(id, SITUACOES.find((s) => s.id === id).rotulo) : null}
        />
      ))}
      {/* O cartão de "sem informação" só existe quando há o que informar. Um
          zero permanente ocuparia um quarto da faixa para não dizer nada. */}
      {resumo.ruasPorSituacao.unknown > 0 && (
        <Cartao
          Icone={HelpCircle}
          cor="text-content-tertiary"
          fundo="bg-surface-subtle"
          rotulo="Sem informação"
          valor={valorDe('unknown')}
          parte={parteDe('unknown')}
        />
      )}
    </div>
  );
}
