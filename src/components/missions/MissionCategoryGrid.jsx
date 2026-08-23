import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

// As categorias, com o progresso de cada uma.
//
// POR QUE UMA GRADE E NÃO MAIS UMA LISTA
//
// As missões de investigação são uma por categoria — seis linhas quase
// idênticas, com o mesmo texto e só o assunto mudando. Em lista, elas ocupam
// meia tela dizendo seis vezes a mesma frase.
//
// Numa grade cada uma vira um alvo do tamanho de um dedo, e o que muda entre
// elas — o ícone, o nome, quanto falta — é o que ocupa o espaço. A pergunta
// que a seção responde deixa de ser "o que é isso?" e passa a ser "por onde eu
// começo hoje?".
//
// O PROGRESSO É DA ETAPA, NÃO DO TOTAL
//
// "11/25" é o degrau atual da escada daquela categoria, igual ao que a lista
// mostra. Trocar pelo total acumulado faria a barrinha ficar quase cheia desde
// cedo e o próximo passo parecer um empurrão de nada.

const Bloco = ({ missao, categoria }) => (
  <Link
    to={missao.acao?.para || '#'}
    title={categoria?.name || missao.titulo}
    className="shrink-0 w-[5.5rem] snap-start flex flex-col items-center rounded-xl border border-edge-subtle bg-surface-raised px-2 pt-2.5 pb-2 shadow-elevation-1 active:scale-[0.96] transition-transform"
  >
    <span className="text-2xl leading-none" aria-hidden="true">
      {categoria?.icon || missao.icone}
    </span>
    {/* Duas linhas, não `truncate`.
        Cortado, "Vazamento de água" virava "Vazamento…" e "Limpeza urbana"
        virava "Limpeza…" — dois rótulos indistinguíveis de outros que começam
        igual. A altura fixa mantém os números alinhados entre os que usam uma
        linha e os que usam duas. */}
    <span className="mt-1.5 w-full text-[11px] font-bold text-content-primary text-center leading-tight line-clamp-2 min-h-[1.75rem]">
      {categoria?.name || missao.titulo}
    </span>
    <span className="mt-0.5 text-[11px] font-semibold text-content-tertiary tabular-nums">
      {missao.rotulo}
    </span>
    <span className="mt-1.5 w-full h-1 rounded-full bg-surface-sunken overflow-hidden">
      <span
        className="block h-full rounded-full bg-status-progressFg transition-[width] duration-500"
        style={{ width: `${Math.round((missao.completa ? 1 : missao.progresso) * 100)}%` }}
      />
    </span>
  </Link>
);

export default function MissionCategoryGrid({ missoes, categorias }) {
  const faixaRef = useRef(null);
  const [temMais, setTemMais] = useState(false);

  /** Ainda há conteúdo à direita? Medido do elemento, não chutado da contagem. */
  const medir = useCallback(() => {
    const el = faixaRef.current;
    if (!el) return;
    // A folga de 4 px absorve o arredondamento de zoom do navegador, que faz
    // `scrollLeft + clientWidth` ficar meio pixel abaixo de `scrollWidth` mesmo
    // com a faixa no fim — e a seta piscaria para sempre.
    setTemMais(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    medir();
    window.addEventListener('resize', medir);
    return () => window.removeEventListener('resize', medir);
  }, [medir, missoes]);

  if (!missoes || missoes.length === 0) return null;

  const porId = Object.fromEntries((categorias || []).map((c) => [c.id, c]));

  return (
    <section className="mt-6">
      {/* Sem "Ver todas": a lista completa está logo abaixo, na mesma rolagem.
          Um link para dois dedos mais adiante é ruído — e havia três deles na
          tela, competindo entre si e com os botões que fazem alguma coisa. */}
      <h2 className="text-base font-extrabold text-content-primary tracking-tight mb-1">
        Explore por categoria
      </h2>
      <p className="text-[11px] font-semibold text-content-tertiary tabular-nums mb-2.5">
       Clique no card abaixo para iniciar patrulha
      </p>  

      {/* UMA FILA, NÃO UMA GRADE.
          Em duas linhas de três, a seção comia um terço da tela para dizer seis
          números pequenos — e empurrava "Continue de onde parou", que é o que
          faz a pessoa agir, para fora do primeiro olhar.

          Numa fila que rola, ela ocupa a altura de um item e as seis continuam
          alcançáveis: o corte da sexta na borda é o que diz que há mais.

          SEM `-mx-4 px-4`. Aquilo puxa a faixa até a borda da tela e devolve o
          recuo por dentro, o que só alinha se o pai tiver exatamente `px-4`. O
          container desta página é `max-w-2xl mx-auto px-4` e centraliza em tela
          larga — então o negativo saía do CARTÃO, não da tela, e o primeiro
          item ficava colado na borda enquanto todo o resto tinha margem. */}
      {/* A SETA E O ESMAECIDO SÃO A MESMA MENSAGEM, DITA DUAS VEZES.

          O corte do último item na borda só funciona quando sobra item para
          cortar — com quatro categorias numa tela larga, a fila termina antes
          da borda e nada indica que há rolagem. A seta diz explicitamente.

          Ela some quando não há mais nada para o lado: apontar para o vazio é
          pior que não apontar. E é `pointer-events-none` para não roubar o
          toque do bloco que está embaixo dela. */}
      <div className="relative">
        <div
          ref={faixaRef}
          onScroll={medir}
          className="flex gap-2 overflow-x-auto snap-x pb-1 pr-1 scrollbar-none"
        >
          {missoes.map((m) => (
            <Bloco
              key={m.id}
              missao={m}
              categoria={porId[m.id.replace('investigar_', '')]}
            />
          ))}
        </div>

        {temMais && (
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pl-6 pr-0.5 bg-gradient-to-l from-surface-base via-surface-base/80 to-transparent">
            <ChevronRight size={18} className="text-content-tertiary" />
          </div>
        )}
      </div>
    </section>
  );
}
