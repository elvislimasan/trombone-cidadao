import test from 'node:test';
import assert from 'node:assert/strict';
import { canChangeMunicipalReportVisibility } from '../lib/municipalReports.js';

const context = { canEdit: true, municipality: { id: 'prefeitura' } };

test('prefeitura não altera a visibilidade de broncas de cidadãos, mesmo vinculadas a uma ordem', () => {
  for (const report of [null, {}, { created_by_municipality: null }, { created_by_municipality: null, demanda_id: 'ordem' }]) {
    assert.equal(canChangeMunicipalReportVisibility(report, context), false);
  }
});

test('visibilidade exige permissão de edição e origem na prefeitura selecionada', () => {
  const report = { created_by_municipality: 'prefeitura' };
  assert.equal(canChangeMunicipalReportVisibility(report, context), true);
  assert.equal(canChangeMunicipalReportVisibility({ ...report, is_public: false }, context), true);
  assert.equal(canChangeMunicipalReportVisibility(report, { ...context, canEdit: false }), false);
  assert.equal(canChangeMunicipalReportVisibility(report, { ...context, municipality: { id: 'outra' } }), false);
  assert.equal(canChangeMunicipalReportVisibility(report, null), false);
  assert.equal(canChangeMunicipalReportVisibility({}, { canEdit: true }), false);
});
