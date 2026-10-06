export const DEFAULT_MUNICIPAL_CATEGORIES = ['iluminacao'];

export function enabledMunicipalCategories(municipality) {
  return Array.isArray(municipality?.categorias_habilitadas)
    ? municipality.categorias_habilitadas
    : DEFAULT_MUNICIPAL_CATEGORIES;
}

export function filterMunicipalCategories(categories, municipality) {
  const enabled = new Set(enabledMunicipalCategories(municipality));
  return (categories || []).filter((category) => enabled.has(category.id));
}

export function applyMunicipalCategoryFilter(request, column, ids) {
  if (!Array.isArray(ids)) return request;
  return ids.length ? request.in(column, ids) : request.eq(column, '__nenhuma_categoria_habilitada__');
}
