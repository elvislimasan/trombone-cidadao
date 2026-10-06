import test from 'node:test';
import assert from 'node:assert/strict';
import { applyMunicipalCategoryFilter, enabledMunicipalCategories, filterMunicipalCategories } from '../lib/municipalCategories.js';

test('prefeitura inicia com iluminação e respeita seleção vazia do admin', () => {
  const categories = [{ id: 'buracos' }, { id: 'iluminacao' }];
  assert.deepEqual(filterMunicipalCategories(categories, {}), [{ id: 'iluminacao' }]);
  assert.deepEqual(enabledMunicipalCategories({ categorias_habilitadas: [] }), []);
  assert.deepEqual(filterMunicipalCategories(categories, { categorias_habilitadas: [] }), []);
  assert.deepEqual(filterMunicipalCategories(categories, { categorias_habilitadas: ['buracos'] }), [{ id: 'buracos' }]);
});

test('consulta sem categoria habilitada não consulta todas as categorias', () => {
  const calls = [];
  const request = {
    in(column, values) { calls.push(['in', column, values]); return this; },
    eq(column, value) { calls.push(['eq', column, value]); return this; },
  };
  applyMunicipalCategoryFilter(request, 'category_id', ['iluminacao']);
  applyMunicipalCategoryFilter(request, 'category_id', []);
  assert.deepEqual(calls, [
    ['in', 'category_id', ['iluminacao']],
    ['eq', 'category_id', '__nenhuma_categoria_habilitada__'],
  ]);
});
