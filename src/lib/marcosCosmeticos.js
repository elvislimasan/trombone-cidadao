// Marcos cosméticos, sem moeda.
//
// O QUE "SEM MOEDA" SIGNIFICA AQUI, E POR QUE É ESTRUTURAL
//
// A §36.14 tira do roadmap Trombone Coins, loja completa, caixas, loot e passe
// de temporada. O que sobra é isto: uma peça cosmética abre quando um FATO
// acontece, e a relação entre o fato e a peça é direta e visível.
//
// A diferença não é de embalagem. Numa economia de moeda, a pergunta do usuário
// vira "quanto falta para eu poder comprar", e o produto ganha um botão para
// acelerar isso. Num marco direto, a pergunta é "o que eu preciso fazer" — e a
// resposta é sempre uma ação cívica, porque não existe outra forma de chegar
// lá.
//
// NENHUM COSMÉTICO DÁ VANTAGEM. NUNCA.
//
// É a invariante que este arquivo protege, e a que mais barato se perde: basta
// alguém achar que "o colete tático podia dar +5% de XP". A partir daí a roupa
// deixa de ser identidade e vira build — e quem não jogou o suficiente passa a
// contribuir valendo menos, o que é o oposto de progressão leve.
//
// Por isso não existe campo de bônus, de multiplicador ou de efeito. Uma peça
// tem id, rótulo e a condição que a abre. Se um dia alguém precisar acrescentar
// `bonus` aqui, o lugar de discutir é o plano, não este arquivo.
//
// POR QUE NÃO HÁ "EQUIPAR PARA GANHAR MAIS"
//
// Mesma razão, dita ao contrário: o avatar aparece no mapa e no story, e é
// exatamente por isso que ele é um bom prêmio. Reconhecimento é o produto —
// não a embalagem de um bônus.

import { CONQUISTAS } from './patrolGame.js';

/**
 * Como uma peça é liberada.
 *
 * `nivel`    — o nível do placar já existia como porta em `PATROL_AVATAR_STYLES`
 *              (`nivelMinimo`), e continua valendo. É a progressão genérica.
 * `conquista`— a novidade da fase 4: a peça abre por uma medalha específica.
 *              É o que torna o cosmético uma FRASE ("você verificou 50 broncas")
 *              em vez de um número acumulado.
 */
export const POR_NIVEL = 'nivel';
export const POR_CONQUISTA = 'conquista';

/**
 * As peças que abrem por conquista.
 *
 * A lista é curta de propósito. Um catálogo de quarenta peças transformaria a
 * tela num inventário — e inventário é o primeiro passo para a loja que o
 * roadmap tirou.
 *
 * Cada peça aponta uma medalha que JÁ EXISTE. Criar medalha nova só para ter o
 * que desbloquear seria inventar a conquista para justificar o prêmio, que é a
 * forma mais rápida de as duas coisas perderem o sentido.
 */
export const MARCOS = [
  {
    id: 'faixa_verificador',
    tipo: 'accessory',
    rotulo: 'Faixa de verificação',
    descricao: 'Para quem já voltou muitas vezes ao mesmo problema.',
    por: POR_CONQUISTA,
    conquista: 'confirmacoes_50',
  },
  {
    id: 'prancheta',
    tipo: 'accessory',
    rotulo: 'Prancheta',
    descricao: 'De quem teve sugestões de rua aprovadas.',
    por: POR_CONQUISTA,
    conquista: 'cartografo',
  },
  {
    id: 'braçadeira_apoio',
    tipo: 'accessory',
    rotulo: 'Braçadeira de apoio',
    descricao: 'De quem fez a contribuição de outras pessoas valer.',
    por: POR_CONQUISTA,
    conquista: 'rede_de_apoio',
  },
  {
    id: 'selo_confiavel',
    tipo: 'accessory',
    rotulo: 'Selo de observação confiável',
    descricao: 'Muitas observações aceitas, poucas recusadas.',
    por: POR_CONQUISTA,
    conquista: 'observacao_confiavel',
  },
];

const lista = (v) => (Array.isArray(v) ? v : []);

/**
 * O estado de cada marco, para a tela.
 *
 * Recebe as conquistas já avaliadas (`avaliarConquistas`) porque a regra de cada
 * medalha mora lá — e reimplementá-la aqui criaria duas verdades sobre a mesma
 * medalha, com a peça abrindo antes ou depois do que a tela de conquistas diz.
 *
 * @param {Array} conquistas  saída de `avaliarConquistas`
 */
export const marcosDe = (conquistas = []) => {
  const porId = new Map(lista(conquistas).map((c) => [c.id, c]));

  return MARCOS.map((m) => {
    const c = porId.get(m.conquista);
    return {
      ...m,
      aberto: !!c?.desbloqueada,
      // O progresso vem da medalha, não de uma contagem própria: a peça é a
      // consequência, e a tela deve dizer exatamente o que falta para a medalha.
      progresso: c?.progresso ?? 0,
      comoAbrir: c ? `${c.nome} — ${c.descricao}` : null,
      falta: c && !c.desbloqueada ? c.rotulo : null,
    };
  });
};

/**
 * As peças abertas, no formato que o seletor de avatar consome.
 */
export const cosmeticosAbertos = (conquistas = []) =>
  marcosDe(conquistas)
    .filter((m) => m.aberto)
    .map((m) => ({ id: m.id, tipo: m.tipo, label: m.rotulo }));

/**
 * Todo marco aponta uma medalha que existe?
 *
 * Não é utilitário de tela: é a checagem que impede um marco órfão de aparecer
 * como "impossível de abrir" sem que ninguém perceba. Chamada pelo teste.
 */
export const marcosOrfaos = () => {
  const ids = new Set(CONQUISTAS.map((c) => c.id));
  return MARCOS.filter((m) => m.por === POR_CONQUISTA && !ids.has(m.conquista));
};
