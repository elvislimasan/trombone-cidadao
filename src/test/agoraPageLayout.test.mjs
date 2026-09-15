import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const pagina = await readFile(new URL('../pages/AgoraPage.jsx', import.meta.url), 'utf8');

test('cada alerta lateral é apresentado como um cartão separado', () => {
  assert.match(pagina, /grid gap-3 border-t border-edge-subtle bg-surface-base p-3/);
  assert.doesNotMatch(pagina, /<div className="divide-y divide-edge-subtle">/);
  assert.match(pagina, /group block overflow-hidden rounded-2xl border border-edge-subtle bg-surface-raised/);
  assert.match(pagina, /group flex items-center gap-2\.5 rounded-2xl border border-edge-subtle bg-surface-raised/);
});
