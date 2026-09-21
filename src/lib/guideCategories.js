export function guideCategoryIds(entry) {
  return [...new Set([entry.category_id, ...(entry.category_ids || [])].filter(Boolean).map(String))];
}

export function isGuideTransport(entry, categories) {
  const selected = new Set(guideCategoryIds(entry));
  return entry.legacy_source === 'transport' || categories.some((category) => {
    if (!selected.has(String(category.id))) return false;
    const parent = categories.find((item) => String(item.id) === String(category.parent_id));
    return /transport|lotac|onibus/.test(`${category.name} ${parent?.name || ''}`.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase());
  });
}

export function guideCategoryCounts(entries, categories) {
  const counts = new Map();
  for (const entry of entries) {
    const ids = new Set();
    for (const id of guideCategoryIds(entry)) {
      const category = categories.get(id);
      if (!category) continue;
      ids.add(id);
      if (category.parent_id) ids.add(String(category.parent_id));
    }
    for (const id of ids) counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}
