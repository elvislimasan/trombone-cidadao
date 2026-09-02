// A lista de cidades pronta para um <select> de gestão.
//
// POR QUE O UF NÃO É DETALHE
//
// "Floresta" é município de Pernambuco, do Paraná e de Santa Catarina. Num app
// que nasceu numa cidade só, o nome bastava; num app nacional, um seletor que
// mostra só o nome faz o embaixador criar a meta na cidade errada e descobrir
// isso quando a página pública abrir em outro estado.
//
// A ordem alfabética é da mesma família de problema: a ordem em que o banco
// devolve as linhas não é ordem nenhuma, e procurar numa lista sem ordem é
// percorrer todas as opções.
//
// Fica numa função, e não copiada em cada tela, porque duas cópias divergem —
// foi exatamente o que aconteceu entre a tela de metas e a de campanhas.

export const cidadesParaEscolha = (cities) =>
  [...(cities || [])]
    .map((c) => ({
      id: c.id,
      // O rótulo é montado aqui e não guardado: `state` pode não ter vindo no
      // select da consulta, e nesse caso o nome sozinho continua sendo melhor
      // que um "undefined" ao lado dele.
      rotulo: c.state?.uf ? `${c.name} · ${c.state.uf}` : c.name,
    }))
    .sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR'));
