import assert from 'node:assert/strict';
import test from 'node:test';
import 'fake-indexeddb/auto';
import { clearElectricianDraft, listElectricianDraftSummaries, loadElectricianDraft, saveElectricianDraft } from '@/lib/electricianDraft';

test('offline draft restores text and photo only for its user, municipality and order', async () => {
  const scope = { userId: 'electrician-a', municipalityId: 'city-a', orderId: 'order-a' };
  const photo = new File(['image bytes'], 'poste.jpg', { type: 'image/jpeg' });
  await saveElectricianDraft(scope, {
    result: 'Lâmpada substituída', serviceType: 'lamp_replacement', technicalNote: 'Peça testada no local',
    files: [{ id: 'photo-a', file: photo }],
    order: { id: scope.orderId, prefeitura_id: scope.municipalityId,
      atribuido_a: scope.userId, titulo: 'Manutenção', versao: 4, privateCitizenName: 'Não guardar' },
  });
  const restored = await loadElectricianDraft(scope);
  assert.equal(restored.result, 'Lâmpada substituída');
  assert.equal(restored.serviceType, 'lamp_replacement');
  assert.equal(restored.technicalNote, 'Peça testada no local');
  assert.equal(restored.files[0].file.name, 'poste.jpg');
  assert.equal(await restored.files[0].file.text(), 'image bytes');
  assert.equal(restored.order.versao, 4);
  assert.equal('privateCitizenName' in restored.order, false);
  assert.equal(await loadElectricianDraft({ ...scope, userId: 'electrician-b' }), null);
  assert.equal(await loadElectricianDraft({ ...scope, municipalityId: 'city-b' }), null);
  assert.equal(await loadElectricianDraft({ ...scope, orderId: 'order-b' }), null);
  await clearElectricianDraft(scope);
  assert.equal(await loadElectricianDraft(scope), null);
});

test('later local save wins and clearing cannot be undone by a pending save', async () => {
  const scope = { userId: 'electrician-a', municipalityId: 'city-a', orderId: 'order-b' };
  const first = saveElectricianDraft(scope, { result: 'Primeira versão' });
  const second = saveElectricianDraft(scope, { result: 'Versão mais recente' });
  await Promise.all([first, second]);
  assert.equal((await loadElectricianDraft(scope)).result, 'Versão mais recente');
  const pending = saveElectricianDraft(scope, { result: 'Antes do envio' });
  await clearElectricianDraft(scope);
  await pending;
  assert.equal(await loadElectricianDraft(scope), null);
});

test('Hoje lists only meaningful drafts from the active user and municipality', async () => {
  const base = { userId: 'today-user', municipalityId: 'today-city' };
  const blank = { ...base, orderId: 'blank' };
  const filled = { ...base, orderId: 'filled' };
  const otherCity = { ...base, municipalityId: 'other-city', orderId: 'private' };
  await saveElectricianDraft(blank, { order: { id: 'blank' } });
  await saveElectricianDraft(filled, { technicalNote: 'Lâmpada testada', order: { id: 'filled', titulo: 'Poste 5' } });
  await saveElectricianDraft(otherCity, { result: 'Não exibir' });
  const summaries = await listElectricianDraftSummaries(base);
  assert.deepEqual(summaries.map((item) => item.orderId), ['filled']);
  assert.equal(summaries[0].order.titulo, 'Poste 5');
  await Promise.all([blank, filled, otherCity].map(clearElectricianDraft));
});
