export function createBoundaryEditor({ points, source }) {
  return { points, source, selected: points.length ? points.length - 1 : null,
    mode: points.length ? 'edit' : 'add', direction: 'after', past: [], future: [] };
}

const snapshot = ({ points, source, selected, mode, direction }) => ({ points, source, selected, mode, direction });
const samePoint = (a, b) => a[0] === b[0] && a[1] === b[1];

// A curva passa pela alça arrastada. Amostramos em WGS84 para manter o mesmo
// polígono no editor, no mapa, no banco e no PDF, sem suavizar os outros lados.
export function curveBoundarySegment(points, index, through, steps = 16) {
  if (points.length < 2 || index < 0 || index >= points.length
    || (points.length === 2 && index !== 0)) return points;
  const a = points[index], b = points[(index + 1) % points.length];
  if (samePoint(through, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2])) return points;
  const control = through.map((value, axis) => 2 * value - (a[axis] + b[axis]) / 2);
  const arc = Array.from({ length: steps - 1 }, (_, i) => {
    const t = (i + 1) / steps;
    return a.map((value, axis) => (1 - t) ** 2 * value + 2 * (1 - t) * t * control[axis] + t ** 2 * b[axis]);
  });
  return [...points.slice(0, index + 1), ...arc, ...points.slice(index + 1)];
}

export function boundaryEditorReducer(state, action) {
  if (action.type === 'select') return { ...state, selected: action.index };
  if (action.type === 'mode') return { ...state, mode: action.mode };
  if (action.type === 'direction') return { ...state, direction: action.direction };
  if (action.type === 'undo' || action.type === 'redo') {
    const undo = action.type === 'undo';
    const stack = undo ? state.past : state.future;
    if (!stack.length) return state;
    return { ...state, ...stack.at(-1),
      past: undo ? state.past.slice(0, -1) : [...state.past, snapshot(state)],
      future: undo ? [...state.future, snapshot(state)] : state.future.slice(0, -1) };
  }
  let points = state.points, selected = state.selected, source = state.source, mode = state.mode;
  switch (action.type) {
    case 'insert': {
      const index = action.after != null ? action.after + 1 : selected == null ? points.length
        : selected + (state.direction === 'after' ? 1 : 0);
      points = [...points.slice(0, index), action.point, ...points.slice(index)];
      selected = index;
      break;
    }
    case 'move':
      if (!points[action.index] || samePoint(points[action.index], action.point)) return state;
      points = points.map((point, i) => i === action.index ? action.point : point);
      selected = action.index;
      break;
    case 'remove':
      if (selected == null || !points[selected]) return state;
      points = points.filter((_, i) => i !== selected);
      selected = points.length ? Math.min(selected, points.length - 1) : null;
      break;
    case 'clear':
      if (!points.length) return state;
      points = []; selected = null; mode = 'add';
      break;
    case 'curve':
      points = curveBoundarySegment(points, action.index, action.point);
      if (points === state.points) return state;
      selected = action.index;
      break;
    case 'import':
      points = action.points; source = action.source; selected = null; mode = 'edit';
      break;
    default: return state;
  }
  if (action.type !== 'import' && source?.provider === 'osm') source = { ...source, modified: true };
  return { ...state, points, selected, source, mode, past: [...state.past, snapshot(state)], future: [] };
}
