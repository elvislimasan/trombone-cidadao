import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportUploadQueue } from '../lib/reportUploadQueue.js';

const report = { reportId: 'report-1', ownerId: 'user-1', title: 'Buraco' };
const photo = name => ({ name, type: 'photo', file: new Blob(['photo'], { type: 'image/jpeg' }) });
const settle = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  let serial = 0;
  const stored = new Map(), reports = new Map(), sent = [], requests = [];
  const deps = {
    newId: () => `media-${++serial}`,
    store: {
      load: async () => [[...stored.values()], [...reports.values()]],
      saveUpload: async item => stored.set(item.id, structuredClone(item)),
      removeUpload: async id => stored.delete(id),
      saveReport: async item => reports.set(item.reportId, structuredClone(item)),
    },
    prepareSource: async source => ({ source, name: source.name, contentType: 'image/jpeg' }),
    api: async (action, item) => { requests.push([action, item.id]); return action === 'prepare' ? { signedUrl: `https://test/${item.id}` } : { completed: true }; },
    upload: async source => { sent.push(source.name); if (source.name === 'bad.jpg') throw new Error('Sem rede'); },
  };
  return { deps, stored, reports, sent, requests, queue: createReportUploadQueue(deps) };
}

test('falha de um arquivo mantém a bronca e permite que outra imagem conclua', async () => {
  const view = fixture();
  const bad = await view.queue.enqueue(photo('bad.jpg'), report);
  const good = await view.queue.enqueue(photo('good.jpg'), report);
  await settle();
  assert.equal(view.queue.snapshot().items[bad].status, 'error');
  assert.equal(view.queue.snapshot().items[good].status, 'completed');
  assert.equal(view.reports.get(report.reportId).title, 'Buraco');
  assert.equal(view.stored.has(bad), true);
  assert.equal(view.stored.has(good), false);
});

test('reenviar usa o mesmo identificador e cliques concorrentes não duplicam transporte', async () => {
  const view = fixture();
  const id = await view.queue.enqueue(photo('bad.jpg'), report);
  await settle();
  let complete;
  view.deps.upload = async () => { await new Promise(resolve => { complete = resolve; }); };
  // As dependências de transporte são estáveis; use uma nova fila restaurada.
  const restored = createReportUploadQueue(view.deps);
  await restored.restore();
  const retry = restored.retry(id);
  await settle();
  await restored.retry(id);
  complete();
  await retry;
  assert.equal(restored.snapshot().items[id].status, 'completed');
  assert.equal(view.requests.filter(([action, itemId]) => action === 'complete' && itemId === id).length, 1);
});

test('reabrir restaura o arquivo e autorização anônima para a mesma bronca', async () => {
  const view = fixture();
  const anonymous = { reportId: 'anon-1', anonymous: true, recoveryToken: 'capability', title: 'Relato' };
  const id = await view.queue.enqueue(photo('bad.jpg'), anonymous);
  await settle();
  const restored = createReportUploadQueue(view.deps);
  await restored.restore();
  const item = restored.snapshot().items[id];
  assert.equal(item.status, 'error');
  assert.equal(item.source.file.size, 5);
  assert.equal(item.recoveryToken, 'capability');
  assert.equal(restored.snapshot().reports['anon-1'].recoveryToken, 'capability');
});

test('trocar imagem cria outro arquivo na mesma bronca e remove só a pendência selecionada', async () => {
  const view = fixture();
  const id = await view.queue.enqueue(photo('bad.jpg'), report);
  const other = await view.queue.enqueue(photo('good.jpg'), report);
  await settle();
  const nextId = await view.queue.replace(id, photo('replacement.jpg'));
  await settle();
  assert.notEqual(id, nextId);
  assert.equal(view.queue.snapshot().items[id], undefined);
  assert.equal(view.queue.snapshot().items[nextId].reportId, report.reportId);
  assert.equal(view.queue.snapshot().items[other].status, 'completed');
});

test('arquivo já recebido ou finalizado não é enviado outra vez ao recuperar', async () => {
  for (const prepared of [{ uploaded: true }, { completed: true }]) {
    const view = fixture();
    view.deps.api = async () => prepared;
    view.deps.upload = async () => assert.fail('Não deve repetir PUT');
    const queue = createReportUploadQueue(view.deps);
    const id = await queue.enqueue(photo('good.jpg'), report);
    await settle();
    assert.equal(queue.snapshot().items[id].status, 'completed');
  }
});

test('falha no armazenamento mantém reenvio na sessão e avisa que não persistiu', async () => {
  const view = fixture();
  view.deps.store.saveUpload = async () => { throw new Error('QuotaExceededError'); };
  const queue = createReportUploadQueue(view.deps);
  const id = await queue.enqueue(photo('bad.jpg'), report);
  await settle();
  assert.equal(queue.snapshot().storageError, true);
  assert.equal(queue.snapshot().items[id].status, 'error');
  assert.equal(queue.snapshot().items[id].source.file.size, 5);
});

test('falha na leitura da imagem fica disponível para substituição', async () => {
  const view = fixture();
  view.deps.prepareSource = async () => { throw new Error('HEIC incompatível'); };
  const queue = createReportUploadQueue(view.deps);
  const id = await queue.enqueue(photo('bad.jpg'), report);
  await settle();
  assert.equal(queue.snapshot().items[id].error, 'HEIC incompatível');
  assert.equal(view.sent.length, 0);
  assert.equal(view.stored.has(id), true);
});
