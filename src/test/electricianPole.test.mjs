import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanPoleIdentifier, compactPoleReference, electricianPoleForm, electricianPolePayload, fillElectricianPoleIdentifier, poleIdentifierFromTitle } from '@/lib/electricianPole';
import { electricianDraftHasWork } from '@/lib/electricianDraft';

test('the linked pole uses the code in the order title when its identifier is empty', () => {
  const pole = { id: 2183, identifier: '', lamp_type: 'Vapor de sódio', lamp_power_w: 70 };
  const title = 'Manutenção do poste 9 - x177979';
  const form = electricianPoleForm(pole, title);
  assert.equal(form.identifier, 'X177979');
  assert.equal(poleIdentifierFromTitle(title), 'X177979');
  assert.equal(compactPoleReference(title), 'Manutenção do poste X177979');
  assert.equal(compactPoleReference('9 - X177979'), 'X177979');
  assert.equal(electricianPolePayload(form).identifier, 'X177979');
  assert.equal(electricianDraftHasWork({ pole, poleForm: form, order: { titulo: title } }), false);
});

test('a saved identifier is kept and the numeric prefix is removed', () => {
  const pole = { id: 2183, identifier: '9 - X097074' };
  assert.equal(electricianPoleForm(pole, 'Poste 9 - X177979').identifier, 'X097074');
  assert.equal(fillElectricianPoleIdentifier({ id: 2183, identifier: 'X123456' }, 'Poste 9 - X177979').identifier, 'X123456');
  assert.equal(fillElectricianPoleIdentifier({ id: 2183, identifier: '' }, 'Poste 9 - X177979').identifier, 'X177979');
  assert.equal(cleanPoleIdentifier('Poste 9 - x177979'), 'X177979');
  assert.equal(compactPoleReference('Poste 2183'), 'Poste 2183');
});
