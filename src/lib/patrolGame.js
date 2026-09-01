// Regras de jogo do modo patrulha: sequência de dias e conquistas.
//
// Tudo aqui é função pura sobre números que o banco já tem. Nada de tabela de
// conquistas, coluna de streak ou job de desbloqueio — mesma escolha da
// migração 169 para o nível ("o nível NÃO é uma coluna gravada"). Mudar uma
// regra passa a ser mudar uma linha aqui, sem backfill e sem risco de o valor
// gravado divergir do que a regra diz hoje.

// ── Sequência de dias ─────────────────────────────────────────────────────────

/**
 * Data local no formato AAAA-MM-DD, para comparar dias sem tropeçar em fuso.
 *
 * Uma string 'AAAA-MM-DD' é usada COMO ESTÁ, sem passar por `new Date`.
 *
 * É o que corrige um erro que quebrava a sequência de todo mundo um dia antes
 * da hora. `new Date('2026-08-18')` é lido como meia-noite UTC — que no Brasil
 * (UTC-3) é 21h do dia 17. `getDate()` devolvia 17, e a data que veio do banco
 * como dia 18 virava a chave '2026-08-17'. Como o dia de hoje vem de um `Date`
 * real, que não sofre esse deslocamento, os dois lados da comparação ficavam
 * desalinhados: quem patrulhou ontem aparecia como tendo patrulhado anteontem,
 * e a sequência zerava.
 *
 * A string já é uma data de calendário local — `get_patrol_days` faz
 * `(ended_at at time zone 'America/Sao_Paulo')::date` antes de devolver.
 * Reinterpretá-la como instante UTC é justamente desfazer essa conversão.
 */
const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Exportada desde as diárias (`dailies.js`): o sorteio precisa da MESMA chave
// de dia. Reusá-la não é economia de linhas — é a única forma de não repetir a
// armadilha de fuso que o comentário acima documenta, e que já quebrou a
// sequência de todo mundo uma vez.
export const chaveDoDia = (d) => {
  if (typeof d === 'string') {
    const inicio = d.slice(0, 10);
    if (SO_DATA.test(inicio)) return inicio;
  }
  const data = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(data.getTime())) return null;
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${dia}`;
};

const diaAnterior = (chave) => {
  const [a, m, d] = chave.split('-').map(Number);
  const data = new Date(a, m - 1, d);
  data.setDate(data.getDate() - 1);
  return chaveDoDia(data);
};

/**
 * Dias consecutivos de patrulha até hoje.
 *
 * Vale ter patrulhado hoje OU ontem: cortar a sequência à meia-noite puniria
 * quem patrulhou às 23h de ontem e ainda não saiu hoje — a sequência só quebra
 * quando um dia inteiro passa em branco.
 *
 * @param {Array<string|Date>} datas  dias com patrulha, em qualquer ordem
 * @param {Date} [hoje]
 */
export const calcularSequencia = (datas, hoje = new Date()) => {
  if (!Array.isArray(datas) || datas.length === 0) return 0;

  const dias = new Set(datas.map(chaveDoDia).filter(Boolean));
  if (dias.size === 0) return 0;

  const chaveHoje = chaveDoDia(hoje);
  let cursor = dias.has(chaveHoje) ? chaveHoje : diaAnterior(chaveHoje);
  if (!dias.has(cursor)) return 0;

  let total = 0;
  while (dias.has(cursor)) {
    total += 1;
    cursor = diaAnterior(cursor);
  }
  return total;
};

// ── Conquistas ────────────────────────────────────────────────────────────────

/**
 * Catálogo. Cada conquista diz qual número acompanhar e qual alvo atingir, em
 * vez de trazer sua própria função de desbloqueio: assim a barra de progresso
 * sai de graça e nenhuma conquista pode ficar "desbloqueada sem progresso".
 *
 * `valor` recebe `{ ...stats, sequencia }`.
 */
/**
 * Quanto vale cada etapa de missão vencida.
 *
 * Mais que registrar uma bronca (10) de propósito: a etapa exige VÁRIAS ações
 * do mesmo tipo, e o prêmio precisa reconhecer a insistência, não o ato isolado
 * — que já foi pago quando aconteceu.
 *
 * É bônus, não substituição: quem registra 3 broncas recebe os 30 das broncas
 * MAIS os 15 da etapa.
 *
 * MORA AQUI, E NÃO EM scoring.js, POR CAUSA DA ORDEM DOS IMPORTS
 *
 * `scoring.js` importa `missions.js`. Para a central de missões mostrar quanto
 * cada cartão rende, `missions.js` precisa deste número — e importá-lo de
 * scoring fecharia o ciclo. Aqui, ao lado de PONTOS, ele é o que sempre foi:
 * uma constante da tabela de pontuação. scoring.js reexporta.
 */
export const PONTOS_POR_ETAPA = 15;

// `contador` diz de qual número a medalha vive.
//
// É a mesma chave que as missões usam, e existe para ligar as duas tabelas sem
// nenhuma lista escrita à mão: a central de missões mostra, em cada cartão, as
// medalhas que aquela missão empurra. Acrescentar uma medalha sobre um contador
// que já existe a faz aparecer no cartão sozinha — que é justamente o que uma
// lista manual deixaria de fazer.
/**
 * Até onde uma pessoa erra sem deixar de ser confiável.
 *
 * 15%. Não é tolerância generosa: quem vai à rua em dúvida, fotografa no
 * contraluz e às vezes confunde a quadra faz parte do trabalho, e uma barra de
 * 2% premiaria só quem envia pouco e no lugar óbvio.
 *
 * O que a taxa exclui é outra coisa: quem responde em volume sem olhar. Aí a
 * recusa passa de um em seis, e a diferença é visível no primeiro mês de fila
 * de moderação.
 */
export const LIMITE_DE_RECUSA = 0.15;

/**
 * Quanto do que a pessoa enviou foi recusado.
 *
 * Sem envio nenhum, a taxa é zero — e é o valor certo: a medalha ainda exige as
 * 20 aceitas, então "0% de recusa em 0 envios" não desbloqueia nada. Devolver 1
 * aqui faria quem nunca enviou aparecer como pouco confiável.
 */
export const taxaDeRecusa = (s) => {
  const aceitas = Math.max(0, Number(s?.updates_aceitas) || 0);
  const recusadas = Math.max(0, Number(s?.updates_rejeitadas) || 0);
  const total = aceitas + recusadas;
  return total === 0 ? 0 : recusadas / total;
};

export const CONQUISTAS = [
  {
    id: 'primeira_patrulha',
    nome: 'Primeira patrulha',
    descricao: 'Saiu a campo pela primeira vez',
    emoji: '🚩',
    alvo: 1,
    valor: (s) => s.patrols_count,
    contador: 'patrols_count',
  },
  {
    id: 'confirmacoes_10',
    nome: 'Olho vivo',
    descricao: '10 broncas confirmadas',
    emoji: '👀',
    alvo: 10,
    valor: (s) => s.total_confirmed,
    contador: 'total_confirmed',
  },
  // "Fiscal da cidade" até a fase 4.
  //
  // A §36.16 do plano de gamificação pede para evitar títulos que sugiram
  // autoridade oficial ou vigilantismo, e cita "Fiscal" pelo nome. Não é
  // preciosismo de vocabulário: quem se lê como fiscal age como fiscal diante de
  // um vizinho, e o app não deu autoridade nenhuma a ninguém.
  //
  // O id não muda de propósito. Medalha é derivada (nada gravado), mas o id
  // aparece em `contador` de missões e em teste — e renomeá-lo não melhora nada
  // que o rótulo já não resolva.
  {
    id: 'confirmacoes_50',
    nome: 'Verificador',
    descricao: '50 broncas confirmadas',
    emoji: '🛡️',
    alvo: 50,
    valor: (s) => s.total_confirmed,
    contador: 'total_confirmed',
  },
  {
    id: 'distancia_5km',
    nome: 'Pé na rua',
    descricao: '5 km patrulhados',
    emoji: '👟',
    alvo: 5000,
    valor: (s) => s.total_distance_meters,
    contador: 'total_distance_meters',
    formatar: (v) => `${(v / 1000).toFixed(1).replace('.', ',')} km`,
  },
  {
    id: 'distancia_20km',
    nome: 'Maratonista cívico',
    descricao: '20 km patrulhados',
    emoji: '🏅',
    alvo: 20000,
    valor: (s) => s.total_distance_meters,
    contador: 'total_distance_meters',
    formatar: (v) => `${(v / 1000).toFixed(1).replace('.', ',')} km`,
  },
  {
    id: 'sequencia_3',
    nome: 'Pegando o ritmo',
    descricao: '3 dias seguidos de patrulha',
    emoji: '🔥',
    alvo: 3,
    valor: (s) => s.sequencia,
    contador: 'sequencia',
  },
  {
    id: 'sequencia_7',
    nome: 'Semana completa',
    descricao: '7 dias seguidos de patrulha',
    emoji: '⚡',
    alvo: 7,
    valor: (s) => s.sequencia,
    contador: 'sequencia',
  },
  {
    id: 'passou_100',
    nome: 'Conhece cada esquina',
    descricao: 'Passou por 100 broncas',
    emoji: '🗺️',
    alvo: 100,
    valor: (s) => s.total_passed,
    contador: 'total_passed',
  },
  // ── Sinalização e missões ──
  //
  // A conta de pontos vive no banco (migração 174); aqui só os marcos. Repetir
  // os valores dos pontos nestas medalhas criaria dois lugares para mudar a
  // mesma regra.
  {
    id: 'primeiro_sinal',
    nome: 'Olho na rua',
    descricao: 'Sinalizou seu primeiro problema',
    emoji: '📌',
    alvo: 1,
    valor: (s) => s.signals_count,
    contador: 'signals_count',
  },
  {
    id: 'sinais_10',
    nome: 'Olheiro',
    descricao: '10 problemas sinalizados',
    emoji: '🔎',
    alvo: 10,
    valor: (s) => s.signals_count,
    contador: 'signals_count',
  },
  {
    id: 'primeira_missao',
    nome: 'Atendeu ao chamado',
    descricao: 'Completou a missão de outra pessoa',
    emoji: '🎯',
    alvo: 1,
    valor: (s) => s.missions_count,
    contador: 'missions_count',
  },
  {
    id: 'missoes_10',
    nome: 'Caçador de missões',
    descricao: '10 missões cumpridas',
    emoji: '🏹',
    alvo: 10,
    valor: (s) => s.missions_count,
    contador: 'missions_count',
  },

  // ── Bairro ──
  //
  // Contam a janela móvel de 90 dias, igual aos títulos: uma medalha de bairro
  // fala do que a pessoa vem fazendo, não do que fez uma vez em 2024.
  // "Dono da rua" até a fase 4.
  //
  // O princípio 6 do produto é "ninguém é dono de rua, bairro ou prioridade
  // pública", e a §36.16 pede que se evitem termos de posse sobre território. A
  // medalha dizia exatamente o contrário do princípio — e era a única do
  // catálogo que premiava a ideia que a fase 3 substituiu por camada de
  // necessidade.
  {
    id: 'dono_da_rua',
    nome: 'Presença no bairro',
    descricao: '20 ações no mesmo bairro',
    emoji: '🏘️',
    alvo: 20,
    valor: (s) => s.acoes_no_melhor,
  },
  {
    id: 'explorador',
    nome: 'Explorador',
    descricao: 'Agiu em 5 bairros diferentes',
    emoji: '🧭',
    alvo: 5,
    valor: (s) => s.bairros_ativos,
  },
  {
    id: 'lider_de_bairro',
    nome: 'Primeiro lugar',
    descricao: 'Lidera o placar de um bairro',
    emoji: '👑',
    alvo: 1,
    valor: (s) => s.bairros_liderados,
  },

  // ── Qualidade e mentoria (fase 4) ──
  //
  // As medalhas acima contam VOLUME: quantas patrulhas, quantos quilômetros,
  // quantas confirmações. Volume é o que o produto sabia medir, e é o que
  // produziu a dívida de incentivo que a §36.5 manda auditar — "apoie 5",
  // "comente 2", "sinalize 3" são fáceis de contar e fáceis de fazer mal.
  //
  // Estas contam se o volume PRESTOU. Vêm de `get_quality_counters` (migração
  // 214), e é a diferença entre reconhecer quem apareceu e reconhecer quem
  // ajudou.
  //
  // NENHUMA DELAS DÁ VANTAGEM
  //
  // Progressão social LEVE (§36.14): reconhecimento sem moeda, marco sem
  // vantagem. Uma medalha de qualidade que desse XP extra viraria mais uma
  // forma de acumular — e a fase 4 existe justamente para reconhecer sem
  // acumular.
  {
    id: 'observacao_confiavel',
    nome: 'Observação confiável',
    descricao: '20 atualizações aceitas, com poucas recusas',
    emoji: '🎖️',
    alvo: 20,
    familia: 'qualidade',
    // A taxa é o ponto. "20 aceitas" sozinho também descreve quem mandou 400 e
    // teve 380 recusadas — e premiar isso seria premiar o volume outra vez, com
    // nome de qualidade.
    valor: (s) => (taxaDeRecusa(s) <= LIMITE_DE_RECUSA ? s.updates_aceitas : 0),
    contador: 'updates_aceitas',
  },
  {
    id: 'cartografo',
    nome: 'Cartógrafo',
    descricao: '5 sugestões de rua aprovadas',
    emoji: '🗺️',
    alvo: 5,
    familia: 'qualidade',
    valor: (s) => s.sugestoes_aprovadas,
    contador: 'sugestoes_aprovadas',
  },
  {
    id: 'deu_forca',
    nome: 'Deu força',
    descricao: 'Fez a contribuição de 3 pessoas valer',
    emoji: '🤝',
    alvo: 3,
    familia: 'mentoria',
    // Pessoas distintas, não ações: ajudar dez vezes a mesma pessoa é outra
    // coisa, e contar ações faria a medalha de mentoria virar mais uma medalha
    // de volume.
    valor: (s) => s.pessoas_ajudadas,
    contador: 'pessoas_ajudadas',
  },
  {
    id: 'rede_de_apoio',
    nome: 'Rede de apoio',
    descricao: 'Fez a contribuição de 15 pessoas valer',
    emoji: '🫱',
    alvo: 15,
    familia: 'mentoria',
    valor: (s) => s.pessoas_ajudadas,
    contador: 'pessoas_ajudadas',
  },
];

const STATS_VAZIO = {
  patrols_count: 0,
  total_passed: 0,
  total_confirmed: 0,
  total_distance_meters: 0,
  total_duration_seconds: 0,
  sequencia: 0,
  // Vêm de get_mission_counters e get_neighborhood_standing, não só da linha da
  // patrulha: uma medalha conta o que a pessoa fez, tenha sido dentro do modo
  // patrulha ou não.
  signals_count: 0,
  missions_count: 0,
  bairros_ativos: 0,
  bairros_liderados: 0,
  acoes_no_melhor: 0,
  // Qualidade e mentoria (fase 4). Vêm de `get_quality_counters`, que é outra
  // chamada — zerados aqui para que a medalha apareça bloqueada, e não quebre,
  // quando a 214 ainda não tiver sido aplicada.
  updates_aceitas: 0,
  updates_rejeitadas: 0,
  sugestoes_aprovadas: 0,
  pessoas_ajudadas: 0,
};

/**
 * Estado de cada conquista para os totais dados.
 *
 * @returns {Array<{id, nome, descricao, emoji, desbloqueada, atual, alvo, progresso, rotulo}>}
 *          `progresso` é 0-1; `rotulo` já vem formatado para exibir.
 */
export const avaliarConquistas = (stats) => {
  const s = { ...STATS_VAZIO, ...(stats || {}) };
  return CONQUISTAS.map((c) => {
    const atual = Math.max(0, Number(c.valor(s)) || 0);
    const formatar = c.formatar || ((v) => String(v));
    return {
      id: c.id,
      nome: c.nome,
      descricao: c.descricao,
      emoji: c.emoji,
      // 'campo' é o default para as medalhas que já existiam. Serve para a tela
      // agrupar qualidade e mentoria separadas de volume — que é a distinção
      // inteira da fase 4.
      familia: c.familia || 'campo',
      atual,
      alvo: c.alvo,
      desbloqueada: atual >= c.alvo,
      progresso: Math.min(1, atual / c.alvo),
      rotulo: `${formatar(Math.min(atual, c.alvo))} / ${formatar(c.alvo)}`,
    };
  });
};

/**
 * Conquistas que passaram de bloqueada para desbloqueada entre dois momentos.
 * É o que a tela de fim de patrulha comemora — sem isso, uma medalha antiga
 * apareceria como novidade a cada patrulha.
 */
export const conquistasNovas = (statsAntes, statsDepois) => {
  const antes = new Set(
    avaliarConquistas(statsAntes).filter((c) => c.desbloqueada).map((c) => c.id)
  );
  return avaliarConquistas(statsDepois).filter((c) => c.desbloqueada && !antes.has(c.id));
};

// ── Títulos de bairro ─────────────────────────────────────────────────────────

/**
 * Pontos de cada ação, para a interface antecipar o "+X" antes da resposta do
 * servidor.
 *
 * A conta que vale é a da migração 174 — esta tabela é uma cópia, e cópia
 * diverge. Manter as duas em dia é obrigação de quem mexer na regra; mostrar um
 * número aqui diferente do nível que o usuário vê depois é pior que não mostrar
 * número nenhum.
 */
export const PONTOS = {
  bronca: 10,
  missao: 12,
  sinal: 3,
  /**
   * Ir ao ponto e confirmar que NAO ha nada ali.
   *
   * Vale o mesmo que sinalizar, e pela mesma razão: é a mesma ida ao local, um
   * toque, sem foto. Valia zero — e valer zero ao lado de um botão que paga 12
   * fazia a única resposta honesta ("já taparam o buraco") ser a única que não
   * rende nada. O incentivo apontava para inventar bronca onde não há.
   *
   * Espelha a migração 190, nos dois lugares em que ela soma.
   */
  vistoria: 3,
  atualizacao: 5,
  comentario: 2,
  apoio: 1,
};

/**
 * Pontos que uma confirmação vale — uma linha de `report_updates`.
 * @deprecated Use `PONTOS.atualizacao`.
 */
export const PONTOS_POR_CONFIRMACAO = PONTOS.atualizacao;

/**
 * Faixas de título por posição no bairro.
 *
 * A ordem importa: a primeira faixa que couber ganha.
 */
const FAIXAS_DE_TITULO = [
  { ate: 1, nome: 'Guardião', emoji: '👑' },
  { ate: 3, nome: 'Vigia', emoji: '🛡️' },
  { ate: 10, nome: 'Olheiro', emoji: '👁️' },
];

/**
 * Título do usuário num bairro, a partir da posição no placar de 90 dias.
 *
 * Sozinho no bairro não vira "Guardião": liderar um placar de um participante
 * não é liderar nada, e o título perderia o sentido justamente para quem o
 * exibisse primeiro. Vira "Pioneiro", que é o que de fato aconteceu — e some
 * assim que aparece companhia, dando lugar à disputa de verdade.
 *
 * @param {{neighborhood:string, posicao:number, participantes:number}} lugar
 * @returns {{id:string, titulo:string, emoji:string, bairro:string}|null}
 */
export const tituloDoBairro = (lugar) => {
  if (!lugar?.neighborhood) return null;

  const posicao = Number(lugar.posicao);
  const participantes = Number(lugar.participantes);
  if (!Number.isFinite(posicao) || posicao < 1) return null;

  if (participantes <= 1) {
    return {
      id: 'pioneiro',
      titulo: `Pioneiro de ${lugar.neighborhood}`,
      emoji: '🚩',
      bairro: lugar.neighborhood,
    };
  }

  const faixa = FAIXAS_DE_TITULO.find((f) => posicao <= f.ate);
  if (!faixa) return null;

  return {
    id: faixa.nome.toLowerCase(),
    titulo: `${faixa.nome} de ${lugar.neighborhood}`,
    emoji: faixa.emoji,
    bairro: lugar.neighborhood,
  };
};

/**
 * Todos os títulos do usuário, do bairro mais forte para o mais fraco.
 * @param {Array} lugares  saída de `get_neighborhood_standing`
 */
export const titulosDeBairro = (lugares) =>
  (lugares || []).map(tituloDoBairro).filter(Boolean);

/**
 * Quanto falta para subir de faixa no bairro — o texto que puxa de volta.
 *
 * Devolve null quando já se lidera, e quando não há placar nenhum.
 *
 * @param {{posicao:number, pontos:number, participantes:number}} meu
 * @param {Array<{pontos:number, posicao:number}>} placar  do bairro, ordenado
 */
export const faltaParaSubir = (meu, placar) => {
  if (!meu || !Array.isArray(placar) || placar.length === 0) return null;
  const posicao = Number(meu.posicao);
  if (!Number.isFinite(posicao) || posicao <= 1) return null;

  // O alvo é quem está imediatamente à frente, não o líder: a meta precisa
  // parecer alcançável para mover alguém.
  const acima = placar.find((p) => Number(p.posicao) === posicao - 1)
    ?? placar.find((p) => Number(p.posicao) < posicao);
  if (!acima) return null;

  const diferenca = Math.max(0, Number(acima.pontos) - Number(meu.pontos));
  return { pontos: diferenca + 1, posicaoAlvo: Number(acima.posicao) };
};

/**
 * Resumo dos bairros do usuário, para as medalhas.
 *
 * Deriva de `get_neighborhood_standing`, em vez de existir como RPC própria.
 * O banco já devolve a lista completa — pontos, ações, posição e participantes
 * por bairro — e somar `length` disso no servidor seria uma segunda consulta
 * para responder o que a primeira já respondeu.
 *
 * @param {Array<{neighborhood:string,pontos:number,acoes:number,posicao:number}>} lugares
 */
export const resumoDeBairros = (lugares) => {
  const lista = Array.isArray(lugares) ? lugares : [];
  // O "melhor bairro" é o de mais pontos, não o de mais ações: é ele que dá o
  // título que a pessoa exibe, e as duas medidas divergem quando alguém cumpre
  // poucas missões (12 pontos cada) num bairro e sinaliza muito (3) noutro.
  const melhor = lista.reduce(
    (a, b) => (a && Number(a.pontos) >= Number(b.pontos) ? a : b),
    null
  );

  return {
    bairros_ativos: lista.length,
    bairros_liderados: lista.filter((l) => Number(l.posicao) === 1).length,
    acoes_no_melhor: Number(melhor?.acoes) || 0,
    melhor_bairro: melhor?.neighborhood || null,
  };
};

// ── Vale guardar? ─────────────────────────────────────────────────────────────

/**
 * Abaixo disto a saída não foi uma patrulha.
 *
 * Dois minutos é o tempo de abrir o modo por engano, olhar e sair. E 150 m é
 * curto o bastante para caber num quarteirão — quem "patrulhou" sem sair do
 * lugar deixou o app aberto, não fiscalizou nada.
 */
export const PATRULHA_CURTA = {
  duracaoS: 120,
  distanciaM: 150,
};

/**
 * O que fazer com a patrulha que acabou de terminar.
 *
 * O app gravava TODAS, inclusive a de trinta segundos aberta sem querer. O
 * histórico enchia de linhas vazias, e cada uma delas contava como "patrulha"
 * nas conquistas — a medalha de primeira patrulha caía sem ninguém ter
 * patrulhado.
 *
 * A REGRA
 *
 * Houve ação? Guarda, e nem pergunta. Confirmar uma bronca, sinalizar, registrar
 * ou cumprir missão é o que a patrulha existe para produzir; uma saída de um
 * minuto que rendeu uma bronca vale mais que uma hora de carro sem nada.
 *
 * Sem ação nenhuma, aí sim o tamanho decide — e "pequena" é curta OU parada,
 * não as duas: dez minutos no mesmo lugar produziram tanto quanto trinta
 * segundos.
 *
 * Sugerir não é impor: quem quiser guardar a saída de trinta segundos guarda.
 * A tela só inverte o destaque e diz por quê.
 *
 * @param {{duracaoS:number, distanciaM:number, contagens:object, feitos:object}} sessao
 * @returns {{houveAcao:boolean, descartavel:boolean, motivo:string|null}}
 */
export const avaliarPatrulha = ({ duracaoS, distanciaM, contagens, feitos } = {}) => {
  const acoes =
    (contagens?.confirmadas || 0) +
    (feitos?.sinais || 0) +
    (feitos?.missoes || 0) +
    (feitos?.broncas || 0);

  if (acoes > 0) {
    return { houveAcao: true, descartavel: false, motivo: null };
  }

  const curta = (duracaoS || 0) < PATRULHA_CURTA.duracaoS;
  const parada = (distanciaM || 0) < PATRULHA_CURTA.distanciaM;

  if (!curta && !parada) {
    return { houveAcao: false, descartavel: false, motivo: null };
  }

  return {
    houveAcao: false,
    descartavel: true,
    motivo: curta ? 'curta' : 'parada',
  };
};
