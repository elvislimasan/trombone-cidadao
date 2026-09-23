// Faces fechadas da rede de eixos viários. A tolerância une somente pequenas
// diferenças de desenho nos encontros entre ruas.
// Coordenadas cartesianas (as mesmas utilizadas pelo desenho do PDF).
export function streetBlocks(lines, { snapTolerance = 0 } = {}) {
  const segments = lines.flatMap((line) => line.slice(1).map((b, i) => ({
    a: line[i], b, cuts: [0, 1],
  }))).filter(({ a, b }) => Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-7);
  const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const cut = (s, t) => { if (t >= -1e-8 && t <= 1 + 1e-8) s.cuts.push(Math.max(0, Math.min(1, t))); };
  const projetarNoSegmento = (p, s) => {
    const vetor = sub(s.b, s.a);
    const tamanho2 = vetor[0] ** 2 + vetor[1] ** 2;
    if (tamanho2 <= 1e-12) return null;
    const t = ((p[0] - s.a[0]) * vetor[0] + (p[1] - s.a[1]) * vetor[1]) / tamanho2;
    if (t < -1e-8 || t > 1 + 1e-8) return null;
    const limitado = Math.max(0, Math.min(1, t));
    const ponto = [s.a[0] + vetor[0] * limitado, s.a[1] + vetor[1] * limitado];
    return { t: limitado, distancia: Math.hypot(p[0] - ponto[0], p[1] - ponto[1]) };
  };
  for (let i = 0; i < segments.length; i += 1) {
    const s = segments[i];
    const r = sub(s.b, s.a);
    for (let j = i + 1; j < segments.length; j += 1) {
      const t = segments[j];
      if (Math.max(s.a[0], s.b[0]) + snapTolerance < Math.min(t.a[0], t.b[0])
        || Math.max(t.a[0], t.b[0]) + snapTolerance < Math.min(s.a[0], s.b[0])
        || Math.max(s.a[1], s.b[1]) + snapTolerance < Math.min(t.a[1], t.b[1])
        || Math.max(t.a[1], t.b[1]) + snapTolerance < Math.min(s.a[1], s.b[1])) continue;
      const v = sub(t.b, t.a);
      const q = sub(t.a, s.a);
      const den = cross(r, v);
      if (Math.abs(den) > 1e-10) {
        const u = cross(q, v) / den;
        const w = cross(q, r) / den;
        if (u >= -1e-8 && u <= 1 + 1e-8 && w >= -1e-8 && w <= 1 + 1e-8) {
          cut(s, u); cut(t, w);
        }
      } else if (Math.abs(cross(q, r)) < 1e-10) {
        const axis = Math.abs(r[0]) > Math.abs(r[1]) ? 0 : 1;
        cut(s, (t.a[axis] - s.a[axis]) / r[axis]);
        cut(s, (t.b[axis] - s.a[axis]) / r[axis]);
        cut(t, (s.a[axis] - t.a[axis]) / v[axis]);
        cut(t, (s.b[axis] - t.a[axis]) / v[axis]);
      }
      if (snapTolerance > 0) {
        for (const p of [s.a, s.b]) {
          const projecao = projetarNoSegmento(p, t);
          if (projecao && projecao.distancia <= snapTolerance) cut(t, projecao.t);
        }
        for (const p of [t.a, t.b]) {
          const projecao = projetarNoSegmento(p, s);
          if (projecao && projecao.distancia <= snapTolerance) cut(s, projecao.t);
        }
      }
    }
  }
  const nodes = new Map();
  const buckets = new Map();
  let proximoId = 1;
  const node = (p) => {
    if (snapTolerance > 0) {
      let maisProximo = null;
      let menorDistancia = snapTolerance;
      const bx = Math.floor(p[0] / snapTolerance);
      const by = Math.floor(p[1] / snapTolerance);
      for (let dx = -1; dx <= 1; dx += 1) {
        for (let dy = -1; dy <= 1; dy += 1) {
          for (const existente of buckets.get(`${bx + dx},${by + dy}`) || []) {
            const distancia = Math.hypot(p[0] - existente.p[0], p[1] - existente.p[1]);
            if (distancia <= menorDistancia) {
              maisProximo = existente;
              menorDistancia = distancia;
            }
          }
        }
      }
      if (maisProximo) return maisProximo;
    }
    const key = snapTolerance > 0 ? `n${proximoId++}` : p.map((n) => n.toFixed(6)).join(',');
    if (!nodes.has(key)) {
      const novo = { key, p, neighbors: new Set() };
      nodes.set(key, novo);
      if (snapTolerance > 0) {
        const bucket = `${Math.floor(p[0] / snapTolerance)},${Math.floor(p[1] / snapTolerance)}`;
        buckets.set(bucket, [...(buckets.get(bucket) || []), novo]);
      }
    }
    return nodes.get(key);
  };
  for (const s of segments) {
    const cuts = [...new Set(s.cuts)].sort((a, b) => a - b);
    const points = cuts.map((t) => node(s.a.map((n, i) => n + (s.b[i] - n) * t)));
    for (let i = 1; i < points.length; i += 1) {
      const a = points[i - 1]; const b = points[i];
      if (a === b) continue;
      a.neighbors.add(b); b.neighbors.add(a);
    }
  }
  // Pontas e ramificações não delimitam quadras. Retirá-las evita que uma rua
  // sem saída contamine o percurso de uma face fechada vizinha.
  const fila = [...nodes.values()].filter((n) => n.neighbors.size < 2);
  while (fila.length > 0) {
    const atual = fila.pop();
    if (atual.neighbors.size >= 2) continue;
    for (const vizinho of [...atual.neighbors]) {
      vizinho.neighbors.delete(atual);
      atual.neighbors.delete(vizinho);
      if (vizinho.neighbors.size < 2) fila.push(vizinho);
    }
  }
  for (const n of nodes.values()) n.sorted = [...n.neighbors].sort((a, b) => (
    Math.atan2(a.p[1] - n.p[1], a.p[0] - n.p[0]) - Math.atan2(b.p[1] - n.p[1], b.p[0] - n.p[0])
  ));
  const visited = new Set(); const faces = [];
  const edge = (a, b) => `${a.key}>${b.key}`;
  for (const start of nodes.values()) for (const next of start.sorted) {
    if (visited.has(edge(start, next))) continue;
    let a = start; let b = next;
    const ring = []; let closed = false;
    while (!visited.has(edge(a, b))) {
      visited.add(edge(a, b)); ring.push(a.p);
      const index = b.sorted.indexOf(a);
      const c = b.sorted[(index - 1 + b.sorted.length) % b.sorted.length];
      a = b; b = c;
      if (a === start && b === next) { closed = true; break; }
    }
    // Positive winding selects bounded faces; repeated vertices indicate
    // nested disconnected contours, so omit those faces.
    const area = ring.reduce((sum, p, i) => sum + cross(p, ring[(i + 1) % ring.length]), 0) / 2;
    if (closed && area > 0.5 && new Set(ring.map((p) => p.join(','))).size === ring.length) faces.push(ring);
  }
  return faces;
}
