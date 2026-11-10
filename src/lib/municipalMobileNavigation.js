// Recebe somente a navegação já filtrada por municipalRouteAllowed e papel.
// O catálogo completo continua no menu; os atalhos priorizam o uso diário.
const priorities = [
  ['/prefeitura/visao-geral', 'Resumo'],
  ['/prefeitura/broncas', 'Solicitações'],
  ['/prefeitura/demandas', 'Ordens'],
  ['/prefeitura/gestao-territorial', null],
  ['/prefeitura/adote-uma-arvore', 'Árvores'],
  ['/prefeitura/iluminacao', 'Iluminação'],
];

export function municipalMobileNavigation(visibleNavigation) {
  return priorities.flatMap(([to, shortLabel]) => {
    const item = visibleNavigation.find(entry => entry.to === to);
    return item ? [{ ...item, shortLabel: shortLabel || item.label }] : [];
  }).slice(0, 3);
}

export function municipalNavigationActive(to, pathname) {
  return pathname === to || pathname.startsWith(`${to}/`)
    || (to === '/prefeitura/broncas' && pathname === '/prefeitura/mapa');
}
