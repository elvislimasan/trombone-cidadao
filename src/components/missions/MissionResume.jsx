import { Link } from 'react-router-dom';
import { ChevronRight, Zap } from 'lucide-react';

// "Continue daqui": as missões mais perto de fechar.
//
// POR QUE ELAS SAEM DA LISTA E VÊM PARA CIMA
//
// A lista completa é ordenada por trilha, que é a ordem certa para explorar o
// catálogo — e a errada para voltar ao app. Quem abre a central pela terceira
// vez não quer escolher entre doze; quer terminar o que começou.
//
// O CRITÉRIO É "QUANTO FALTA", NÃO "QUANTO JÁ FIZ"
//
// Ordenar por progresso relativo colocaria em primeiro uma missão em 90% de uma
// etapa de 50 — noventa por cento de muito ainda é muito. O que decide é o
// número absoluto que falta: uma missão a um passo do fim vence uma a quinze,
// mesmo que a segunda esteja mais "avançada" em porcentagem.

const CartaoResumo = ({ missao }) => (
  <div className="shrink-0 w-full snap-center rounded-2xl border border-edge-subtle bg-surface-raised shadow-elevation-1 p-4">
    <div className="flex items-start gap-3">
      <span className="shrink-0 w-11 h-11 rounded-xl bg-surface-subtle ring-1 ring-edge-subtle flex items-center justify-center text-xl">
        {missao.icone}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <p className="text-[15px] font-extrabold text-content-primary leading-tight flex-1 min-w-0">
            {missao.titulo}
          </p>
          <span className="shrink-0 text-sm font-extrabold text-brand tabular-nums">
            {missao.rotulo}
          </span>
        </div>
        <p className="text-xs text-content-secondary mt-0.5 leading-snug">
          {missao.descricao}
        </p>
      </div>
    </div>

    {/* A porcentagem sai escrita ao lado da barra.
        A barra sozinha é uma sensação; o número é a medida. Juntos, quem olha
        de relance lê a barra e quem quer saber quanto falta lê o número — sem
        precisar estimar pelo comprimento. */}
    <div className="flex items-center gap-2.5 mt-3">
      <div className="flex-1 h-2 rounded-full bg-surface-sunken overflow-hidden">
        <div
          className="h-full rounded-full bg-status-progressFg transition-[width] duration-500"
          style={{ width: `${missao.progresso * 100}%` }}
        />
      </div>
      <span className="shrink-0 text-xs font-bold text-content-tertiary tabular-nums">
        {Math.round(missao.progresso * 100)}%
      </span>
    </div>

    <div className="flex items-center justify-between gap-2 mt-2.5">
      <span className="inline-flex items-center gap-1 text-xs font-bold text-brand tabular-nums">
        <Zap size={12} />
        +{missao.xpAteAEtapa} XP
      </span>
      <span
        className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
          missao.faltam === 1
            ? 'bg-success-bg text-success-fg'
            : 'bg-surface-subtle text-content-tertiary'
        }`}
      >
        {missao.faltam === 1 ? 'Só falta 1' : `Faltam ${missao.faltam}`}
      </span>
    </div>

    {missao.acao && (
      <Link
        to={missao.acao.para}
        className="mt-3.5 w-full h-11 inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand text-content-onBrand text-sm font-bold active:scale-[0.98] transition-transform"
      >
        Continuar missão
        <ChevronRight size={15} />
      </Link>
    )}
  </div>
);

export default function MissionResume({ missoes }) {
  if (!missoes || missoes.length === 0) return null;

  return (
    <section className="mt-6">
      <div className="mb-2.5">
        <h2 className="text-base font-extrabold text-content-primary tracking-tight leading-tight">
          Continue de onde parou
        </h2>
        <p className="text-[11px] text-content-secondary mt-0.5">
          Você está quase lá — finalize para ganhar mais XP
        </p>
      </div>

      {/* UM CARTÃO POR VEZ, LARGURA INTEIRA.
          A versão anterior mostrava dois estreitos lado a lado, e cada um
          precisava encolher título, descrição e botão para caber. O objetivo
          desta seção é uma coisa só — terminar a missão mais perto do fim —, e
          ela merece a largura da tela. As outras continuam a um deslize. */}
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 scrollbar-none">
        {missoes.map((m) => (
          <CartaoResumo key={m.id} missao={m} />
        ))}
      </div>
    </section>
  );
}
