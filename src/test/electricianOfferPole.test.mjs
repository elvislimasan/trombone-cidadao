import assert from 'node:assert/strict';
import test from 'node:test';
import { electricianOfferPoleCode, loadElectricianOfferPole } from '@/lib/electricianOfferPole';

const offer = { tipo: 'solicitacao', id: 'r1' };
const clientFor = (data) => ({ rpc: async () => ({ data, error: null }) });

test('pre-accept preview uses the authorized opportunity endpoint without altering the report', async () => {
  const calls = [];
  const client = { async rpc(name, args) { calls.push({ name, args }); return { data: { identifier: 'X070337', nearby: true } }; } };
  assert.deepEqual(await loadElectricianOfferPole(client, offer, 'pref1'), { code: 'X070337', nearby: true });
  assert.deepEqual(calls, [{ name: 'poste_oferta_eletricista', args: { p_prefeitura: 'pref1', p_tipo: 'solicitacao', p_id: 'r1' } }]);
});

test('erased-number descriptions do not override the pole that appears after acceptance', async () => {
  const data = { identifier: '123 - X070337', pole_number: 'N\u00famero apagado', nearby: true };
  assert.deepEqual(await loadElectricianOfferPole(clientFor(data), offer, 'pref1'), { code: 'X070337', nearby: true });
  for (const value of ['N\u00famero apagado', 'NUMERA\u00c7\u00c3O APAGADA', 'Plaqueta ileg\u00edvel', 'Sem n\u00famero', 'N\u00e3o informado']) {
    assert.equal(electricianOfferPoleCode(value), '');
  }
  assert.equal(electricianOfferPoleCode('X070337'), 'X070337');
});

test('linked current identifier takes precedence over an outdated reported code', async () => {
  const data = { identifier: 'S227002', reported_post_identifier: 'OLD20', nearby: false };
  assert.deepEqual(await loadElectricianOfferPole(clientFor(data), offer, 'pref1'), { code: 'S227002', nearby: false });
});

test('valid recorded reference survives a missing or unreadable pole', async () => {
  const data = { identifier: 'N\u00famero apagado', reported_post_identifier: 'Sem n\u00famero', pole_number: 'S227002', nearby: true };
  assert.deepEqual(await loadElectricianOfferPole(clientFor(data), offer, 'pref1'), { code: 'S227002', nearby: false });
});

test('unavailable opportunities and missing meaningful codes stay without a fabricated identifier', async () => {
  assert.equal(await loadElectricianOfferPole(clientFor(null), offer, 'pref1'), null);
  assert.equal(await loadElectricianOfferPole(clientFor({ pole_number: 'N\u00famero apagado' }), offer, 'pref1'), null);
  assert.equal(await loadElectricianOfferPole(clientFor({}), null, 'pref1'), null);
  assert.equal(await loadElectricianOfferPole(clientFor({}), offer, null), null);
});

test('access or lookup failures do not fabricate a pole reference', async () => {
  const error = { code: '42501', message: 'Sem acesso' };
  await assert.rejects(loadElectricianOfferPole({ rpc: async () => ({ error }) }, offer, 'pref1'), (failure) => failure === error);
});
