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
 * O QUE A FRASE DEIXOU DE PROMETER
 *
 * A primeira versão dizia "Você fez isso acontecer". A seção 36.5 do plano de
 * gamificação pede o contrário, e a razão é de honestidade, não de tom: uma
 * resolução posterior prova que a pessoa registrou, verificou e acompanhou. Não
 * prova, sozinha, que ela causou o conserto — quem consertou foi quem foi lá
 * com a máquina.
 *
 * Prometer causalidade individual funciona uma vez e corrói a credibilidade do
 * placar inteiro depois, porque a primeira pessoa que perceber a diferença vai
 * desconfiar de todo o resto. Espelha `notificar_resolucao` na migração 207.
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
      ? 'Você contribuiu para registrar, verificar e acompanhar esta solução.'
      : outros === 1
      ? 'Você e mais 1 pessoa acompanharam este problema até o fim.'
      : `Você e mais ${outros} pessoas acompanharam este problema até o fim.`;

  return {
    titulo: `${onde} foi resolvido`,
    corpo: pontos > 0 ? `${quem} +${pontos} de impacto.` : quem,
  };
};

// ── O Recibo de Impacto ───────────────────────────────────────────────────────

/**
 * O que ESTA pessoa fez NESTA bronca.
 *
 * Os contadores do banco respondem "quanto no total"; o recibo precisa
 * responder "quanto aqui". A diferença importa: chegar pela notificação de uma
 * bronca específica e ver um saldo geral é o mesmo que não receber recibo
 * nenhum — a pergunta que a pessoa trouxe era sobre aquele buraco.
 *
 * Deriva do que a tela de detalhe já carregou. Nenhuma consulta nova, nenhuma
 * coluna nova: autoria vem de `reports`, confirmação vem de `report_updates`,
 * comentário vem de `comments`, apoio vem da assinatura já consultada.
 *
 * A CONFIRMAÇÃO SÓ CONTA SE NÃO FOI REJEITADA
 *
 * Mesmo critério da 199 e de `resolution.js`. Pagar por uma observação que a
 * moderação recusou faria o recibo premiar exatamente o que o app acabou de
 * dizer que não servia.
 *
 * @param {object} args
 * @param {object} args.report
 * @param {Array}  [args.atualizacoes]
 * @param {Array}  [args.comentarios]
 * @param {boolean}[args.apoiou]
 * @param {object} args.user
 * @returns {{creditos:Array, total:number}}
 */
export const creditoNaBronca = ({
  report,
  atualizacoes = [],
  comentarios = [],
  apoiou = false,
  user,
} = {}) => {
  if (!report || !user?.id) return { creditos: [], total: 0 };

  const lista = (v) => (Array.isArray(v) ? v : []);
  const meu = (linha) => linha?.author_id === user.id || linha?.user_id === user.id;

  const papeis = [];

  // Autor e "completou o sinal de outro" são exclusivos entre si: quem
  // transformou o sinal em bronca aparece em `completed_by`, e somar os dois
  // pagaria duas vezes pelo mesmo registro.
  if (report.author_id === user.id) papeis.push('autor');
  else if (report.completed_by === user.id) papeis.push('missao');

  const confirmou = lista(atualizacoes).some(
    (u) => meu(u) && u.update_type === 'solved' && u.status !== 'rejected'
  );
  if (confirmou) papeis.push('confirmacao');

  if (lista(comentarios).some(meu)) papeis.push('comentario');
  if (apoiou) papeis.push('apoio');

  const creditos = PAPEIS.filter((p) => papeis.includes(p.id)).map((p) => ({
    id: p.id,
    verbo: p.verbo,
    rotulo: p.rotulo,
    pontos: p.peso,
  }));

  return {
    creditos,
    total: creditos.reduce((s, c) => s + c.pontos, 0),
  };
};

/**
 * O que a pessoa recebe quando uma bronca dela fecha.
 *
 * POR QUE "RECIBO", E NÃO "PARABÉNS"
 *
 * Um recibo presta contas: diz o que você fez, o que aconteceu, quem mais
 * participou e de onde veio cada número. É o oposto da tela de comemoração, que
 * afirma um resultado e esconde a origem — e é o formato que a §36.6 pede
 * justamente porque o retorno confiável vale mais que o retorno bonito.
 *
 * A ORIGEM DE CADA LINHA VEM JUNTO
 *
 * `creditos` já sai de `PAPEIS`, então cada linha do recibo diz qual
 * participação a gerou ("Resolvidas que você confirmou em campo: +15"). Um
 * total sem quebra é um número que a pessoa tem que acreditar; com a quebra,
 * é um número que ela pode conferir.
 *
 * O QUE O RECIBO NÃO FAZ
 *
 * Não devolve percentual de conclusão do problema. A execução dependeu de
 * terceiro, e barra de progresso com denominador de apoios ou fotos é ficção
 * apresentada como medida (§36.6). O que ele mostra é marco factual: o que
 * aconteceu, quando, por quem — o resto está na linha do tempo.
 *
 * @param {object} args
 * @param {object} args.report          a bronca resolvida
 * @param {object} args.contadoresAntes contadores antes da resolução
 * @param {object} args.contadoresDepois contadores depois
 * @param {number} [args.participantes] quantas pessoas participaram
 * @returns {{
 *   titulo:string, corpo:string, ganho:object|null,
 *   participantes:number, selo:object, compartilhavel:boolean,
 * }|null}
 */
export const reciboDeImpacto = ({
  report,
  contadoresAntes,
  contadoresDepois,
  participantes = 1,
} = {}) => {
  if (!report) return null;

  const ganho = impactoGanho(contadoresAntes, contadoresDepois);
  const frase = fraseDaResolucao({
    titulo: report.title,
    endereco: report.address,
    participantes,
    pontos: ganho?.total || 0,
  });

  return {
    titulo: frase.titulo,
    corpo: frase.corpo,
    ganho,
    participantes: Math.max(1, Number(participantes) || 1),
    selo: seloDe(impactoDe(contadoresDepois)),
    // O que pode ir para fora do app: o problema e o desfecho, nunca o percurso.
    // O plano é explícito — o Recibo compartilha impacto concreto, não a rota
    // precisa da pessoa (§36.6).
    compartilhavel: true,
  };
};
