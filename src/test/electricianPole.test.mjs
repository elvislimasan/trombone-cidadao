import assert from 'node:assert/strict';
import test from 'node:test';
import { cleanPoleIdentifier, compactPoleReference, electricianPoleForm, electricianPolePayload, electricianVisitTitle, fillElectricianPoleIdentifier, poleIdentifierFromTitle } from '@/lib/electricianPole';
import { electricianDraftHasWork } from '@/lib/electricianDraft';
import { poleCode, poleDisplayCode, poleReferenceText } from '@/lib/poleDisplay';

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

test('visit titles show the pole code without its numeric prefix', () => {
  assert.equal(electricianVisitTitle('Serviço no poste 10 - X171810'), 'Atendimento no poste X171810');
  assert.equal(electricianVisitTitle('Atendimento no poste 36 - S231394'), 'Atendimento no poste S231394');
  assert.equal(poleIdentifierFromTitle('Atendimento no poste 36 - S231394'), 'S231394');
  assert.equal(cleanPoleIdentifier('Poste 36 - s231394'), 'S231394');
  assert.equal(electricianVisitTitle('Atendimento de iluminação · 3 ocorrências'), 'Atendimento de iluminação · 3 ocorrências');
});

test('pole labels across the app use the code and preserve unrelated numbers', () => {
  assert.equal(poleCode('36 - S231394'), 'S231394');
  assert.equal(poleCode('Poste 36 - S231394'), 'S231394');
  assert.equal(poleCode('10 - X171810'), 'X171810');
  assert.equal(poleDisplayCode({ identifier: '36 - S231394', plate: '12345' }), 'S231394');
  assert.equal(poleDisplayCode({ identifier: 'X171810', plate: '12345' }), 'X171810');
  assert.equal(poleReferenceText('Manutenção do poste 36 - S231394'), 'Manutenção do poste S231394');
  assert.equal(poleReferenceText('Atendimento no poste 36 - 12345'), 'Atendimento no poste 12345');
  assert.equal(poleReferenceText('Prazo 2026 - 2027'), 'Prazo 2026 - 2027');
});
