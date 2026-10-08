import test from 'node:test';
import assert from 'node:assert/strict';
import { boundaryEditorReducer as reduce, createBoundaryEditor, curveBoundarySegment } from '../lib/neighborhoodBoundaryEditing.js';
import { boundaryValidationError, boundaryWkt, boundaryPoints } from '../lib/neighborhoodBoundary.js';

const points = [[0, 0], [4, 0], [4, 4], [0, 4]];
const initial = () => createBoundaryEditor({ points, source: { provider: 'osm', modified: false, object_id: 10 } });

test('continua de um vértice intermediário em ambas as direções sem reordenar o restante', () => {
  for (const direction of ['after', 'before']) {
    let state = reduce(initial(), { type: 'select', index: 1 });
    state = reduce(state, { type: 'direction', direction });
    state = reduce(state, { type: 'insert', point: [4, 1] });
    state = reduce(state, { type: 'insert', point: [4, 2] });
    assert.deepEqual(state.points, direction === 'after'
      ? [[0, 0], [4, 0], [4, 1], [4, 2], [4, 4], [0, 4]]
      : [[0, 0], [4, 2], [4, 1], [4, 0], [4, 4], [0, 4]]);
    assert.equal(state.source.modified, true);
  }
  assert.deepEqual(points, [[0, 0], [4, 0], [4, 4], [0, 4]]);
});

test('insere pontos no segmento de fechamento e no trecho escolhido sem depender da seleção', () => {
  const state = reduce(initial(), { type: 'insert', after: 3, point: [0, 2] });
  assert.deepEqual(state.points, [...points, [0, 2]]);
  assert.equal(boundaryValidationError(state.points), null);
  const next = reduce(state, { type: 'insert', after: 0, point: [2, 0] });
  assert.deepEqual(next.points, [[0, 0], [2, 0], ...points.slice(1), [0, 2]]);
  assert.equal(next.selected, 1);
});

test('selecionar não remove pontos; exclusão e limpeza são explícitas e reversíveis', () => {
  const selected = reduce(initial(), { type: 'select', index: 0 });
  assert.deepEqual(selected.points, points);
  assert.equal(selected.past.length, 0);
  const removed = reduce(selected, { type: 'remove' });
  assert.deepEqual(removed.points, points.slice(1));
  const cleared = reduce(removed, { type: 'clear' });
  assert.deepEqual(cleared.points, []);
  assert.equal(cleared.selected, null);
  assert.equal(cleared.mode, 'add');
  assert.deepEqual(reduce(reduce(cleared, { type: 'undo' }), { type: 'undo' }).points, points);
});

test('uma curva preserva os extremos e passa pela alça; o fechamento mantém a ordem GeoJSON', () => {
  for (const [index, through] of [[0, [2, -1]], [3, [-1, 2]]]) {
    const curved = curveBoundarySegment(points, index, through);
    assert.equal(curved.length, 19);
    assert.deepEqual(curved[index], points[index]);
    assert.deepEqual(curved[index + 8], through);
    assert.deepEqual(curved[(index + 16) % curved.length], points[(index + 1) % points.length]);
    assert.equal(boundaryValidationError(curved), null);
    assert.deepEqual(boundaryPoints({ type: 'Polygon', coordinates: [[...curved, curved[0]]] }), curved);
    assert.match(boundaryWkt(curved), /^SRID=4326;POLYGON/);
  }
  assert.equal(curveBoundarySegment(points, 0, [2, 0]), points);
});

test('desfazer/refazer recupera arraste, curva e procedência; uma nova edição descarta o refazer', () => {
  const original = initial();
  const moved = reduce(original, { type: 'move', index: 0, point: [-1, 0] });
  const curved = reduce(moved, { type: 'curve', index: 1, point: [5, 2] });
  const undoCurve = reduce(curved, { type: 'undo' });
  assert.deepEqual(undoCurve.points, moved.points);
  const undoMove = reduce(undoCurve, { type: 'undo' });
  assert.deepEqual(undoMove.points, original.points);
  assert.deepEqual(undoMove.source, original.source);
  assert.deepEqual(reduce(reduce(undoMove, { type: 'redo' }), { type: 'redo' }).points, curved.points);
  const branch = reduce(undoMove, { type: 'insert', point: [-1, 2] });
  assert.equal(branch.future.length, 0);
  assert.equal(reduce(branch, { type: 'redo' }), branch);
});

test('importação pode ser desfeita e novos desenhos começam em modo de adição', () => {
  let state = createBoundaryEditor({ points: [] });
  assert.equal(state.mode, 'add');
  state = reduce(state, { type: 'insert', point: points[0] });
  assert.equal(state.selected, 0);
  const imported = reduce(state, { type: 'import', points, source: { provider: 'osm', modified: false } });
  assert.equal(imported.mode, 'edit');
  assert.equal(imported.selected, null);
  assert.equal(imported.source.modified, false);
  assert.deepEqual(reduce(imported, { type: 'undo' }).points, [points[0]]);
});

test('cruzamentos introduzidos por curvas continuam bloqueados para salvamento', () => {
  const crossed = curveBoundarySegment(points, 0, [2, 6]);
  assert.ok(boundaryValidationError(crossed));
  assert.throws(() => boundaryWkt(crossed));
});
