import test from 'node:test';
import assert from 'node:assert/strict';
import { guideCategoryIds, guideCategoryCounts, isGuideTransport } from '../lib/guideCategories.js';

test('legacy entries and multiple categories use the same membership rules', () => {
  assert.deepEqual(guideCategoryIds({ category_id: 'a' }), ['a']);
  assert.deepEqual(guideCategoryIds({ category_id: 'a', category_ids: ['a', 'b'] }), ['a', 'b']);
  assert.deepEqual(guideCategoryIds({}), []);
});

test('a business in two subcategories counts only once in their parent', () => {
  const categories = new Map([
    ['root', { id: 'root' }],
    ['a', { id: 'a', parent_id: 'root' }],
    ['b', { id: 'b', parent_id: 'root' }],
  ]);
  const counts = guideCategoryCounts([
    { category_id: 'a', category_ids: ['a', 'b', 'root'] },
    { category_id: 'b' },
    { category_id: 'deleted' },
  ], categories);
  assert.equal(counts.get('root'), 2);
  assert.equal(counts.get('a'), 1);
  assert.equal(counts.get('b'), 2);
  assert.equal(counts.has('deleted'), false);
});

test('transport fields recognize secondary categories, children and migrated entries', () => {
  const categories = [{ id: 't', name: 'Transportes' }, { id: 'l', parent_id: 't', name: 'Vans' }, { id: 'c', name: 'Comércio' }];
  assert.equal(isGuideTransport({ category_id: 'c', category_ids: ['c', 'l'] }, categories), true);
  assert.equal(isGuideTransport({ legacy_source: 'transport' }, []), true);
  assert.equal(isGuideTransport({ category_id: 'c' }, categories), false);
});
