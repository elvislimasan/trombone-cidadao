import assert from 'node:assert/strict';
import test from 'node:test';
import { runWorkImageBatch } from '../lib/runWorkImageBatch.js';

test('o lote percorre páginas, ignora fotos adequadas e continua após uma falha', async () => {
  const seen = [];
  const results = [];
  const rows = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const result = await runWorkImageBatch({
    pageSize: 2,
    sources: [{
      label: 'Fotos',
      loadPage: async (offset, size) => rows.slice(offset, offset + size),
      optimize: async ({ id }) => {
        seen.push(id);
        if (id === 2) throw new Error('Falhou');
        return { changed: id === 1 };
      },
    }],
    onResult: ({ status }) => results.push(status),
  });
  assert.deepEqual(seen, [1, 2, 3]);
  assert.deepEqual(results, ['changed', 'failed', 'skipped']);
  assert.equal(result.stopped, false);
});

test('o lote para antes de iniciar outra foto quando solicitado', async () => {
  const seen = [];
  let stop = false;
  const result = await runWorkImageBatch({
    sources: [{
      label: 'Fotos',
      loadPage: async () => [{ id: 1 }, { id: 2 }],
      optimize: async ({ id }) => { seen.push(id); stop = true; return { changed: true }; },
    }],
    shouldStop: () => stop,
  });
  assert.deepEqual(seen, [1]);
  assert.equal(result.stopped, true);
});
