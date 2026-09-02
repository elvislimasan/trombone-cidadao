import { useState } from 'react';
import { Helmet } from 'react-helmet';
import { motion } from 'framer-motion';
import { SlidersHorizontal } from 'lucide-react';

// A moldura comum de toda tela de mapa do app.
//
// POR QUE EXTRAIR
//
// O mapa de pavimentação chegou a um arranjo que funciona — faixa de números
// compacta, coluna de filtros à esquerda, mapa ocupando a altura da janela e
// painel de relatórios à direita — e as outras telas de mapa (broncas, obras,
// imóveis) tinham cada uma o seu. Quem aprende a operar uma não aproveita nada
// na seguinte, e cada ajuste de layout precisava ser feito três vezes,
// divergindo na terceira.
//
// AS DECISÕES QUE ESTA MOLDURA CARREGA
//
// 1. 112rem, e não os 88rem do resto do site. Largura de leitura é regra para
//    texto: linha longa cansa. Mapa não se lê, se examina, e cada rem de sobra
//    na lateral é cidade que não aparece. Em 1920 ainda restam ~80px de cada
//    lado, então a página continua parecendo do mesmo site.
//
// 2. O cabeçalho é o mesmo das telas de listagem do app: título centralizado,
//    chamada de uma linha, um selo com o número que resume a tela e, abaixo, a
//    linha de ações (cidade, "Adicionar", exportar). Ele já foi `sr-only` para
//    poupar altura, e o que se poupou custou caro: a página perdia o nome
//    justamente para quem chega por link, e as quatro telas de mapa passavam a
//    parecer quatro produtos diferentes. A altura que ele ocupa está descontada
//    da grade abaixo — ver a nota do `calc`.
//
// 3. A coluna de filtros recolhe. Recolhida, vira uma pílula flutuante sobre o
//    mapa com a CONTAGEM de filtros ligados: sem o número, alguém esconde a
//    coluna, esquece o recorte e lê o mapa filtrado achando que é a cidade
//    inteira.
//
// 4. Abaixo de 1100px não há colunas. Num notebook estreito, três colunas
//    deixam o mapa com 400px — menos útil que o mapa inteiro com os controles
//    empilhados embaixo.

export default function TelaDeMapa({
  titulo,
  // A chamada de uma linha sob o título. Opcional: onde não houver nada a dizer
  // além do nome, é melhor não dizer nada.
  subtitulo = null,
  // O selo verde: UM número que resume a tela inteira. É o que a pessoa lê
  // antes dos cartões, e por isso não pode ser mais de um — dois selos lado a
  // lado deixam de ser resumo e viram outra faixa de números.
  destaque = null,
  descricaoSeo,
  tituloDaAba,
  // Ações da tela que não cabem no painel de filtros — seletor de cidade,
  // "Adicionar", exportar. Ficam sob o título porque respondem "o que posso
  // fazer aqui", e não "o que estou vendo".
  acoes = null,
  estatisticas = null,
  filtros = null,
  mapa,
  painel = null,
  empilhado = null,
  filtrosLigados = 0,
  children = null,
}) {
  const [painelAberto, setPainelAberto] = useState(true);
  const temFiltros = Boolean(filtros);

  return (
    <>
      <Helmet>
        <title>{tituloDaAba || `${titulo} - Trombone Cidadão`}</title>
        {descricaoSeo && <meta name="description" content={descricaoSeo} />}
      </Helmet>

      <div className="flex flex-col bg-surface-base md:px-6">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          /* Coluna flex a partir de 1100px: o cabeçalho e os cartões pegam a
             altura deles, e a grade abaixo fica com o que sobrar da janela. É o
             que impede o mapa de invadir o rodapé quando o topo cresce. */
          className="mx-auto flex w-full max-w-[112rem] flex-col gap-2 px-3 pb-6 pt-3 sm:gap-3 md:px-6 lg:px-8 min-[1100px]:h-[calc(100dvh-8rem)]"
        >
          <div className="text-center">
            <h1 className="text-2xl font-bold text-tc-red sm:text-3xl md:text-4xl">{titulo}</h1>
            {subtitulo && (
              <p className="mt-2 text-sm text-content-secondary sm:text-base">{subtitulo}</p>
            )}
            {destaque && <div className="mt-3 flex justify-center">{destaque}</div>}
            {acoes && (
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">{acoes}</div>
            )}
          </div>

          {estatisticas}

          <div
            className={`grid gap-2 sm:gap-3 min-[1100px]:min-h-0 min-[1100px]:flex-1 ${
              temFiltros && painelAberto
                ? 'min-[1100px]:grid-cols-[13.5rem_minmax(0,1fr)] min-[1440px]:grid-cols-[16rem_minmax(0,1fr)_18rem]'
                : 'min-[1100px]:grid-cols-[minmax(0,1fr)] min-[1440px]:grid-cols-[minmax(0,1fr)_18rem]'
            }`}
          >
            {temFiltros && (
              <div className={painelAberto ? '' : 'min-[1100px]:hidden'}>
                {typeof filtros === 'function'
                  ? filtros({ fechar: () => setPainelAberto(false) })
                  : filtros}
              </div>
            )}

            <div className="relative h-[calc(100dvh-28rem-var(--safe-area-bottom,0px))] min-h-[22rem] w-full overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised shadow-sm sm:h-[calc(100dvh-24rem-var(--safe-area-bottom,0px))] sm:min-h-[24rem] min-[900px]:h-[calc(100dvh-19rem-var(--safe-area-bottom,0px))] lg:h-[calc(100dvh-16rem)] lg:min-h-[20rem] min-[1100px]:h-full min-[1100px]:min-h-0">
              {mapa}

              {temFiltros && !painelAberto && (
                <button
                  type="button"
                  onClick={() => setPainelAberto(true)}
                  className="absolute left-3 top-3 z-[700] hidden items-center gap-2 rounded-full border border-edge-subtle bg-surface-overlay/95 px-3 py-2 text-xs font-bold text-content-secondary shadow-lg backdrop-blur-sm min-[1100px]:inline-flex"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filtros
                  {filtrosLigados > 0 && (
                    <span className="rounded-full bg-brand px-1.5 text-[10px] font-extrabold text-content-onBrand tabular-nums">
                      {filtrosLigados}
                    </span>
                  )}
                </button>
              )}
            </div>

            {/* O que no desktop mora nas colunas, no celular vira pilha embaixo
                do mapa — na mesma ordem de importância. */}
            {empilhado && (
              <section className="grid gap-3 lg:hidden" aria-label={`Informações e filtros de ${titulo}`}>
                {empilhado}
              </section>
            )}

            {painel && (
              <aside className="hidden min-[1440px]:block min-[1440px]:h-full min-[1440px]:min-h-0">
                {painel}
              </aside>
            )}
          </div>
        </motion.div>
      </div>

      {/* Modais, gavetas e folhas de baixo entram por aqui, fora da grade. */}
      {children}
    </>
  );
}
