import { useEffect, useState } from 'react';
import { Trophy, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { PONTOS_POR_ETAPA } from '@/lib/scoring';

// O aviso que sobe quando uma missão anda.
//
// A BARRA ANIMA DO ANTES PARA O DEPOIS
//
// Mostrar 2/3 já pintado não comunica nada: o número podia estar ali desde
// ontem. O que informa é o MOVIMENTO — a barra sair de onde estava e chegar
// onde chegou. Por isso ela é montada na fração anterior e só então recebe a
// atual, num segundo quadro.
//
// Some sozinho. Um aviso de progresso que exige toque para fechar cobra
// atenção de quem acabou de agir — e a ação seguinte é mais importante que a
// comemoração da anterior.
//
// Fica ABAIXO do topo e acima do rodapé, na faixa que nenhuma tela usa para
// ação: cobrir um botão logo depois de a pessoa tocar em outro é o jeito mais
// rápido de transformar recompensa em estorvo.

const DURACAO_MS = 4200;

export default function MissionProgressToast({ avanco, onFechar }) {
  const [entrou, setEntrou] = useState(false);
  const [fracao, setFracao] = useState(0);

  useEffect(() => {
    if (!avanco) return;

    // Fração de ONDE VEIO, para a barra ter de onde sair.
    const anterior =
      avanco.alvo == null || avanco.para === avanco.de
        ? 1
        : Math.max(0, Math.min(1, avanco.progresso - (avanco.para - avanco.de) / avanco.alvo));

    setFracao(anterior);
    setEntrou(true);

    const aoQuadroSeguinte = requestAnimationFrame(() => {
      requestAnimationFrame(() => setFracao(avanco.progresso));
    });

    const saida = setTimeout(() => setEntrou(false), DURACAO_MS - 300);
    const fim = setTimeout(onFechar, DURACAO_MS);

    return () => {
      cancelAnimationFrame(aoQuadroSeguinte);
      clearTimeout(saida);
      clearTimeout(fim);
    };
  }, [avanco, onFechar]);

  if (!avanco) return null;

  const celebra = avanco.venceuEtapa || avanco.completou;

  return (
    <div
      className="fixed inset-x-0 bottom-24 z-[2500] px-4 pointer-events-none"
      role="status"
      aria-live="polite"
    >
      <div
        key={avanco.chave}
        className={`mx-auto max-w-sm rounded-2xl border shadow-2xl overflow-hidden pointer-events-auto transition-all duration-300 ${
          entrou ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        } ${
          celebra
            ? 'bg-brand text-content-onBrand border-brand'
            : 'bg-surface-overlay border-edge-default'
        }`}
      >
        <Link to="/missoes" className="block px-4 py-3.5" onClick={onFechar}>
          <div className="flex items-center gap-3">
            <span
              className={`shrink-0 w-11 h-11 rounded-xl flex items-center justify-center text-xl ${
                celebra ? 'bg-white/20' : 'bg-surface-subtle'
              }`}
            >
              {celebra ? <Trophy size={20} /> : avanco.icone}
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={`text-[11px] font-bold uppercase tracking-wider ${
                  celebra ? 'opacity-80' : 'text-content-tertiary'
                }`}
              >
                {avanco.completou
                  ? 'Missão concluída'
                  : avanco.venceuEtapa
                  ? `Etapa ${avanco.etapa - 1} de ${avanco.etapas} vencida`
                  : 'Missão em andamento'}
              </p>
              <p
                className={`text-sm font-extrabold leading-tight truncate ${
                  celebra ? '' : 'text-content-primary'
                }`}
              >
                {avanco.titulo}
              </p>
            </div>

            <div className="shrink-0 text-right">
              <p className="text-base font-extrabold tabular-nums leading-none">
                {avanco.rotulo}
              </p>
              {celebra && (
                <p className="text-[11px] font-bold opacity-90 mt-1">
                  +{PONTOS_POR_ETAPA} pts
                </p>
              )}
            </div>

            <ChevronRight
              size={16}
              className={`shrink-0 ${celebra ? 'opacity-70' : 'text-content-tertiary'}`}
            />
          </div>

          {avanco.alvo != null && (
            <div
              className={`mt-2.5 h-1.5 rounded-full overflow-hidden ${
                celebra ? 'bg-white/25' : 'bg-surface-sunken'
              }`}
            >
              <div
                className={`h-full rounded-full transition-[width] duration-700 ease-out ${
                  celebra ? 'bg-white' : 'bg-brand'
                }`}
                style={{ width: `${fracao * 100}%` }}
              />
            </div>
          )}
        </Link>
      </div>
    </div>
  );
}
