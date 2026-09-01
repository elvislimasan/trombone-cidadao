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
// 2. O título é `sr-only`. Um bloco "INFRAESTRUTURA / Mapa de X / Visualize o
//    status..." custa ~120px antes de qualquer coisa útil, para repetir o que a
//    aba do navegador e o menu já dizem. Numa tela cujo assunto É o mapa, isso é
//    rolagem paga por nada — mas o `h1` continua no documento, porque leitor de
//    tela e busca precisam da estrutura.
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
  descricaoSeo,
  tituloDaAba,
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
          className="mx-auto w-full max-w-[112rem] space-y-2 px-3 pb-6 pt-3 sm:space-y-3 md:px-6 lg:px-8"
        >
          <h1 className="sr-only">{titulo}</h1>

          {estatisticas}

          <div
            className={`grid gap-2 sm:gap-3 min-[1100px]:h-[calc(100vh-11rem)] min-[1100px]:min-h-[34rem] ${
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
