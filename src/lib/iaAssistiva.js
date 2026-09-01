// IA assistiva, avaliada por categoria.
//
// O ADJETIVO "AVALIADA" É A ENTREGA
//
// A §36.14 não pede "IA": pede IA **avaliada por categoria**. A diferença é o
// arquivo inteiro. Um assistente que sugere categoria acerta muito em buraco
// (a foto mostra um buraco) e erra muito em "outros" (a foto mostra qualquer
// coisa) — e a média entre os dois esconde exatamente o caso em que ele
// atrapalha.
//
// Então a habilitação é POR CATEGORIA, medida contra o que a pessoa de fato
// escolheu, e desligada onde não há medição.
//
// O CONTRA-EXEMPLO ESTÁ NESTE REPOSITÓRIO
//
// `src/components/AIReports.jsx` exibe "Tempo médio de resolução: 5.2 dias" —
// uma constante escrita à mão, sob um ícone de cérebro, apresentada como
// insight. Ninguém mente de propósito ali; alguém precisou preencher a tela.
//
// É o resultado natural de tratar IA como enfeite. Este módulo faz o oposto:
// não afirma nada que não tenha sido medido, e prefere não sugerir a sugerir no
// escuro.
//
// A SUGESTÃO NUNCA DECIDE
//
// Ela preenche um campo que a pessoa pode trocar, e o registro do que ela
// escolheu é o que alimenta a avaliação da rodada seguinte. Um assistente que
// grava sozinho não é assistivo: é um autor sem responsabilidade.
//
// NÃO HÁ MODELO LIGADO AQUI
//
// O que existe é o portão, a medição e a interface do sugeridor. O sugeridor
// inicial é uma heurística transparente (o que já foi registrado por perto), e
// ela se apresenta como heurística. Quando houver um modelo, ele entra como
// outra implementação de `sugerirCategoria` — e passa pelas mesmas regras.

import { CATEGORIAS_BRONCA } from './reportCategories.js';

/**
 * Acerto mínimo para uma categoria receber sugestão.
 *
 * 70%. Abaixo disso, a sugestão custa mais do que rende: a pessoa precisa
 * perceber o erro, desfazer e escolher — três passos onde havia um. E o erro é
 * pior que o trabalho, porque quem está com pressa aceita o que veio preenchido.
 */
export const ACERTO_MINIMO = 0.7;

/**
 * Amostra mínima antes de confiar na medição.
 *
 * 30 sugestões. Com dez, uma sequência de sorte passa de 70% sem significar
 * nada — e a categoria seria liberada por acaso.
 */
export const AMOSTRA_MINIMA = 30;

const numero = (v) => Math.max(0, Number(v) || 0);

/**
 * A taxa de acerto de uma categoria, a partir do que foi medido.
 *
 * @param {{sugeridas:number, aceitas:number}} avaliacao
 */
export const acertoDe = (avaliacao) => {
  const sugeridas = numero(avaliacao?.sugeridas);
  if (sugeridas === 0) return null;
  return numero(avaliacao?.aceitas) / sugeridas;
};

/**
 * A sugestão está habilitada para esta categoria?
 *
 * Devolve o motivo porque a tela de administração precisa mostrar POR QUE uma
 * categoria está desligada — "sem amostra" e "acerto baixo" pedem ações
 * diferentes: a primeira espera, a segunda exige mexer no sugeridor.
 *
 * Categoria sem nenhuma avaliação fica DESLIGADA. É a escolha conservadora, e é
 * a que impede o assistente de estrear em produção medindo-se sozinho.
 */
export const habilitadaPara = (categoriaId, avaliacoes = []) => {
  const a = (Array.isArray(avaliacoes) ? avaliacoes : []).find(
    (x) => x?.categoria_id === categoriaId
  );

  if (!a) return { ok: false, motivo: 'sem_avaliacao', acerto: null, amostra: 0 };

  const amostra = numero(a.sugeridas);
  const acerto = acertoDe(a);

  if (amostra < AMOSTRA_MINIMA) {
    return { ok: false, motivo: 'amostra_pequena', acerto, amostra };
  }
  if (acerto < ACERTO_MINIMO) {
    return { ok: false, motivo: 'acerto_baixo', acerto, amostra };
  }

  return { ok: true, motivo: null, acerto, amostra };
};

/**
 * O sugeridor inicial: o que já foi registrado por perto.
 *
 * É uma heurística, não um modelo, e se apresenta como tal. A lógica é banal e
 * defensável: numa esquina onde as últimas dez broncas foram de iluminação, a
 * décima primeira provavelmente também é.
 *
 * Ela existe por dois motivos. Primeiro, funciona: a concentração de categoria
 * por lugar é real numa cidade. Segundo, e mais importante, ela EXERCITA o
 * caminho inteiro — sugestão, escolha da pessoa, medição — antes de existir
 * modelo. Quando o modelo chegar, o que ele encontra é uma avaliação já rodando.
 *
 * @param {Array} broncasProximas  linhas com `category_id`
 * @returns {{categoriaId:string, confianca:number, base:string}|null}
 */
export const sugerirCategoria = (broncasProximas = []) => {
  const lista = (Array.isArray(broncasProximas) ? broncasProximas : []).filter(
    (b) => b?.category_id
  );
  if (lista.length < 3) return null;

  const contagem = new Map();
  for (const b of lista) {
    contagem.set(b.category_id, (contagem.get(b.category_id) || 0) + 1);
  }

  const [categoriaId, quantas] = [...contagem.entries()].sort((a, b) => b[1] - a[1])[0];
  const confianca = quantas / lista.length;

  // Concentração fraca não é sinal. Metade das broncas de uma esquina sendo de
  // uma categoria diz alguma coisa; um terço não diz nada.
  if (confianca < 0.5) return null;

  return {
    categoriaId,
    confianca,
    base: `${quantas} das ${lista.length} broncas registradas por aqui são desta categoria`,
  };
};

/**
 * A sugestão pronta para a tela, já passada pelo portão.
 *
 * Devolve `null` quando a categoria não está habilitada — e é aí que a avaliação
 * por categoria vira comportamento em vez de relatório.
 */
export const assistencia = ({ broncasProximas = [], avaliacoes = [] } = {}) => {
  const sugestao = sugerirCategoria(broncasProximas);
  if (!sugestao) return null;

  const portao = habilitadaPara(sugestao.categoriaId, avaliacoes);
  if (!portao.ok) return null;

  const categoria = CATEGORIAS_BRONCA.find((c) => c.id === sugestao.categoriaId);
  if (!categoria) return null;

  return {
    categoriaId: sugestao.categoriaId,
    rotulo: categoria.name,
    // O texto diz de onde veio o palpite. Sugestão sem origem é adivinhação com
    // ar de autoridade — e é exatamente o que o ícone de cérebro do AIReports
    // faz.
    porque: sugestao.base,
    // Nunca "temos 87% de certeza". A confiança é da heurística sobre a
    // vizinhança, não sobre a foto — e apresentá-la como certeza sobre o
    // problema seria a mesma invenção.
    aviso: 'É um palpite pelo que já foi registrado por perto. Troque se não for.',
  };
};

/**
 * O que registrar depois que a pessoa escolheu.
 *
 * Este é o dado que alimenta a avaliação, e ele só existe porque a sugestão não
 * decide: houve uma escolha para comparar.
 *
 * `aceita` é a igualdade estrita entre sugerido e escolhido. Nada de "quase
 * certo" — a pessoa trocou ou não trocou.
 */
export const medicaoDaSugestao = ({ sugerida, escolhida } = {}) => {
  if (!sugerida || !escolhida) return null;
  return {
    categoria_id: sugerida,
    escolhida_id: escolhida,
    aceita: sugerida === escolhida,
  };
};

/**
 * O painel de avaliação, para quem administra.
 *
 * Lista TODAS as categorias, inclusive as sem medição — porque "não sabemos" é a
 * informação mais acionável do painel: é ela que diz onde o assistente está
 * calado e ninguém percebeu.
 */
export const painelDeAvaliacao = (avaliacoes = []) =>
  CATEGORIAS_BRONCA.map((c) => {
    const portao = habilitadaPara(c.id, avaliacoes);
    return {
      categoriaId: c.id,
      nome: c.name,
      ...portao,
      rotulo:
        portao.acerto == null
          ? 'sem medição'
          : `${Math.round(portao.acerto * 100)}% em ${portao.amostra}`,
    };
  });
