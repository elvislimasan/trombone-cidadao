import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTrees } from '../lib/arborization.js';
import { speciesAliases, treeInventoryHighlights, withTreeSpecies } from '../lib/treeSpecies.js';
import { treeNeighborhoodCounts } from '../lib/treeInventory.js';

test('nomes regionais são pesquisáveis, sem duplicar nomes por acento e grafia', () => {
  assert.deepEqual(speciesAliases('Castanhola; Amendoeira\ncastánhola; Chapéu de sol', 'Amendoeira'), ['Castanhola', 'Chapéu de sol']);
  const tree = withTreeSpecies({ id: 't1', species_id: 's1', common_name: 'Nome antigo' }, { common_name: 'Amendoeira', aliases: ['Castanhola'], summary: 'Resumo', origin: 'exotica' });
  assert.equal(tree.common_name, 'Amendoeira');
  assert.equal(tree.species_summary, 'Resumo');
  assert.equal(filterTrees([tree], { search: 'castánhola' }).length, 1);
});

test('filtro combina árvores vivas e ausência de bairro sem incluir removidas', () => {
  const rows = [
    { id: 1, status: 'saudavel', neighborhood: null },
    { id: 2, status: 'atencao', neighborhood: '  ' },
    { id: 3, status: 'risco', neighborhood: 'Centro', bairro_id: 'b1' },
    { id: 4, status: 'removida', neighborhood: null },
    { id: 5, status: 'saudavel', neighborhood: null, bairro_id: 'b1' },
  ];
  assert.deepEqual(filterTrees(rows, { status: 'living', neighborhood: 'unidentified' }).map(row => row.id), [1, 2]);
});

test('indicadores usam espécies identificadas vivas, bairros com zero e data de plantio', () => {
  const rows = [
    { species_id: 's1', common_name: 'Ipê', status: 'saudavel', neighborhood: 'Centro', planted_at: '2026-03-01' },
    { species_id: 's1', common_name: 'Ipê', status: 'saudavel', neighborhood: 'Centro', created_at: '2026-03-01' },
    { species_id: 's2', common_name: 'Nim', status: 'removida', neighborhood: 'Centro', planted_at: '2025-01-01' },
    { common_name: 'Não identificada', status: 'saudavel' },
  ];
  const stats = treeInventoryHighlights(rows, treeNeighborhoodCounts(rows, [{ name: 'Centro' }, { name: 'Bela Vista' }]), 2026);
  assert.equal(stats.total, 4);
  assert.deepEqual(stats.mostPlanted, { name: 'Ipê', count: 2 });
  assert.deepEqual(stats.leastWooded, { name: 'Bela Vista', count: 0 });
  assert.equal(stats.plantedThisYear, 1);
});
