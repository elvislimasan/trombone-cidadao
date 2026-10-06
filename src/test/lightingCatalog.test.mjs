import test from 'node:test';
import assert from 'node:assert/strict';
import { isStandardLampType, normalizeLampType } from '../lib/lightingCatalog.js';
import { validatePoleTechnicalDetails } from '../lib/poleTechnicalDetails.js';

test('standardizes the lamp labels present in the imported catalog', () => {
  assert.equal(normalizeLampType('LAMPADA DE LED'), 'LED');
  assert.equal(normalizeLampType('VAPOR DE SODIO DE ALTA PRESSAO'), 'Vapor de sódio');
  assert.equal(normalizeLampType('Vapor de mercúrio'), 'Vapor de mercúrio');
  assert.equal(normalizeLampType('Iodetos Metálicos'), 'Iodetos metálicos');
  assert.equal(normalizeLampType('FLUORESCENTE COMPACTA'), 'Fluorescente compacta');
});

test('keeps unknown legacy values visible while preventing new catalog entries', () => {
  assert.equal(normalizeLampType('test'), 'test');
  assert.equal(isStandardLampType('test'), false);
  assert.equal(isStandardLampType('LAMPADA DE LED'), true);
  assert.equal(isStandardLampType(''), true);
});

test('rejects conflicting point and luminaire counts', () => {
  assert.match(validatePoleTechnicalDetails({ lamp_count: 2, luminaires: [{ description: 'LED', quantity: 1 }] }), /corresponder/);
});
