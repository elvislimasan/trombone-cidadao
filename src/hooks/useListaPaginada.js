import { useCallback, useEffect, useState } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useInfiniteScroll } from '@/hooks/useInfiniteScroll';

/**
 * Recorta uma lista já carregada em memória — rolando no celular, paginada no
 * desktop.
 *
 * As telas do admin nasceram todas iguais: buscam a tabela inteira e mandam o
 * array direto para o `.map()`. Enquanto a base era de uma cidade isso passou;
 * com o app nacional, "Gerenciar Usuários" e "Gerenciar Obras" renderizam
 * milhares de nós de uma vez, e o celular do embaixador engasga antes de
 * desenhar a primeira linha.
 *
 * Isto resolve o lado do DOM. O lado da rede — buscar só o que se vai mostrar —
 * é outro problema, e cada tela tem que resolver o seu.
 *
 * Os dois comportamentos não são capricho: com mouse, um par de botões no
 * rodapé é confortável e ainda diz o tamanho do conjunto; com o polegar, obriga
 * a mirar num alvo pequeno a cada N itens para continuar lendo o que já se
 * estava lendo.
 *
 * @param {Array} itens lista completa, já filtrada e ordenada pela tela
 * @param {object} opcoes
 * @param {number} opcoes.porPagina quantos itens por página / por rolagem
 * @param {string} opcoes.chaveFiltro muda quando os filtros da tela mudam;
 *   é o sinal para voltar ao começo. Sem ela, trocar o filtro deixaria o
 *   usuário na página 7 de um resultado que agora tem 2.
 */
export function useListaPaginada(itens, { porPagina = 20, chaveFiltro = '' } = {}) {
  const isMobile = useIsMobile();
  const [pagina, setPagina] = useState(1);

  const total = itens.length;
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina));
  const paginaSegura = Math.min(pagina, totalPaginas);

  useEffect(() => {
    setPagina(1);
  }, [chaveFiltro]);

  // No celular a lista é uma fatia que só cresce; no desktop, a janela anda.
  const visiveis = isMobile
    ? itens.slice(0, paginaSegura * porPagina)
    : itens.slice((paginaSegura - 1) * porPagina, paginaSegura * porPagina);

  const temMais = isMobile && visiveis.length < total;

  const carregarMais = useCallback(() => setPagina((p) => p + 1), []);

  const irParaPagina = useCallback((destino) => {
    setPagina((atual) => {
      const alvo = Math.min(Math.max(1, destino), Math.max(1, Math.ceil(total / porPagina)));
      if (alvo !== atual) window.scrollTo({ top: 0, behavior: 'smooth' });
      return alvo;
    });
  }, [total, porPagina]);

  const sentinelaRef = useInfiniteScroll(carregarMais, { enabled: temMais });

  return {
    isMobile,
    visiveis,
    total,
    pagina: paginaSegura,
    totalPaginas,
    temMais,
    carregarMais,
    irParaPagina,
    sentinelaRef,
    // Pronto para espalhar no <PaginacaoLista />.
    propsPaginacao: {
      isMobile,
      pagina: paginaSegura,
      totalPaginas,
      temMais,
      carregarMais,
      irParaPagina,
      sentinelaRef,
      mostrarBotoes: total > porPagina,
    },
  };
}

export default useListaPaginada;
