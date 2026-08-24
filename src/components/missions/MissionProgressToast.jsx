import { useEffect, useState } from 'react';
import { Trophy, ChevronRight } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';

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
//
// ── EXCETO NA PATRULHA E NA CONFERÊNCIA, ONDE ESSA FAIXA É DE AÇÃO ──────────
//
// A frase acima era verdade em todas as telas MENOS as duas que mais fazem
// missão andar. Em `/patrulhar` e `/conferir` o rodapé é o "Sinalizar" e o
// "Encerrar patrulha"; o card subia exatamente por cima deles.
//
// E o card inteiro era um `<Link to="/missoes">`. Somados, os dois fatos
// produziam o pior desfecho possível: a pessoa registrava um sinal, o aviso
// subia sobre o botão, ela tocava em "Sinalizar" de novo — e acertava o link.
// A rota trocava, o overlay desmontava e a patrulha inteira ia embora sem
// passar pela folha de saída: sem gravar tempo, distância nem rastro.
//
// Era o relato: "aparece no meio da patrulha e ao clicar simplesmente sai do
// modo".
//
// Nestes dois modos o aviso vira LETREIRO: sem link, sem seta, sem receber
// toque — os toques atravessam para o botão que estava embaixo — e ancorado no
// topo, fora da faixa de ação. Continua informando (a barra anda, o "Missão
// concluída" aparece) e some sozinho em 4,2 s como em qualquer outra tela.
//
// O progresso não se perde por não ser clicável aqui: a patrulha tem a própria
// camada de recompensa (o +N que sobe e as medalhas no resumo), e a lista de
// missões continua a um toque de distância depois de encerrar.

const DURACAO_MS = 4200;

export default function MissionProgressToast({ avanco, onFechar }) {
  const [entrou, setEntrou] = useState(false);
  const [fracao, setFracao] = useState(0);

  // Mesma regra que o App.jsx usa para esconder header e bottom nav: estas duas
  // rotas são tela cheia com ação no rodapé. Ler da rota, e não de um estado
  // compartilhado, se limpa sozinho — sair da rota já desliga o modo letreiro.
  const { pathname } = useLocation();
  const emSessao =
    pathname.startsWith('/patrulhar') || pathname.startsWith('/conferir');

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

  // Em sessão o conteúdo é um `div` inerte; fora dela, o link de sempre.
  const Envolucro = emSessao ? 'div' : Link;
  const propsEnvolucro = emSessao
    ? { className: 'block px-4 py-3.5' }
    : { to: '/missoes', className: 'block px-4 py-3.5', onClick: onFechar };

  return (
    <div
      className={`fixed inset-x-0 z-[2500] px-4 pointer-events-none ${
        emSessao
          ? 'top-[calc(env(safe-area-inset-top,0px)+5.5rem)]'
          : 'bottom-24'
      }`}
      role="status"
      aria-live="polite"
    >
      <div
        key={avanco.chave}
        className={`mx-auto max-w-sm rounded-2xl border shadow-2xl overflow-hidden transition-all duration-300 ${
          emSessao ? 'pointer-events-none' : 'pointer-events-auto'
        } ${
          entrou ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        } ${
          celebra
            ? 'bg-brand text-content-onBrand border-brand'
            : 'bg-surface-overlay border-edge-default'
        }`}
      >
        <Envolucro {...propsEnvolucro}>
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

            {/* A seta anuncia "toque para ir" — em sessão não há para onde ir,
                e mantê-la seria convidar exatamente o toque que fazia perder a
                patrulha. */}
            {!emSessao && (
              <ChevronRight
                size={16}
                className={`shrink-0 ${celebra ? 'opacity-70' : 'text-content-tertiary'}`}
              />
            )}
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
        </Envolucro>
      </div>
    </div>
  );
}
