import test from 'node:test';
import assert from 'node:assert/strict';
import { historiaDeTempoDaBronca, reportAgeStoryFor } from '../lib/reportAgeStory.js';

test('poste aceso durante o dia não é descrito como rua no escuro', () => {
  assert.equal(
    historiaDeTempoDaBronca({ category: 'iluminacao', issue_type: 'lamp_on_daytime', status: 'pending' }, 153),
    'Este poste está há 153 dias aceso durante o dia.',
  );
});

test('lâmpada apagada e poste sem iluminação mantêm a mensagem de rua no escuro', () => {
  for (const issue_type of ['lamp_off', 'no_lighting']) {
    assert.equal(
      historiaDeTempoDaBronca({ category_id: 'iluminacao', issue_type, status: 'pending' }, 12),
      'Essa rua está há 12 dias no escuro.',
    );
  }
});

test('bronca recente ou resolvida não mostra história de tempo', () => {
  assert.equal(historiaDeTempoDaBronca({ category: 'iluminacao', status: 'pending' }, 6), null);
  assert.equal(historiaDeTempoDaBronca({ category: 'iluminacao', status: 'resolved' }, 20), null);
});

test('poste aceso durante o dia não é descrito como rua no escuro', () => {
  assert.equal(reportAgeStoryFor('iluminacao', 'lamp_on_daytime', 158), 'Este poste está há 158 dias aceso durante o dia.');
  assert.equal(reportAgeStoryFor('iluminacao', 'lamp_off', 158), 'Essa rua está há 158 dias no escuro.');
  assert.equal(reportAgeStoryFor('iluminacao', 'pole_broken', 158), 'Esse problema de iluminação está há 158 dias sem solução.');
});

test('história de idade só aparece após sete dias', () => {
  assert.equal(reportAgeStoryFor('iluminacao', 'lamp_on_daytime', 6), null);
});
