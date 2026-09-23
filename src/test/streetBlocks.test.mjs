import test from 'node:test';
import assert from 'node:assert/strict';
import { streetBlocks } from '../lib/streetBlocks.js';

const square = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const area = (ring) => Math.abs(ring.reduce((s, p, i) => {
  const q = ring[(i + 1) % ring.length];
  return s + p[0] * q[1] - p[1] * q[0];
}, 0) / 2);

test('split crossings produce four bounded blocks, not the exterior', () => {
  const blocks = streetBlocks([square, [[5, -2], [5, 12]], [[-2, 5], [12, 5]]]);
  assert.equal(blocks.length, 4);
  assert.deepEqual(blocks.map(area), [25, 25, 25, 25]);
});
test('open streets and isolated points do not invent blocks', () => {
  assert.deepEqual(streetBlocks([square.slice(0, -1), [[4, 4]]]), []);
});
test('duplicate and overlapping edges do not duplicate a block', () => {
  const blocks = streetBlocks([square, square, [[2, 0], [8, 0]]]);
  assert.equal(blocks.length, 1);
  assert.equal(area(blocks[0]), 100);
});
test('small gaps at intersections are snapped into a valid block', () => {
  const blocks = streetBlocks([
    [[0, 0], [10, 0]],
    [[10.2, 0], [10.2, 10]],
    [[10.2, 10.15], [0, 10.15]],
    [[-0.15, 10.15], [-0.15, 0]],
  ], { snapTolerance: 0.3 });
  assert.equal(blocks.length, 1);
  assert.ok(area(blocks[0]) > 99 && area(blocks[0]) < 105);
});
test('distant gaps are not closed by snapping', () => {
  const blocks = streetBlocks([
    [[0, 0], [10, 0]], [[11, 0], [11, 10]],
    [[11, 10], [0, 10]], [[0, 10], [0, 0]],
  ], { snapTolerance: 0.3 });
  assert.equal(blocks.length, 0);
});
