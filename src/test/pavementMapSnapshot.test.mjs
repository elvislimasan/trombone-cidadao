import test from 'node:test';
import assert from 'node:assert/strict';
import { capturarMapaVisivel, criarPdfDoMapaVisivel, enquadrarImagem, serializarCamadaSvg } from '../lib/pavementMapSnapshot.js';
import { Window } from 'happy-dom';

test('SVG exportado incorpora cores e transparência sem depender de classes CSS', () => {
  const window = new Window();
  const previous = globalThis.XMLSerializer;
  globalThis.XMLSerializer = window.XMLSerializer;
  try {
    const svg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = '<path class="via-pav" stroke="#3388ff" d="M0 0 L10 10" />';
    const result = serializarCamadaSvg(svg, () => ({ getPropertyValue: (key) => ({ stroke: 'rgb(22, 163, 74)', 'stroke-opacity': '0.78' })[key] || '' }));
    assert.match(result, /stroke: rgb\(22, 163, 74\)/);
    assert.match(result, /stroke-opacity: 0.78/);
    assert.ok(!result.includes('class='));
  } finally {
    globalThis.XMLSerializer = previous;
    window.happyDOM.abort();
  }
});

test('enquadramento preserva proporção sem cortar mapas desktop e mobile', () => {
  const box = { x: 14, y: 39, width: 392, height: 225 };
  for (const [width, height] of [[1440, 800], [1920, 900], [390, 700]]) {
    const result = enquadrarImagem(width, height, box);
    assert.ok(Math.abs(result.width / result.height - width / height) < 1e-8);
    assert.ok(result.x >= box.x - 1e-8 && result.y >= box.y - 1e-8);
    assert.ok(result.width <= box.width + 1e-8 && result.height <= box.height + 1e-8);
  }
});

test('captura recusa mapa ausente ou incompleto', async () => {
  await assert.rejects(capturarMapaVisivel(null), /Abra a visualização/);
  const map = {
    stop() {}, getCenter() { return {}; }, getZoom() { return 14; },
    getContainer() { return {
      getBoundingClientRect() { return { width: 800, height: 600 }; },
      querySelectorAll() { return []; },
    }; },
  };
  await assert.rejects(capturarMapaVisivel(map), /carregamento completo/);
});

test('PDF A3 inclui atribuição e não utiliza quadras inferidas', () => {
  const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
  const doc = criarPdfDoMapaVisivel({ image, width: 100, height: 100, cidade: 'Floresta', attribution: 'OpenStreetMap contributors', metersPerPixel: 10 });
  assert.equal(doc.getNumberOfPages(), 1);
  assert.ok(doc.internal.pageSize.getWidth() > doc.internal.pageSize.getHeight());
  assert.ok(doc.output().includes('OpenStreetMap contributors'));
  assert.ok(doc.output().includes('100 m'));
  assert.ok(doc.output().includes('0 ruas nos filtros'));
});
