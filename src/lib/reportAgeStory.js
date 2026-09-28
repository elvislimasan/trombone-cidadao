export function reportAgeStoryFor(category, issueType, ageDays) {
  const days = Math.max(0, Math.floor(Number(ageDays) || 0));
  if (days < 7) return null;
  if (category === 'iluminacao') {
    if (issueType === 'lamp_on_daytime') return `Este poste está há ${days} dias aceso durante o dia.`;
    if (['lamp_off', 'lamp_blinking', 'no_lighting'].includes(issueType)) return `Essa rua está há ${days} dias no escuro.`;
    return `Esse problema de iluminação está há ${days} dias sem solução.`;
  }
  const messages = {
    buracos: `Esse buraco está há ${days} dias na via.`,
    esgoto: `Esse problema de esgoto está há ${days} dias sem solução.`,
    limpeza: `Esse ponto está há ${days} dias sem limpeza.`,
    poda: `Essa árvore está há ${days} dias esperando poda.`,
    'vazamento-de-agua': `Essa água está há ${days} dias vazando.`,
  };
  return messages[category] || `Esse problema está há ${days} dias sem solução.`;
}
