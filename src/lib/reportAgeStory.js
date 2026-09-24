const TIPOS_SEM_RUA_ESCURA = new Set([
  'lamp_on_daytime',
  'arm_damaged',
  'exposed_wiring',
  'pole_leaning',
  'pole_broken',
  'no_identifier',
  'other',
]);

export const historiaDeTempoDaBronca = (report, ageDays) => {
  if (!report || report.status === 'resolved' || ageDays < 7) return null;
  const category = report.category_id || report.category;
  if (category === 'iluminacao') {
    return TIPOS_SEM_RUA_ESCURA.has(report.issue_type)
      ? `Esse problema de iluminação está há ${ageDays} dias sem solução.`
      : `Essa rua está há ${ageDays} dias no escuro.`;
  }
  const porCategoria = {
    buracos: `Esse buraco está há ${ageDays} dias na via.`,
    esgoto: `Esse esgoto está há ${ageDays} dias correndo.`,
    limpeza: `Esse ponto está há ${ageDays} dias sem limpeza.`,
    poda: `Essa árvore está há ${ageDays} dias esperando poda.`,
    'vazamento-de-agua': `Essa água está há ${ageDays} dias vazando.`,
  };
  return porCategoria[category] || `Esse problema está há ${ageDays} dias sem solução.`;
};
