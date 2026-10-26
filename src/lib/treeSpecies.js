import { treeNameKey } from './treeInventory.js';

export const SIDEWALK_SUITABILITY = { nao_avaliada: 'Não avaliada', indicada: 'Indicada', com_restricoes: 'Com restrições', nao_indicada: 'Não indicada' };

export function speciesAliases(value, commonName = '') {
  const seen = new Set([treeNameKey(commonName)]);
  return (Array.isArray(value) ? value : String(value || '').split(/[;\n]/)).map(name => name.trim()).filter(name => {
    const key = treeNameKey(name);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function withTreeSpecies(tree, species) {
  return { ...tree, ...(species ? { common_name: species.common_name, scientific_name: species.scientific_name, origin: species.origin } : {}),
    species_illustration_url: species?.illustration_url || null, species_aliases: species?.aliases || [],
    species_summary: species?.summary || '', sidewalk_suitability: species?.sidewalk_suitability || 'nao_avaliada',
    planting_guidance: species?.planting_guidance || '' };
}

export function treeInventoryHighlights(trees, neighborhoods, year = new Date().getFullYear()) {
  const living = trees.filter(tree => tree.status !== 'removida');
  const counts = new Map();
  for (const tree of living) {
    if (!tree.species_id) continue;
    const key = tree.species_id;
    const entry = counts.get(key) || { name: tree.common_name, count: 0 };
    entry.count++; counts.set(key, entry);
  }
  const mostPlanted = [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'pt-BR'))[0];
  const leastWooded = [...neighborhoods].sort((a, b) => a.count - b.count || a.name.localeCompare(b.name, 'pt-BR'))[0];
  return { total: trees.length, mostPlanted, leastWooded, plantedThisYear: trees.filter(tree => tree.planted_at?.slice(0, 4) === String(year)).length };
}
