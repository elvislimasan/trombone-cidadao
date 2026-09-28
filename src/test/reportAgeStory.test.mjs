import test from 'node:test';
import assert from 'node:assert/strict';
import { reportAgeStoryFor } from '../lib/reportAgeStory.js';

test('poste aceso durante o dia não é descrito como rua no escuro', () => {
  assert.equal(reportAgeStoryFor('iluminacao', 'lamp_on_daytime', 158), 'Este poste está há 158 dias aceso durante o dia.');
  assert.equal(reportAgeStoryFor('iluminacao', 'lamp_off', 158), 'Essa rua está há 158 dias no escuro.');
  assert.equal(reportAgeStoryFor('iluminacao', 'pole_broken', 158), 'Esse problema de iluminação está há 158 dias sem solução.');
});

test('história de idade só aparece após sete dias', () => {
  assert.equal(reportAgeStoryFor('iluminacao', 'lamp_on_daytime', 6), null);
});
