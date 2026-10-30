import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { isTypePreferenceDisabled } from '../../supabase/functions/send-push-notification/gate.js';

test('push de mudas respeita preferência explícita e permanece ativo para contas sem a nova chave', () => {
  for (const preferences of [undefined, null, {}, { tree_adoption_update: true }, { tree_adoption_update: 'true' }]) assert.equal(isTypePreferenceDisabled(preferences, 'tree_adoption_update'), false);
  for (const value of [false, 'false']) assert.equal(isTypePreferenceDisabled({ tree_adoption_update: value }, 'tree_adoption_update'), true);
});

async function clickNotification(clientOptions, action = '') {
  const listeners = {}, navigations = [], opened = [], messages = []; let focused = 0, closed = 0;
  const client = { id: 'window-1', url: 'https://app.test/adote-uma-arvore', async focus() { focused++; return client; }, postMessage(message) { messages.push(message); },
    async navigate(url) { navigations.push(url); if (clientOptions?.navigationFails) throw new Error('closed'); client.url = url; return client; }, ...clientOptions };
  const clients = { async matchAll() { return clientOptions ? [client] : []; }, async openWindow(url) { opened.push(url); return null; } };
  runInNewContext(readFileSync(new URL('../../public/sw.js', import.meta.url), 'utf8'), { self: { location: { origin: 'https://app.test' }, clients, addEventListener(type, handler) { listeners[type] = handler; } }, clients, URL, console, setTimeout(callback) { callback(); } });
  const link = '/adote-uma-arvore?cidade=64&aba=minhas&pedido=a0000000-0000-0000-0000-000000000001';
  let work;
  listeners.notificationclick({ action, notification: { data: { url: link, notificationId: 'notification-1', type: 'tree_adoption_update' }, close() { closed++; } }, waitUntil(promise) { work = promise; } });
  await work;
  return { navigations, opened, focused, messages, closed, link };
}

test('push web navega até o pedido correto quando a apresentação ou outro pedido já está aberto', async () => {
  for (const url of ['https://app.test/adote-uma-arvore', 'https://app.test/adote-uma-arvore?cidade=65&aba=minhas&pedido=outro']) {
    const result = await clickNotification({ url });
    assert.deepEqual(result.navigations, ['https://app.test' + result.link]);
    assert.equal(result.focused, 1); assert.equal(result.opened.length, 0);
    assert.equal(result.messages[0].notificationId, 'notification-1');
  }
});

test('push web foca destino já aberto e cria janela quando a navegação existente não está disponível', async () => {
  const same = await clickNotification({ url: 'https://app.test/adote-uma-arvore?cidade=64&aba=minhas&pedido=a0000000-0000-0000-0000-000000000001' });
  assert.equal(same.navigations.length, 0); assert.equal(same.focused, 1);
  for (const options of [null, { url: 'https://app.test/outra-pagina' }, { navigate: undefined, url: 'https://app.test/adote-uma-arvore' }, { navigationFails: true }]) {
    const result = await clickNotification(options);
    assert.deepEqual(result.opened, [result.link]);
  }
});

test('dispensar push de mudas não navega nem abre outra janela', async () => {
  const result = await clickNotification({}, 'close');
  assert.equal(result.closed, 2); assert.equal(result.focused, 0); assert.equal(result.opened.length, 0); assert.equal(result.navigations.length, 0);
});
