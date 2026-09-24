import test from 'node:test';
import assert from 'node:assert/strict';
import { historiaDeTempoDaBronca } from '../lib/reportAgeStory.js';

test('poste aceso durante o dia não é descrito como rua no escuro', () => {
  assert.equal(
    historiaDeTempoDaBronca({ category: 'iluminacao', issue_type: 'lamp_on_daytime', status: 'pending' }, 153),
    'Esse problema de iluminação está há 153 dias sem solução.',
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
