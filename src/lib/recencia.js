// Recência e confiança: o que sabemos sobre um ponto, e há quanto tempo.
//
// O QUE ISTO SUBSTITUI
//
// O plano original tinha "hexágono conquistado" — uma grade em que patrulhar um
// pedaço da cidade o marcava como seu. A §36.6 (Aposta 4) troca isso por uma
// camada de necessidade, e a diferença é a tese inteira do produto: o mapa
// comunitário deve dizer **o que ainda não sabemos**, não **quem é dono do
// lugar**.
//
// Território individual é o pior incentivo possível para um app de fiscalização
// urbana. Ele premia passar de novo onde já se passou (que não produz dado
// nenhum), cria disputa por bairro e, no limite, autoriza alguém a se sentir
// responsável por uma rua diante de outra pessoa.
//
// Necessidade premia o contrário: ir onde a informação está velha.
//
// OS CINCO ESTADOS
//
// Vêm literalmente do plano, e cada um manda uma ação diferente:
//
//   sem_dado       ninguém nunca conferiu     → vale muito ir
//   vencido        conferiram, faz tempo      → vale ir
//   uma_observacao uma pessoa recente         → vale a segunda opinião
//   confirmado     duas independentes         → não precisa de ninguém agora
//   conflito       duas se contradizem        → precisa de auditoria, não de mais uma
//
// "CONFLITO" NÃO É EMPATE A SER DESEMPATADO POR VOTO
//
// Quando uma pessoa diz que o problema continua e outra diz que acabou, o app
// NÃO manda uma terceira para desempatar por maioria. Duas observações opostas
// no mesmo mês costumam significar que a pergunta está errada, que o ponto está
// no lugar errado, ou que alguém consertou entre as duas visitas — e nenhuma
// dessas se resolve contando votos. Vai para auditoria da moderação.
//
// A PERGUNTA CEGA
//
// A §36.5 pede que a validação seja inicialmente cega: perguntar "qual pavimento
// você observa?" antes de revelar o que estava registrado, em vez de "continua
// pavimentada?". Este módulo devolve `revelarDepois: true` para o estado em que
// a ancoragem faria mais estrago — quando já existe observação recente e mostrar
// o que ela disse enviesaria a próxima.

/**
 * Quanto tempo uma observação continua valendo.
 *
 * 28 dias, o mesmo intervalo da revisita (`reportRevisit.js`), e não por
 * simetria estética: os dois números respondem à mesma pergunta — a partir de
 * quando o que sabemos sobre esta rua deixou de ser confiável. Dois valores
 * diferentes fariam o app pedir revisita de um dado que a camada de cobertura
 * ainda considera fresco.
 */
export const JANELA_RECENCIA_DIAS = 28;

export const SEM_DADO = 'sem_dado';
export const VENCIDO = 'vencido';
export const UMA_OBSERVACAO = 'uma_observacao';
export const CONFIRMADO = 'confirmado';
export const CONFLITO = 'conflito';

/**
 * O que cada estado significa e quanto vale ir até lá.
 *
 * `valor` é o que ordena a Rota do Dia. A escala é deliberadamente NÃO
 * proporcional à distância: o objetivo da rota é maximizar valor do dado dentro
 * do tempo disponível, não visitar o ponto mais próximo (§36.6, Aposta 3).
 *
 * `confirmado` vale zero, não pouco. Mandar alguém a um ponto que duas pessoas
 * independentes já confirmaram este mês não produz informação — produz a
 * sensação de trabalho, que é o que a rota existe para não fazer.
 *
 * `conflito` vale menos que `vencido` de propósito: mais uma observação de campo
 * não resolve contradição. Ele aparece para a moderação, não para a rota.
 */
export const ESTADOS = {
  [SEM_DADO]: {
    id: SEM_DADO,
    rotulo: 'Ninguém conferiu ainda',
    curto: 'Sem dado',
    valor: 100,
    revelarDepois: false,
  },
  [VENCIDO]: {
    id: VENCIDO,
    rotulo: 'A última notícia está velha',
    curto: 'Dado vencido',
    valor: 80,
    revelarDepois: false,
  },
  [UMA_OBSERVACAO]: {
    id: UMA_OBSERVACAO,
    rotulo: 'Uma pessoa conferiu recentemente',
    curto: 'Uma observação',
    valor: 45,
    // Aqui a ancoragem faz estrago: mostrar "fulano disse que continua" antes de
    // a pessoa responder produz concordância barata, e concordância barata é
    // indistinguível de confirmação real.
    revelarDepois: true,
  },
  [CONFIRMADO]: {
    id: CONFIRMADO,
    rotulo: 'Duas pessoas independentes confirmaram',
    curto: 'Confirmado',
    valor: 0,
    revelarDepois: true,
  },
  [CONFLITO]: {
    id: CONFLITO,
    rotulo: 'Duas observações se contradizem',
    curto: 'Precisa de auditoria',
    valor: 20,
    revelarDepois: true,
  },
};

/** O que cada tipo de atualização afirma sobre o problema. */
const AFIRMACAO = {
  still_here: 'persiste',
  being_solved: 'mudando',
  solved: 'acabou',
};

const lista = (v) => (Array.isArray(v) ? v : []);

const emMs = (v) => {
  if (!v) return null;
  const t = v instanceof Date ? v.getTime() : new Date(v).getTime();
  return Number.isFinite(t) ? t : null;
};

/**
 * Observações que contam para recência.
 *
 * Mesmo recorte da 199 e de `resolution.js`: rejeitada não conta, pendente de
 * moderação conta, e quem tem interesse no desfecho não valida o próprio
 * registro. Um critério diferente aqui faria a camada de cobertura discordar da
 * barra de verificação sobre a mesma bronca — e ninguém saberia qual olhar.
 */
const observacoesIndependentes = (report, atualizacoes) => {
  const interessados = new Set(
    [report?.author_id, report?.completed_by].filter(Boolean)
  );

  const porAutor = new Map();
  for (const u of lista(atualizacoes)) {
    if (!u?.author_id || u.status === 'rejected') continue;
    if (interessados.has(u.author_id)) continue;
    const quando = emMs(u.created_at);
    if (quando === null) continue;

    // Uma pessoa conta UMA vez, e vale a observação mais recente dela: a policy
    // de 7 dias permite reenviar, e sem isto duas linhas de um vizinho só
    // virariam "duas pessoas independentes".
    const anterior = porAutor.get(u.author_id);
    if (!anterior || quando > anterior.quando) {
      porAutor.set(u.author_id, { quando, afirmacao: AFIRMACAO[u.update_type] || null });
    }
  }

  return [...porAutor.values()];
};

/**
 * O que sabemos sobre este ponto agora.
 *
 * @param {object} args
 * @param {object} args.report
 * @param {Array}  [args.atualizacoes]
 * @param {Date}   [args.agora]
 * @returns {{
 *   estado:string, rotulo:string, curto:string, valor:number,
 *   revelarDepois:boolean, observacoesRecentes:number,
 *   diasDesdeUltima:number|null,
 * }}
 */
export const estadoDeRecencia = ({ report, atualizacoes = [], agora = new Date() } = {}) => {
  const observacoes = observacoesIndependentes(report, atualizacoes);
  const limite = agora.getTime() - JANELA_RECENCIA_DIAS * 86400000;

  const recentes = observacoes.filter((o) => o.quando >= limite);
  const ultima = observacoes.reduce((max, o) => Math.max(max, o.quando), 0);

  const diasDesdeUltima = ultima
    ? Math.floor((agora.getTime() - ultima) / 86400000)
    : null;

  const afirmacoes = new Set(recentes.map((o) => o.afirmacao).filter(Boolean));
  // "Persiste" e "acabou" na mesma janela é contradição. "Mudando" não
  // contradiz nenhum dos dois: uma obra em andamento é compatível tanto com o
  // problema ainda estar lá quanto com ele ter acabado logo depois.
  const contradiz = afirmacoes.has('persiste') && afirmacoes.has('acabou');

  const id = contradiz
    ? CONFLITO
    : recentes.length >= 2
    ? CONFIRMADO
    : recentes.length === 1
    ? UMA_OBSERVACAO
    : observacoes.length > 0
    ? VENCIDO
    : SEM_DADO;

  return {
    ...ESTADOS[id],
    estado: id,
    observacoesRecentes: recentes.length,
    diasDesdeUltima,
  };
};

/**
 * Até onde a caminhada do piloto alcança. Espelha `PILOTO.RAIO_M` em
 * `rotaDoDia.js`; é a escala em que a distância é medida aqui.
 */
const ALCANCE_A_PE_M = 800;

/**
 * Quanto vale visitar este ponto agora.
 *
 * Combina necessidade do dado com o custo de chegar — e a forma da combinação é
 * a decisão inteira.
 *
 * A PRIMEIRA VERSÃO DIVIDIA PELA DISTÂNCIA, E ESTAVA ERRADA
 *
 * "Valor por metro caminhado" parece a métrica óbvia e produz a rota que o
 * plano proíbe: com divisão linear, um ponto a 150 m que alguém já conferiu
 * vence um ponto a 600 m que ninguém nunca viu, porque 4× a distância exige 4×
 * o valor e a escala de necessidade não tem essa amplitude. O resultado é um
 * passeio pelo quarteirão — exatamente "o alvo mais próximo" com uma conta em
 * cima.
 *
 * Dentro de um raio de 800 m a pé, TODOS os candidatos cabem no orçamento de
 * meia hora. A distância não é uma barreira, é um desempate. Por isso ela
 * amortece o valor de forma suave em vez de dividi-lo: no ponto mais distante
 * do alcance, um alvo perde metade do peso, nunca 90%.
 *
 * O orçamento real do percurso continua sendo respeitado — mas por
 * `PILOTO.METROS_MAX` em `montarRota`, que é onde ele pertence: é uma
 * propriedade da rota inteira, não de cada ponto.
 *
 * Um ponto de valor zero continua valendo zero por perto: nenhum amortecimento
 * ressuscita um `confirmado`.
 *
 * @param {object} estado    saída de `estadoDeRecencia`
 * @param {number} distanciaM
 */
export const valorDaVisita = (estado, distanciaM) => {
  const valor = Number(estado?.valor) || 0;
  if (valor <= 0) return 0;

  const metros = Math.max(0, Number(distanciaM) || 0);
  return valor / (1 + metros / ALCANCE_A_PE_M);
};

/**
 * A frase da camada de cobertura, para o mapa e para o card.
 *
 * Nunca diz "região pouco patrulhada". O plano é explícito: ausência de
 * atividade não pode ser publicada como ausência de vigilância — numa cidade
 * pequena isso é um anúncio de onde ninguém está olhando.
 */
export const rotuloDeCobertura = (estado) => {
  if (!estado) return null;

  if (estado.estado === SEM_DADO) {
    return { texto: 'Ninguém conferiu isto ainda', tom: 'atencao' };
  }
  if (estado.estado === VENCIDO) {
    const dias = estado.diasDesdeUltima;
    return {
      texto: dias ? `Sem notícia há ${dias} dias` : 'A última notícia está velha',
      tom: 'atencao',
    };
  }
  if (estado.estado === CONFLITO) {
    return { texto: 'Relatos divergentes — em auditoria', tom: 'alerta' };
  }
  if (estado.estado === UMA_OBSERVACAO) {
    return { texto: 'Uma pessoa conferiu este mês', tom: 'neutro' };
  }
  return { texto: 'Confirmado por duas pessoas este mês', tom: 'ok' };
};
