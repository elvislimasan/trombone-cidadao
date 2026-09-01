// Missões diárias.
//
// O QUE FALTAVA
//
// As missões de `missions.js` são permanentes: "investigue 25 buracos" não é um
// motivo para abrir o app numa terça à noite. E sair em patrulha exige uma
// decisão consciente que a maioria nunca toma — ninguém acorda pensando "vou
// patrulhar 40 minutos".
//
// Três diárias resolvem os dois: dão um objetivo que cabe num dia, e uma delas
// — a de campo — transforma "sair sem rumo" num percurso com começo e fim.
//
// NENHUMA TABELA DE DIÁRIAS, NENHUM JOB NOTURNO
//
// O sorteio é determinístico e derivado: mesma pessoa, mesmo dia, mesma saída.
// Não há o que gravar quando a regra reproduz o resultado — e é o que evita o
// job da meia-noite, o backfill e a divergência entre o que foi sorteado e o
// que a regra de hoje sortearia.
//
// O que É gravado é o fato de ter concluído (`daily_completions`), porque isso
// não é valor derivado de regra: é acontecimento, da mesma natureza de
// `patrols` e `reports`, e não fica errado quando a meta de amanhã for outra.

import { chaveDoDia } from './patrolGame.js';

/**
 * Os tipos, e a cota. Uma de cada, nesta ordem.
 *
 * A cota é o que impede o sorteio de dar três diárias de comunidade num dia —
 * o que produziria um dia inteiro de apoiar e comentar, sem ninguém indo à rua.
 */
export const TIPOS = ['campo', 'registro', 'comunidade'];

/**
 * Quanto vale fechar uma diária, e quanto vale fechar as três.
 *
 * Moram aqui, e não em `patrolGame.js` junto de PONTOS, porque só as diárias os
 * usam — e `scoring.js` já importa este arquivo para somá-los.
 */
export const PONTOS_DIARIA = 10;
export const PONTOS_DIA_PERFEITO = 25;

/**
 * O catálogo.
 *
 * `meta` fica entre 2 e 5 de propósito: tem que caber num dia. Uma meta de 10
 * vira uma diária que ninguém fecha, e uma diária que ninguém fecha deixa de
 * ser lida no dia seguinte.
 *
 * `valor` lê os contadores DO DIA (`get_mission_counters(user, p_desde)`), não
 * os de sempre. É a diferença entre "confirme 3 broncas hoje" e "confirme 3
 * broncas na vida", que a pessoa provavelmente já fez.
 */
// A ROTA DO DIA NÃO É UMA QUARTA DIÁRIA — É COMO SE CUMPRE A DE CAMPO
//
// A nota anterior aqui dizia que a Rota entraria como terceira opção de
// 'campo' quando a tela existisse. A tela existe agora (fase 2), e a decisão
// mudou por dois motivos que só ficaram visíveis ao construí-la.
//
// O primeiro é de contagem. Uma diária "conclua a Rota do Dia" precisaria de um
// contador de rotas no servidor, porque `complete_daily` recalcula a meta e
// recusa o que não sabe conferir (é a proteção da 205 contra bônus fabricado).
// Esse contador não existe — e criá-lo significaria gravar a rota, que não é
// uma linha em lugar nenhum: ela é montada ao abrir, a partir do estado do
// mundo naquele instante.
//
// O segundo é de honestidade do placar. A rota é feita de confirmações em
// campo, que já pagam pela diária `confirmar_campo`. Somar as duas pagaria duas
// vezes a mesma ida à rua — e inflar XP por reembalar a mesma ação é
// exatamente o tipo de dívida de incentivo que a §36.5 manda auditar.
//
// Então a diária continua dizendo QUANTO, e a Rota passa a dizer ONDE. É o que
// a fase 2 pede: reduzir a decisão de "o que eu faço agora?".

export const DIARIAS = [
  // ── Campo ──
  {
    id: 'confirmar_campo',
    tipo: 'campo',
    titulo: 'Confirme 3 broncas na rua',
    descricao: 'Responda se o problema continua lá',
    icone: '✅',
    meta: 3,
    valor: (c) => c.updates_count ?? 0,
    // Aponta para a rota, não para a patrulha livre: "sair em patrulha" devolve
    // a pessoa exatamente à decisão que ela não sabia tomar.
    acao: { rotulo: 'Ver a rota de hoje', para: '/rota-do-dia' },
    xp: PONTOS_DIARIA,
    exige: 'broncas',
  },
  {
    id: 'conferir_marcados',
    tipo: 'campo',
    titulo: 'Confira 2 pontos marcados',
    descricao: 'Vá até um sinal e diga se há problema ou não',
    icone: '🔍',
    meta: 2,
    valor: (c) => (c.missions_count ?? 0) + (c.empties_count ?? 0),
    acao: { rotulo: 'Conferir', para: '/conferir' },
    xp: PONTOS_DIARIA,
    exige: 'sinais',
  },

  // ── Registro ──
  {
    id: 'registrar_bronca',
    tipo: 'registro',
    titulo: 'Registre 1 bronca completa',
    descricao: 'Com foto, local e descrição',
    icone: '📣',
    meta: 1,
    valor: (c) => c.reports_count ?? 0,
    acao: { rotulo: 'Cadastrar bronca', para: '/?criar_bronca=1' },
    xp: PONTOS_DIARIA,
  },
  {
    id: 'sinalizar_rapido',
    tipo: 'registro',
    titulo: 'Sinalize 3 problemas',
    descricao: 'Um toque no que você vê passando',
    icone: '🚩',
    meta: 3,
    valor: (c) => c.signals_count ?? 0,
    acao: { rotulo: 'Sair em patrulha', para: '/patrulhar' },
    xp: PONTOS_DIARIA,
  },

  // ── Comunidade ──
  //
  // Não precisam de guarda: apoiar, comentar e compartilhar sempre têm alvo
  // enquanto houver feed.
  {
    id: 'apoiar_broncas',
    tipo: 'comunidade',
    titulo: 'Apoie 5 broncas',
    descricao: 'Bronca com apoio sobe na fila da prefeitura',
    icone: '👍',
    meta: 5,
    valor: (c) => c.upvotes_given ?? 0,
    acao: { rotulo: 'Ver broncas', para: '/' },
    xp: PONTOS_DIARIA,
  },
  {
    id: 'comentar_broncas',
    tipo: 'comunidade',
    titulo: 'Comente em 2 broncas',
    descricao: 'Conte o que você sabe sobre o problema',
    icone: '💬',
    meta: 2,
    valor: (c) => c.comments_count ?? 0,
    acao: { rotulo: 'Ver broncas', para: '/' },
    xp: PONTOS_DIARIA,
  },
  {
    id: 'compartilhar_bronca',
    tipo: 'comunidade',
    titulo: 'Compartilhe 2 broncas',
    descricao: 'Leve o problema para fora do app',
    icone: '📤',
    meta: 2,
    valor: (c) => c.shares_count ?? 0,
    acao: { rotulo: 'Ver broncas', para: '/' },
    xp: PONTOS_DIARIA,
  },
];

/** Tipo persistente de uma diária; `null` para ids antigos ou adulterados. */
export const tipoDaDiaria = (dailyId) =>
  DIARIAS.find((diaria) => diaria.id === dailyId)?.tipo ?? null;

// ── O sorteio ─────────────────────────────────────────────────────────────────
//
// xmur3 + mulberry32: duas funções curtas, sem dependência, que produzem uma
// sequência estável a partir de uma string. É o que torna a tabela de diárias
// desnecessária — a mesma entrada sempre reproduz a mesma saída, em qualquer
// dispositivo e sem consultar nada.

/** Hash de string para semente de 32 bits. */
const xmur3 = (str) => {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
};

/** PRNG determinístico de 32 bits. */
const mulberry32 = (a) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/**
 * As três diárias de uma pessoa num dia.
 *
 * @param {string} userId
 * @param {Date|string} [hoje]
 * @param {object} [opts]
 * @param {boolean} [opts.temBroncas=true]  há bronca aberta ao alcance?
 * @param {boolean} [opts.temSinais=true]   há sinal pendente ao alcance?
 * @param {boolean} [opts.temAlvos]         atalho: falso zera as duas acima
 *
 * A GUARDA CONTRA DIÁRIA IMPOSSÍVEL, AGORA LIGADA
 *
 * Sortear "confira 2 pontos marcados" numa cidade sem nenhum sinal pendente
 * queima o dia da pessoa por acidente — ela abre, tenta, não encontra nada, e
 * aprende que a diária mente. Quando não há alvos, o sorteio cai para a
 * alternativa do mesmo tipo que não exige nenhum.
 *
 * A guarda existia desde a 200 e nunca recebeu um valor: `temAlvos` tinha
 * default `true` e nenhum chamador o informava. Estava escrita e desligada. A
 * fase 2 a liga com `alvos_por_perto` (migração 212).
 *
 * DUAS PERGUNTAS, NÃO UMA
 *
 * "Confirmar broncas na rua" precisa de bronca; "conferir pontos marcados"
 * precisa de sinal. Um booleano único faria a segunda ser sorteada por causa da
 * primeira — e é justamente numa cidade nova, cheia de bronca e sem nenhum
 * sinal, que o erro apareceria.
 *
 * Se NENHUMA opção do tipo servir, o tipo simplesmente não entra — dois cartões
 * honestos valem mais que três, um dos quais impossível.
 */
export const sortearDiarias = (userId, hoje = new Date(), opts = {}) => {
  const semAlvos = opts.temAlvos === false;
  const disponivel = {
    broncas: !semAlvos && opts.temBroncas !== false,
    sinais: !semAlvos && opts.temSinais !== false,
  };

  const dia = chaveDoDia(hoje);
  if (!userId || !dia) return [];

  const semente = xmur3(`${userId}|${dia}`);
  const rand = mulberry32(semente());

  return TIPOS.map((tipo) => {
    const candidatas = DIARIAS.filter(
      (d) => d.tipo === tipo && (!d.exige || disponivel[d.exige])
    );
    if (candidatas.length === 0) return null;
    return candidatas[Math.floor(rand() * candidatas.length)];
  }).filter(Boolean);
};

/**
 * Estado das diárias de hoje, pronto para a tela.
 *
 * @param {string} userId
 * @param {object} contadoresHoje  saída de get_mission_counters(user, meia-noite)
 * @param {Set<string>|Array<string>} [concluidasHoje]  ids já gravados
 * @param {Date} [hoje]
 * @param {object} [opts]
 */
export const diariasDeHoje = (
  userId,
  contadoresHoje,
  concluidasHoje = [],
  hoje = new Date(),
  opts = {}
) => {
  const c = contadoresHoje || {};
  const gravadas =
    concluidasHoje instanceof Set ? concluidasHoje : new Set(concluidasHoje || []);
  // A RPC autoritativa aceita no máximo uma conclusão de cada tipo por dia.
  // Se o catálogo mudar e o sorteio trocar a opção, a conclusão já conquistada
  // continua valendo para o tipo em vez de reaparecer como tarefa pendente.
  const tiposGravados = new Set([...gravadas].map(tipoDaDiaria).filter(Boolean));

  return sortearDiarias(userId, hoje, opts).map((d) => {
    const atual = Math.max(0, Number(d.valor(c)) || 0);
    // A linha gravada vence a contagem: uma diária concluída às 10h continua
    // concluída às 23h, mesmo que o contador do dia seja recalculado.
    const gravada = gravadas.has(d.id) || tiposGravados.has(d.tipo);
    const completa = gravada || atual >= d.meta;

    return {
      id: d.id,
      tipo: d.tipo,
      titulo: d.titulo,
      descricao: d.descricao,
      icone: d.icone,
      meta: d.meta,
      acao: d.acao,
      xp: d.xp,
      atual: Math.min(atual, d.meta),
      faltam: Math.max(0, d.meta - atual),
      completa,
      gravada,
      progresso: completa ? 1 : Math.min(1, atual / d.meta),
      rotulo: `${Math.min(atual, d.meta)} / ${d.meta}`,
    };
  });
};

/** Quantas fechadas e se o dia foi perfeito. */
export const resumoDoDia = (diarias) => {
  const lista = Array.isArray(diarias) ? diarias : [];
  const concluidas = lista.filter((d) => d.completa).length;
  return {
    concluidas,
    total: lista.length,
    perfeito: lista.length > 0 && concluidas === lista.length,
    rotulo: `${concluidas}/${lista.length}`,
  };
};

/**
 * Quanto tempo resta do dia, para o cartão.
 *
 * Diárias expiram à meia-noite local. O relógio é o que transforma a lista em
 * convite — sem ele, "3 diárias" é só mais uma lista de pendências.
 */
export const restaDoDia = (agora = new Date()) => {
  const fim = new Date(agora);
  fim.setHours(24, 0, 0, 0);
  const ms = Math.max(0, fim.getTime() - agora.getTime());
  const horas = Math.floor(ms / 3600000);
  const minutos = Math.floor((ms % 3600000) / 60000);

  return {
    ms,
    horas,
    minutos,
    rotulo: horas > 0 ? `${horas}h restantes` : `${minutos} min restantes`,
  };
};
