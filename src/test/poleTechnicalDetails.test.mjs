import test from 'node:test';
import assert from 'node:assert/strict';
import {
  emptyPoleTechnicalDetails, poleTechnicalDetailsFromRecord,
  poleTechnicalDetailsPayload, validatePoleTechnicalDetails,
} from '../lib/poleTechnicalDetails.js';

test('edição usa dados municipais e preserva a origem KMZ', () => {
  const pole = { plate: 'ANTIGA', raw_properties: {
    kmz: { source_code: 'KMZ-1', source_plate: 'ANTIGA', feeder: 'AL-1',
      switch_code: 'CH-1', observations: 'Cadastro original',
      luminaires: [{ description: 'SÓDIO 70W', quantity: 1 }] },
    municipal: { source_plate: 'NOVA', feeder: 'AL-2',
      luminaires: [{ description: 'LED 60W', quantity: 2, type: 'LED', power_w: 60, kwh_month: 12, metered: true }] },
  } };
  const form = poleTechnicalDetailsFromRecord(pole);
  assert.equal(form.source_code, 'KMZ-1');
  assert.equal(form.source_plate, 'NOVA');
  assert.equal(form.feeder, 'AL-2');
  assert.equal(form.switch_code, 'CH-1');
  assert.equal(form.observations, 'Cadastro original');
  assert.deepEqual(form.luminaires, [{ description: 'LED 60W', quantity: 2, type: 'LED', power_w: 60, kwh_month: 12, metered: true }]);
  const saved = poleTechnicalDetailsPayload(form);
  assert.equal(saved.luminaires[0].power_w, 60);
  assert.equal(saved.luminaires[0].metered, true);
  assert.equal(pole.raw_properties.kmz.source_plate, 'ANTIGA');
});

test('campos técnicos são opcionais nos dois fluxos', () => {
  const details = poleTechnicalDetailsPayload(emptyPoleTechnicalDetails);
  assert.equal(details.lamp_count, null);
  assert.deepEqual(details.luminaires, []);
  assert.equal(validatePoleTechnicalDetails(details), null);
});

test('luminária preenchida exige descrição e quantidade válidas', () => {
  const incomplete = poleTechnicalDetailsPayload({ ...emptyPoleTechnicalDetails,
    luminaires: [{ description: 'LED 60W', quantity: '' }],
  });
  assert.match(validatePoleTechnicalDetails(incomplete), /descrição e a quantidade/);
  const complete = poleTechnicalDetailsPayload({ ...emptyPoleTechnicalDetails,
    lamp_count: '2', luminaires: [{ description: 'LED 60W', quantity: '2' }],
  });
  assert.equal(validatePoleTechnicalDetails(complete), null);
});
