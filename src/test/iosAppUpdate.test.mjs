import test from 'node:test';
import assert from 'node:assert/strict';
import { compareAppVersions, iosUpdateFromLookup, createIosUpdateChecker } from '../lib/iosAppUpdate.js';

const appId = '6766293242';
const info = { id: 'com.trombonecidadao.app', version: '1.2' };
const release = { trackId: Number(appId), bundleId: info.id, version: '1.3' };
const response = row => ({ resultCount: 1, results: [row] });
function fixture(overrides = {}) {
  let currentTime = 1000000;
  const found = [], saved = [], calls = [];
  const checker = createIosUpdateChecker({ appId, now: () => currentTime,
    getInfo: async () => { calls.push('info'); return info; },
    lookup: async id => { calls.push(id); return response(release); },
    readDismissal: async () => null,
    writeDismissal: async value => saved.push(value),
    onAvailable: value => found.push(value), ...overrides });
  return { checker, found, saved, calls, advance: ms => { currentTime += ms; } };
}

test('compara versões iOS por componente sem confundir 1.10 com 1.1', () => {
  for (const [left, right, result] of [['1.10', '1.9', 1], ['1.2', '1.2.0', 0], ['2.0', '1.99', 1], ['1.2.3', '1.2.4', -1]]) {
    assert.equal(compareAppVersions(left, right), result);
  }
  for (const bad of ['', undefined, null, 'v1.2', '1.2-beta', '1..2', 'Infinity', '9007199254740992']) assert.equal(compareAppVersions(bad, '1.2'), null);
});

test('só oferece versão publicada mais recente do mesmo Apple ID e bundle', () => {
  assert.deepEqual(iosUpdateFromLookup(info, response(release), appId), { version: '1.3' });
  for (const data of [null, {}, { results: [] }, response(null), response({ ...release, trackId: 10 }), response({ ...release, bundleId: 'other.app' }), response({ ...release, version: '1.2.0' }), response({ ...release, version: '1.1' }), response({ ...release, version: 'inválida' })]) {
    assert.equal(iosUpdateFromLookup(info, data, appId), null);
  }
  assert.equal(iosUpdateFromLookup({ ...info, version: '2.0' }, response(release), appId), null, 'TestFlight ou versão adiantada não deve pedir downgrade');
});

test('consulta ao iniciar e limita retornos ao app a uma consulta a cada seis horas', async () => {
  const f = fixture();
  await f.checker.check(); await f.checker.check();
  assert.deepEqual(f.found, [{ version: '1.3' }]); assert.equal(f.calls.length, 2);
  f.advance(6 * 60 * 60 * 1000); await f.checker.check();
  assert.equal(f.calls.length, 4);
});

test('agora não persiste versão por 24 horas; uma versão diferente pode avisar', async () => {
  const f = fixture();
  await f.checker.check(); await f.checker.dismiss('1.3');
  assert.deepEqual(f.saved, [{ version: '1.3', at: 1000000 }]);
  f.advance(6 * 60 * 60 * 1000); await f.checker.check(); assert.equal(f.found.length, 1);
  f.advance(18 * 60 * 60 * 1000); await f.checker.check(); assert.equal(f.found.length, 2);
  const newer = fixture({ readDismissal: async () => ({ version: '1.2.1', at: 1000000 }) });
  await newer.checker.check(); assert.equal(newer.found.length, 1);
  const restart = fixture({ readDismissal: async () => ({ version: '1.3', at: 1000000 }) });
  await restart.checker.check(); assert.equal(restart.found.length, 0);
});

test('falha offline permite nova consulta no retorno após cinco minutos', async () => {
  let count = 0;
  const f = fixture({ lookup: async () => { if (++count === 1) throw new Error('offline'); return response(release); } });
  await f.checker.check(); await f.checker.check();
  assert.equal(f.found.length, 0); assert.equal(count, 1);
  f.advance(5 * 60 * 1000); await f.checker.check(); assert.equal(f.found.length, 1);
});

test('falha no armazenamento não impede aviso nem repete a versão adiada na sessão', async () => {
  const f = fixture({ readDismissal: async () => { throw new Error('storage'); }, writeDismissal: async () => { throw new Error('storage'); } });
  await f.checker.check(); await f.checker.dismiss('1.3');
  f.advance(6 * 60 * 60 * 1000); await f.checker.check();
  assert.equal(f.found.length, 1);
});

test('eventos concorrentes não duplicam a consulta e resultado tardio não abre aviso após desmontagem', async () => {
  let finish, calls = 0;
  const f = fixture({ lookup: async () => { calls++; return new Promise(resolve => { finish = resolve; }); } });
  const first = f.checker.check(); await Promise.resolve();
  await f.checker.check(); assert.equal(calls, 1);
  f.checker.dispose(); finish(response(release)); await first;
  assert.equal(f.found.length, 0);
  await f.checker.check(); assert.equal(calls, 1);
});
