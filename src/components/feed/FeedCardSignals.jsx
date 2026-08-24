// Calcula os sinais de urgencia/engajamento de uma bronca.
// story e community sao consumidos pela tela de detalhe (Fase 2);
// o card exibe apenas o chip de maior prioridade (densidade enxuta).
export function computeSignals(report, { ageDays, ageHours }) {
  const isResolved = report.status === 'resolved';
  const support = Number(report.upvotes || 0);
  const comments = Number(report.comments_count || 0);
  const score = support * 2 + comments;
  const isLighting = report.category_id === 'iluminacao';
  const isOld = ageDays >= 7;

  const chips = [];

  if (!isResolved && (support >= 30 || score >= 70)) {
    chips.push({ key: 'exploding', variant: 'hot', label: 'Explodindo agora' });
  } else if (!isResolved && (support >= 12 || score >= 28)) {
    chips.push({ key: 'rising', variant: 'rising', label: 'Subindo' });
  }
  // Sem chip para bronca recente: o tempo ja aparece no cabecalho do card
  // ("ha 3h"), entao o chip "Agora" era informacao repetida.

  // Sem chip "Urgente": urgencia e um julgamento que o app fazia por conta
  // propria (recorrente / 14+ dias / 20+ apoios) e carimbava no card. O peso
  // do problema ja se le nos apoios, no tempo e no status.

  if (isResolved && ageHours <= 24) {
    chips.push({ key: 'resolvedToday', variant: 'hot', label: 'Resolvido hoje' });
  }

  // story e community continuam calculados aqui (fonte unica de verdade),
  // mas o FeedCard atual (densidade enxuta) nao os renderiza.
  let story = null;
  if (!isResolved && isOld) {
    story = isLighting
      ? `Essa rua está há ${ageDays} dias no escuro.`
      : `Esse problema está há ${ageDays} dias sem solução.`;
  } else if (!isResolved && support >= 30) {
    story = `Mais de ${support} pessoas já apoiaram.`;
  } else if (!isResolved && (support >= 10 || comments >= 5)) {
    story = `${support} apoios e ${comments} comentários — a comunidade está em cima.`;
  }

  let community = null;
  if (support > 0) {
    community = report.user_has_upvoted
      ? `Você e +${Math.max(0, support - 1)} pessoas apoiaram`
      : `${support} pessoas já apoiaram`;
  } else if (comments > 0) {
    community = `${comments} pessoas já comentaram`;
  }

  return { chips, story, community, score };
}
