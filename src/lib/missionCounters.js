// Adapta a linha de `get_mission_counters` para as regras JavaScript.
//
// A RPC fala snake_case; o catálogo de missões usa dois mapas em camelCase.
// Todas as telas precisam fazer a MESMA tradução antes de chamar `placar`,
// `missoesPorTrilha` ou `avaliarConquistas`. Manter três cópias foi o que fez
// diárias e bônus por categoria aparecerem num placar e sumirem em outro.

export const normalizarContadoresDeMissao = (linha) => {
  const origem = linha && typeof linha === 'object' ? linha : {};

  return {
    // Preserva colunas novas da RPC por padrão. Os fallbacks abaixo dão forma
    // estável às regras conhecidas sem obrigar toda migração a atualizar este
    // arquivo no mesmo minuto.
    ...origem,
    reports_count: origem.reports_count ?? 0,
    updates_count: origem.updates_count ?? 0,
    total_passed: origem.total_passed ?? 0,
    bairros_ativos: origem.bairros_ativos ?? 0,
    bairros_liderados: origem.bairros_liderados ?? 0,
    acoes_no_melhor: origem.acoes_no_melhor ?? 0,
    patrol_days: origem.patrol_days ?? [],
    comments_count: origem.comments_count ?? 0,
    upvotes_given: origem.upvotes_given ?? 0,
    signals_count: origem.signals_count ?? 0,
    missions_count: origem.missions_count ?? 0,
    patrols_count: origem.patrols_count ?? 0,
    total_confirmed: origem.total_confirmed ?? 0,
    total_distance_meters: origem.total_distance_meters ?? 0,
    shares_count: origem.shares_count ?? 0,
    empties_count: origem.empties_count ?? 0,
    audits_count: origem.audits_count ?? 0,
    dailies_completed: origem.dailies_completed ?? 0,
    perfect_days: origem.perfect_days ?? 0,
    confirmadasPorCategoria:
      origem.confirmadasPorCategoria ?? origem.confirmed_by_category ?? {},
    registradasPorCategoria:
      origem.registradasPorCategoria ?? origem.reported_by_category ?? {},
    resolvidas_autor: origem.resolvidas_autor ?? 0,
    resolvidas_missao: origem.resolvidas_missao ?? 0,
    resolvidas_sinal: origem.resolvidas_sinal ?? 0,
    resolvidas_confirmadas: origem.resolvidas_confirmadas ?? 0,
    resolvidas_comentadas: origem.resolvidas_comentadas ?? 0,
    resolvidas_apoiadas: origem.resolvidas_apoiadas ?? 0,
    resolvidas_total: origem.resolvidas_total ?? 0,
  };
};
