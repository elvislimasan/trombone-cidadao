import { TREE_ACTIONS } from './arborization.js';

export function treeMaintenancePayload(action, dueAt = '') {
  if (!Object.hasOwn(TREE_ACTIONS, action) || action === 'nenhuma') throw new Error('Selecione o manejo necessário.');
  if (dueAt && (!/^\d{4}-\d{2}-\d{2}$/.test(dueAt) || !Number.isFinite(Date.parse(dueAt)) || new Date(dueAt).toISOString().slice(0, 10) !== dueAt || dueAt.startsWith('0000'))) throw new Error('Informe um prazo válido para o manejo.');
  return { maintenance_action: action, maintenance_due_at: dueAt || null };
}

export function treeMaintenanceSelection(trees, treeIds, cityId) {
  if (!cityId || !/^\d+$/.test(String(cityId))) throw new Error('Selecione uma cidade para programar o manejo.');
  const ids = [...new Set(treeIds)];
  if (!ids.length) throw new Error('Selecione pelo menos uma árvore.');
  const available = new Set(trees.filter(tree => String(tree.city_id) === String(cityId) && tree.status !== 'removida').map(tree => tree.id));
  if (ids.some(id => !available.has(id))) throw new Error('A seleção contém árvores indisponíveis nesta cidade. Atualize o mapa e selecione novamente.');
  return ids;
}
