// Pontos de Impacto — a segunda moeda.
//
// O PROBLEMA QUE ESTE ARQUIVO EXISTE PARA CORRIGIR
//
// A tabela de pontos (patrolGame.js) paga bronca, missão, sinal, vistoria,
// atualização, comentário e apoio. Todas são ENTRADAS. Nenhuma linha do app
// pagava pelo problema consertado.
//
// Lido honestamente, o incentivo dizia: produza mais denúncias. Não dizia:
// conserte mais coisas. É o que fazia o placar medir cidade reclamada em vez de
// cidade consertada — e o que tornava o ranking indefensável diante de uma
// prefeitura, porque o primeiro colocado era, por construção, quem mais
// reclamou.
//
// DUAS MOEDAS, NÃO UMA MAIOR
//
// A saída não é aumentar o XP da resolução. XP mede esforço e continua medindo:
// é o que reconhece quem passou a tarde na rua mesmo quando nada fechou — e
// tirar isso puniria justamente o trabalho de campo de que o produto depende.
//
// Impacto é outro eixo. Só existe quando uma bronca chega a resolvida, e é pago
// a TODOS que participaram dela. Aparecem lado a lado porque respondem
// perguntas diferentes: "quanto você trabalhou" e "quanto mudou".
//
// POR QUE PAGA RETROATIVO, E PARA TODO MUNDO
//
// A resolução acontece meses depois, e quase nunca por obra de uma pessoa só.
// Pagar apenas ao autor faria a segunda confirmação — a que a 190 e a
// verificação cruzada existem para incentivar — valer zero no desfecho, que é
// justamente onde ela mais importa.
//
// É também o que produz a única notificação que o app pode mandar sem inventar
// motivo: "o buraco da Rua X foi tapado; você e mais 11 pessoas fizeram isso".
//
// DERIVADO, NUNCA GRAVADO
//
// Mesma escolha da 169 (nível), 172 (conquistas) e 174 (placar de bairro):
// nenhuma coluna de saldo, nenhum job de crédito. O total sai da contagem de
// broncas resolvidas em que a pessoa aparece — o que torna o Impacto
// automaticamente revogável se uma bronca sair de 'resolved', sem estorno.

/**
 * Quanto cada forma de participação vale quando a bronca fecha.
 *
 * A escala é deliberadamente MAIS ALTA que a de XP (bronca = 10). Não é
 * inflação: são unidades diferentes, e a de Impacto precisa fazer uma resolução
 * pesar mais na tela do que a dúzia de ações que a antecedeu. Se consertar
 * rendesse menos que registrar, a moeda nova não mudaria nada.
 *
 * A ordem entre elas é o que importa, e é defensável linha a linha:
 *
 *   autor / missao (25) — sem o registro, nada existe. Quem completou o sinal
 *                         de outro empata com quem registrou do zero: os dois
 *                         produziram a bronca que a prefeitura leu.
 *   confirmacao (15)    — ir ao local de novo é o trabalho que ninguém quer
 *                         fazer e o que sustenta a verificação cruzada.
 *   sinal (10)          — apontou o problema sem cadastrá-lo. Menos trabalho,
 *                         mesmo mérito de origem.
 *   comentario (5)      — muitas vezes é o comentário que traz o número do
 *                         poste ou o nome do responsável.
 *   apoio (3)           — um toque. Vale mais que zero porque é o apoio que
 *                         move a bronca na fila, e vale pouco pelo mesmo motivo.
 */
export const IMPACTO = {
  autor: 25,
  missao: 25,
  confirmacao: 15,
  sinal: 10,
  comentario: 5,
  apoio: 3,
};

/**
 * Como cada contador do banco vira impacto.
 *
 * A lista é a fonte única: o total, a quebra por papel e a explicação na tela
 * saem toda daqui. Uma forma de participação nova entra acrescentando uma linha
 * — e aparece sozinha no detalhamento, sem ninguém lembrar de atualizar uma
 * segunda lista.
 */
export const PAPEIS = [
  {
    id: 'autor',
    contador: 'resolvidas_autor',
    peso: IMPACTO.autor,
    rotulo: 'Broncas suas que foram resolvidas',
    verbo: 'registrou',
  },
  {
    id: 'missao',
    contador: 'resolvidas_missao',
    peso: IMPACTO.missao,
    rotulo: 'Sinais de outros que você cadastrou e foram resolvidos',
    verbo: 'cadastrou',
  },
  {
    id: 'confirmacao',
    contador: 'resolvidas_confirmadas',
    peso: IMPACTO.confirmacao,
    rotulo: 'Resolvidas que você confirmou em campo',
    verbo: 'confirmou',
  },
  {
    id: 'sinal',
    contador: 'resolvidas_sinal',
    peso: IMPACTO.sinal,
    rotulo: 'Sinais seus que viraram bronca e foram resolvidos',
    verbo: 'sinalizou',
  },
  {
    id: 'comentario',
    contador: 'resolvidas_comentadas',
    peso: IMPACTO.comentario,
    rotulo: 'Resolvidas em que você comentou',
    verbo: 'comentou',
  },
  {
    id: 'apoio',
    contador: 'resolvidas_apoiadas',
    peso: IMPACTO.apoio,
    rotulo: 'Resolvidas que você apoiou',
    verbo: 'apoiou',
  },
];

/**
 * Selos de impacto.
 *
 * NÃO são níveis, e o vocabulário é diferente de propósito. Nível fala de
 * quanto a pessoa participa; selo fala de quanto mudou por causa dela. Repetir
 * "Nível 3" nos dois lugares faria as duas moedas parecerem a mesma com nomes
 * distintos — que é exatamente o que a separação existe para evitar.
 *
 * A primeira faixa é baixa (uma bronca resolvida basta) porque o primeiro selo
 * tem que chegar enquanto a pessoa ainda lembra por que foi lá.
 */
export const SELOS = [
  { minimo: 1200, id: 'referencia',    rotulo: 'Referência da cidade', emoji: '🏛️' },
  { minimo: 400,  id: 'transformador', rotulo: 'Transformador',        emoji: '🌉' },
  { minimo: 120,  id: 'reparador',     rotulo: 'Reparador',            emoji: '🧱' },
  { minimo: 25,   id: 'semente',       rotulo: 'Primeiro conserto',    emoji: '🌱' },
  { minimo: 0,    id: 'nenhum',        rotulo: 'Nenhum ainda',         emoji: '·'  },
];

const CONTADORES_VAZIOS = PAPEIS.reduce((acc, p) => ({ ...acc, [p.contador]: 0 }), {});

const numero = (v) => Math.max(0, Number(v) || 0);

/**
 * A quebra do impacto por papel, já pronta para a tela.
 *
 * Devolve TODOS os papéis, inclusive os zerados — quem chama decide o que
 * esconder. A tela do perfil mostra só os que somam; a explicação de "como
 * ganho impacto" mostra a lista inteira, e é a mesma função.
 */
export const creditosDe = (contadores) => {
  const c = { ...CONTADORES_VAZIOS, ...(contadores || {}) };
  return PAPEIS.map((p) => {
    const quantidade = numero(c[p.contador]);
    return {
      id: p.id,
      rotulo: p.rotulo,
      verbo: p.verbo,
      peso: p.peso,
      quantidade,
      pontos: quantidade * p.peso,
    };
  });
};

/** Total de impacto para os contadores dados. */
export const impactoDe = (contadores) =>
  creditosDe(contadores).reduce((soma, c) => soma + c.pontos, 0);

/**
 * Quantas broncas distintas a pessoa ajudou a resolver.
 *
 * NÃO é a soma dos papéis: a mesma bronca pode contar como autoria e como
 * confirmação, e somar diria "você resolveu 2" para uma resolução só. O banco
 * devolve o distinto pronto (`resolvidas_total`); sem ele, o maior papel é a
 * melhor aproximação disponível e nunca exagera.
 */
export const resolvidasDe = (contadores) => {
  const direto = numero(contadores?.resolvidas_total);
  if (direto) return direto;
  return creditosDe(contadores).reduce((max, c) => Math.max(max, c.quantidade), 0);
};

/** Selo para um total de impacto. */
export const seloDe = (impacto) => {
  const total = numero(impacto);
  return SELOS.find((s) => total >= s.minimo) || SELOS[SELOS.length - 1];
};

/**
 * Quanto falta para o próximo selo. Null no topo — não há barra a mostrar para
 * quem chegou (mesma regra de `proximaFaixa` em scoring.js).
 */
export const proximoSelo = (impacto) => {
  const total = numero(impacto);
  const acima = [...SELOS]
    .sort((a, b) => a.minimo - b.minimo)
    .find((s) => s.minimo > total);
  if (!acima) return null;

  const piso = seloDe(total).minimo;
  return {
    ...acima,
    faltam: acima.minimo - total,
    fracao: Math.min(1, Math.max(0, (total - piso) / (acima.minimo - piso))),
  };
};

/**
 * O placar de impacto completo.
 *
 * Espelha a forma de `placar()` em scoring.js de propósito: as duas moedas são
 * consumidas lado a lado pela mesma tela, e formatos diferentes obrigariam o
 * componente a saber de qual lado veio cada número.
 */
export const placarDeImpacto = (contadores) => {
  const total = impactoDe(contadores);
  return {
    impacto: total,
    resolvidas: resolvidasDe(contadores),
    selo: seloDe(total),
    creditos: creditosDe(contadores).filter((c) => c.quantidade > 0),
    proximo: proximoSelo(total),
  };
};

// ── O que mudou ───────────────────────────────────────────────────────────────

/**
 * Impacto ganho entre dois momentos, com o que dizer na tela.
 *
 * É o gêmeo de `avancosEntre` (missions.js) e existe pelo mesmo motivo: depois
 * de uma bronca fechar, comparar antes e depois diz exatamente o que aconteceu
 * — "3 broncas que você confirmou foram resolvidas: +45" — em vez de um saldo
 * novo que a pessoa precisa descobrir sozinha de onde veio.
 *
 * @returns {{total:number, por:Array, selo:object, subiuDeSelo:boolean}|null}
 */
export const impactoGanho = (antes, depois) => {
  if (!antes || !depois) return null;

  const de = creditosDe(antes);
  const para = creditosDe(depois);

  const por = para
    .map((c, i) => ({
      id: c.id,
      verbo: c.verbo,
      quantidade: c.quantidade - de[i].quantidade,
      pontos: c.pontos - de[i].pontos,
    }))
    .filter((c) => c.quantidade > 0)
    .sort((a, b) => b.pontos - a.pontos);

  const total = por.reduce((s, c) => s + c.pontos, 0);
  if (total <= 0) return null;

  const seloAntes = seloDe(impactoDe(antes));
  const seloDepois = seloDe(impactoDe(depois));

  return {
    total,
    por,
    selo: seloDepois,
    subiuDeSelo: seloAntes.id !== seloDepois.id,
  };
};

/**
 * A frase da notificação de resolução.
 *
 * Mora aqui porque a Edge Function de push, o card do feed e a tela de detalhe
 * precisam dizer a mesma coisa. A contagem de participantes é o coração dela:
 * "você e mais 11 pessoas" transforma um aviso de sistema no reconhecimento de
 * um esforço coletivo — e é literalmente verdade, porque o crédito foi pago
 * para as doze.
 *
 * @param {{titulo?:string, endereco?:string, participantes?:number, pontos?:number}} dados
 */
export const fraseDaResolucao = ({
  titulo,
  endereco,
  participantes = 1,
  pontos = 0,
} = {}) => {
  const onde = endereco || titulo || 'Um problema que você acompanhava';
  const outros = Math.max(0, Number(participantes) - 1);

  const quem =
    outros === 0
      ? 'Você fez isso acontecer.'
      : outros === 1
      ? 'Você e mais 1 pessoa fizeram isso.'
      : `Você e mais ${outros} pessoas fizeram isso.`;

  return {
    titulo: `${onde} foi resolvido`,
    corpo: pontos > 0 ? `${quem} +${pontos} de impacto.` : quem,
  };
};
