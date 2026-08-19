// Regras de jogo do modo patrulha: sequência de dias e conquistas.
//
// Tudo aqui é função pura sobre números que o banco já tem. Nada de tabela de
// conquistas, coluna de streak ou job de desbloqueio — mesma escolha da
// migração 169 para o nível ("o nível NÃO é uma coluna gravada"). Mudar uma
// regra passa a ser mudar uma linha aqui, sem backfill e sem risco de o valor
// gravado divergir do que a regra diz hoje.

// ── Sequência de dias ─────────────────────────────────────────────────────────

/** Data local no formato AAAA-MM-DD, para comparar dias sem tropeçar em fuso. */
const chaveDoDia = (d) => {
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
export const CONQUISTAS = [
  {
    id: 'primeira_patrulha',
    nome: 'Primeira patrulha',
    descricao: 'Saiu a campo pela primeira vez',
    emoji: '🚩',
    alvo: 1,
    valor: (s) => s.patrols_count,
  },
  {
    id: 'confirmacoes_10',
    nome: 'Olho vivo',
    descricao: '10 broncas confirmadas',
    emoji: '👀',
    alvo: 10,
    valor: (s) => s.total_confirmed,
  },
  {
    id: 'confirmacoes_50',
    nome: 'Fiscal da cidade',
    descricao: '50 broncas confirmadas',
    emoji: '🛡️',
    alvo: 50,
    valor: (s) => s.total_confirmed,
  },
  {
    id: 'distancia_5km',
    nome: 'Pé na rua',
    descricao: '5 km patrulhados',
    emoji: '👟',
    alvo: 5000,
    valor: (s) => s.total_distance_meters,
    formatar: (v) => `${(v / 1000).toFixed(1).replace('.', ',')} km`,
  },
  {
    id: 'distancia_20km',
    nome: 'Maratonista cívico',
    descricao: '20 km patrulhados',
    emoji: '🏅',
    alvo: 20000,
    valor: (s) => s.total_distance_meters,
    formatar: (v) => `${(v / 1000).toFixed(1).replace('.', ',')} km`,
  },
  {
    id: 'sequencia_3',
    nome: 'Pegando o ritmo',
    descricao: '3 dias seguidos de patrulha',
    emoji: '🔥',
    alvo: 3,
    valor: (s) => s.sequencia,
  },
  {
    id: 'sequencia_7',
    nome: 'Semana completa',
    descricao: '7 dias seguidos de patrulha',
    emoji: '⚡',
    alvo: 7,
    valor: (s) => s.sequencia,
  },
  {
    id: 'passou_100',
    nome: 'Conhece cada esquina',
    descricao: 'Passou por 100 broncas',
    emoji: '🗺️',
    alvo: 100,
    valor: (s) => s.total_passed,
  },
];

const STATS_VAZIO = {
  patrols_count: 0,
  total_passed: 0,
  total_confirmed: 0,
  total_distance_meters: 0,
  total_duration_seconds: 0,
  sequencia: 0,
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

// ── Pontos ────────────────────────────────────────────────────────────────────

/**
 * Pontos que uma confirmação vale.
 *
 * Casado com a migração 169, onde `report_updates` vale 5 — e é exatamente uma
 * linha de `report_updates` que a confirmação cria. Mostrar outro número aqui
 * faria o "+X" da tela divergir do nível que o usuário vê depois.
 */
export const PONTOS_POR_CONFIRMACAO = 5;
