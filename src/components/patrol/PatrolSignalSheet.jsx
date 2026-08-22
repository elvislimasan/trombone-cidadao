import { useState } from 'react';
import { X, Loader2, Zap, Camera, ChevronLeft, Radio } from 'lucide-react';
import { CATEGORIAS_SINAL, nomeDaCategoria } from '@/lib/reportCategories';
import { PONTOS } from '@/lib/patrolGame';

// Sinalizar: categoria primeiro, profundidade depois.
//
// DOIS PASSOS, E NÃO UMA TELA SÓ
//
// A categoria é a pergunta que sempre tem resposta — a pessoa acabou de ver o
// problema. Só depois vem a que depende do contexto: dá para parar agora ou
// não? Invertendo a ordem, quem está dirigindo teria que decidir o quanto vai
// se comprometer antes de dizer com o quê.
//
// O segundo passo se paga: sem ele, o único caminho seria sinalizar e esperar
// que outra pessoa cumprisse a missão — e desde a migração 175 quem sinaliza
// não cumpre a própria. Quem tem tempo de parar e fotografar precisava de um
// caminho direto para a bronca completa, e é este.
//
// Um toque por passo, alvos de 88px. Sem câmera e sem teclado até aqui: quem
// escolhe "só alertar" termina em dois toques e volta a olhar a rua.

export default function PatrolSignalSheet({
  categoriaFixa = null,
  bairro,
  enviando,
  onSoAlertar,
  onCadastroCompleto,
  onFechar,
}) {
  // Numa patrulha de categoria única, a primeira pergunta já está respondida:
  // quem saiu para caçar buraco não vai sinalizar poste. A folha abre direto no
  // segundo passo, e um toque some do caminho.
  const [categoria, setCategoria] = useState(categoriaFixa);

  // Sem volta quando a categoria veio da patrulha: não há passo anterior.
  const voltar = categoriaFixa ? null : () => setCategoria(null);

  return (
    <div className="absolute inset-0 z-[1003] flex flex-col justify-end">
      {/* Fundo: fecha ao toque, e escurece o mapa para a grade ganhar contraste */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onFechar}
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
      />

      <div className="relative rounded-t-3xl bg-surface-overlay border-t border-edge-subtle shadow-2xl px-4 pt-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="flex items-start gap-2 min-w-0">
            {categoria && voltar && (
              <button
                type="button"
                onClick={voltar}
                aria-label="Voltar para as categorias"
                className="shrink-0 w-9 h-9 -ml-1 inline-flex items-center justify-center rounded-full text-content-secondary active:bg-surface-subtleHover transition-colors"
              >
                <ChevronLeft size={22} />
              </button>
            )}
            <div className="min-w-0">
              <h2 className="text-xl font-extrabold text-content-primary leading-tight">
                {categoria ? nomeDaCategoria(categoria) : 'O que você viu?'}
              </h2>
              <p className="text-sm text-content-secondary mt-0.5 truncate">
                {categoria
                  ? 'Você tem tempo de parar agora?'
                  : bairro
                  ? `Marcando aqui, no ${bairro}`
                  : 'Marcando na sua posição atual'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onFechar}
            aria-label="Cancelar"
            className="shrink-0 w-11 h-11 -mt-1 -mr-1 inline-flex items-center justify-center rounded-full text-content-secondary hover:bg-surface-subtle active:bg-surface-subtleHover transition-colors"
          >
            <X size={22} />
          </button>
        </div>

        {!categoria ? (
          <>
            <div className="grid grid-cols-2 gap-2.5">
              {CATEGORIAS_SINAL.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={enviando}
                  onClick={() => setCategoria(item.id)}
                  className="h-[88px] flex flex-col items-center justify-center gap-1.5 rounded-2xl bg-surface-subtle border border-edge-subtle active:scale-[0.97] active:bg-surface-subtleHover transition-transform disabled:opacity-40"
                >
                  <span className="text-3xl leading-none" aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className="text-sm font-bold text-content-primary text-center px-2 leading-tight">
                    {item.name}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-xs text-content-tertiary text-center mt-3.5 leading-snug">
              No passo seguinte você escolhe entre só alertar ou registrar a
              bronca completa.
            </p>
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            {/* Cadastro completo vem primeiro: é o resultado que a cidade
                aproveita, e ordem em lista é recomendação. */}
            <button
              type="button"
              disabled={enviando}
              onClick={() => onCadastroCompleto(categoria)}
              className="flex items-center gap-3.5 rounded-2xl bg-brand text-content-onBrand px-4 py-4 text-left active:scale-[0.98] transition-transform disabled:opacity-40"
            >
              <Camera size={26} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold leading-tight">Registrar a bronca</p>
                <p className="text-sm opacity-90 leading-snug mt-0.5">
                  Foto e descrição agora, no local
                </p>
                {/* A ordem já recomendava — quem lê de cima para baixo entende.
                    Mas nesta folha a pessoa decide de relance, em movimento, e
                    de relance uma lista de dois é só uma lista de dois. */}
                <span className="inline-block mt-1.5 rounded-md bg-white/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Recomendado
                </span>
              </div>
              <span className="shrink-0 text-sm font-extrabold tabular-nums">
                +{PONTOS.bronca}
              </span>
            </button>

            <button
              type="button"
              disabled={enviando}
              onClick={() => onSoAlertar(categoria)}
              className="flex items-center gap-3.5 rounded-2xl bg-surface-subtle border border-edge-subtle px-4 py-4 text-left active:scale-[0.98] transition-transform disabled:opacity-40"
            >
              <Zap size={26} className="shrink-0 text-content-secondary" />
              <div className="min-w-0 flex-1">
                <p className="font-extrabold text-content-primary leading-tight">
                  Só alertar
                </p>
                <p className="text-sm text-content-secondary leading-snug mt-0.5">
                  Vira missão para outro cidadão completar
                </p>
              </div>
              <span className="shrink-0 text-sm font-extrabold text-content-secondary tabular-nums">
                +{PONTOS.sinal}
              </span>
            </button>
            {/* POR QUE UMA DICA, E NÃO SÓ OS NÚMEROS

                Os pontos dizem qual vale mais; não dizem por quê. Sem a razão,
                "+10 contra +3" lê como preço arbitrário — e quem está com
                pressa escolhe o barato sem saber o que está abrindo mão. */}
            <div className="flex items-start gap-2.5 rounded-2xl bg-status-pendingBg border border-status-pendingBorder px-3.5 py-3 mt-1">
              <Radio size={16} className="shrink-0 text-status-pendingFg mt-0.5" />
              <p className="text-xs text-content-secondary leading-snug">
                <span className="font-bold text-status-pendingFg">Dica: </span>
                registrar com foto ajuda a resolver mais rápido e gera mais
                impacto na sua comunidade.
              </p>
            </div>
          </div>
        )}

        {enviando && (
          <div className="absolute inset-0 rounded-t-3xl bg-surface-overlay/70 flex items-center justify-center">
            <Loader2 size={28} className="animate-spin text-brand" />
          </div>
        )}
      </div>
    </div>
  );
}
