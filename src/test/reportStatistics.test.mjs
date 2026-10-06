import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingReportsByCategory } from '../lib/reportStatistics.js';

test('barras contam somente broncas pendentes públicas aprovadas', () => {
  const lighting = { category: { id: 'iluminacao', name: 'Iluminação' }, moderation_status: 'approved', is_public: true };
  const reports = ['pending', 'pending', 'resolved', 'in-progress', 'pending_resolution', 'duplicate', 'pending_approval']
    .map((status, i) => ({ ...lighting, id: i, status }));
  reports.push({ ...lighting, id: 8, status: 'pending', is_public: false });
  reports.push({ ...lighting, id: 9, status: 'pending', moderation_status: 'rejected' });
  reports.push({ ...lighting, id: 10, status: 'pending', moderation_status: 'pending_approval' });
  reports.push({ ...lighting, id: 11, status: 'pending', moderation_status: 'internal' });
  reports.push({ ...reports[0] });
  assert.deepEqual(pendingReportsByCategory(reports), [{ id: 'iluminacao', name: 'Iluminação', value: 2 }]);
});

test('categoria usa category_id quando a relação falta; categorias sem pendentes ficam fora', () => {
  assert.deepEqual(pendingReportsByCategory([
    { id: 1, status: 'pending', category_id: 'buracos' },
    { id: 2, status: 'resolved', category: { id: 'iluminacao', name: 'Iluminação' } },
  ]), [{ id: 'buracos', name: 'Outros', value: 1 }]);
});
