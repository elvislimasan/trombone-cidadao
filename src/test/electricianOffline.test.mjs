import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { comLoja, LOJA_ELETRICISTA } from '../lib/offlineDb.js';
import { queueElectricianJob, listElectricianJobs, syncElectricianJobs, sendElectricianJob,
  readElectricianCache, writeElectricianCache, electricianCachedRead, projectElectricianOrder } from '../lib/electricianOffline.js';

const base = { userId: 'worker', municipalityId: 'city', resource: 'order:one', label: 'Reparo',
  rpc: 'resolver_ordem_eletricista', args: { p_prefeitura: 'city', p_ordem: 'one', p_versao: 3 } };
const photo = () => ({ file: new File(['evidence'], 'poste.jpg', { type: 'image/jpeg' }) });
async function reset() { await comLoja(LOJA_ELETRICISTA, 'readwrite', store => store.clear()); }
function client({ userId = 'worker', fail, receipt = null, onRpc = () => {} } = {}) {
  const uploads = [];
  return { uploads,
    auth: { getSession: async () => ({ data: { session: { user: { id: userId } } } }) },
    storage: { from: () => ({ upload: async (path, blob) => { uploads.push({ path, blob }); return {}; } }) },
    rpc: async (rpc, args) => { onRpc(rpc, args); return rpc === 'electrician_offline_receipt' ? { data: receipt }
      : fail ? { error: fail } : { data: { response: { status: 'concluida' }, order_version: 4 } }; },
  };
}
test('queue survives reload, preserves photo bytes and separates accounts and municipalities', async () => {
  await reset();
  const job = await queueElectricianJob({ ...base, files: [photo()] });
  const [saved] = await listElectricianJobs('worker', 'city');
  assert.equal(saved.id, job.id);
  assert.equal(await saved.photos[0].blob.text(), 'evidence');
  assert.equal((await listElectricianJobs('other')).length, 0);
  assert.equal((await listElectricianJobs('worker', 'other-city')).length, 0);
});
test('start and completion form an ordered dependency chain', async () => {
  await reset();
  const first = await queueElectricianJob({ ...base, rpc: 'salvar_demanda_municipal' });
  const second = await queueElectricianJob(base);
  assert.equal(second.previousId, first.id);
  const sent = [];
  await syncElectricianJobs(client({ onRpc: (rpc, args) => { if (rpc === 'sync_electrician_operation') sent.push(args.p_operation); } }), 'worker');
  assert.deepEqual(sent, [first.id, second.id]);
});
test('network failures retain the job and photos, retry uses the same operation and upload path', async () => {
  await reset();
  const job = await queueElectricianJob({ ...base, files: [photo()] });
  const offline = client({ fail: { message: 'Failed to fetch' } });
  await syncElectricianJobs(offline, 'worker');
  let [saved] = await listElectricianJobs('worker');
  assert.equal(saved.state, 'pending'); assert.equal(saved.photos.length, 1);
  const online = client(); await syncElectricianJobs(online, 'worker');
  [saved] = await listElectricianJobs('worker');
  assert.equal(saved.id, job.id); assert.equal(saved.state, 'sent'); assert.equal(saved.photos.length, 0);
  assert.equal(offline.uploads[0].path, online.uploads[0].path);
});
test('a lost response after commit uses receipt before uploading again', async () => {
  await reset(); const job = await queueElectricianJob({ ...base, files: [photo()] });
  const calls = []; const api = client({ receipt: { response: { status: 'concluida' } }, onRpc: name => calls.push(name) });
  await sendElectricianJob(api, job);
  assert.deepEqual(calls, ['electrician_offline_receipt']); assert.equal(api.uploads.length, 0);
});
test('another signed-in account cannot upload or send pending work', async () => {
  await reset(); const job = await queueElectricianJob({ ...base, files: [photo()] });
  const calls = []; const api = client({ userId: 'other', onRpc: name => calls.push(name) });
  await assert.rejects(sendElectricianJob(api, job), { code: 'AUTH_REQUIRED' });
  assert.equal(api.uploads.length, 0); assert.equal(calls.length, 0);
});
test('conflicts preserve evidence and block the entire dependent chain without blocking unrelated orders', async () => {
  await reset();
  const first = await queueElectricianJob({ ...base, files: [photo()] });
  await queueElectricianJob(base); await queueElectricianJob(base);
  const other = await queueElectricianJob({ ...base, resource: 'order:two', args: { ...base.args, p_ordem: 'two' } });
  const calls = [];
  await syncElectricianJobs(client({ fail: { code: '40001', message: 'A ordem mudou.' }, onRpc: (name, args) => {
    if (name === 'sync_electrician_operation') calls.push(args.p_operation);
  } }), 'worker');
  assert.deepEqual(calls, [first.id, other.id]);
  const jobs = await listElectricianJobs('worker');
  assert.equal(jobs[0].state, 'blocked'); assert.equal(jobs[0].photos.length, 1);
  assert.equal(jobs[1].state, 'pending'); assert.equal(jobs[2].state, 'pending');
  await syncElectricianJobs(client(), 'worker');
  assert.equal((await listElectricianJobs('worker'))[2].state, 'pending');
});
test('cache fallback is scoped and only accepts transport failures, never access denial', async () => {
  await reset(); await writeElectricianCache('worker', 'workspace', { isElectrician: true });
  assert.equal(await readElectricianCache('other', 'workspace'), null);
  assert.deepEqual(await electricianCachedRead('worker', 'workspace', async () => { throw new TypeError('Failed to fetch'); }), { isElectrician: true });
  await assert.rejects(electricianCachedRead('worker', 'workspace', async () => { throw Object.assign(new Error('Denied'), { code: '42501' }); }), /Denied/);
  assert.equal(await readElectricianCache('worker', 'workspace'), null);
});
test('local progress retains linked requests and permits the next service without implying server confirmation', () => {
  const snapshot = { order: { status: 'programada' }, linkedReports: [{ report_id: 'r1', status: 'pending' }, { report_id: 'r2', status: 'pending' }] };
  const projected = projectElectricianOrder(snapshot, [
    { id: 'start', state: 'pending', rpc: 'salvar_demanda_municipal' },
    { id: 'repair', state: 'pending', rpc: 'atender_solicitacao_ordem_eletricista', args: { p_report: 'r1' } },
  ]);
  assert.equal(projected.order.status, 'em_andamento'); assert.equal(projected.linkedReports[0].status, 'resolved');
  assert.equal(projected.linkedReports[1].status, 'pending'); assert.equal(projected.pending, true);
  assert.equal(projected.previousId, 'repair'); assert.equal(snapshot.linkedReports[0].status, 'pending');
});
