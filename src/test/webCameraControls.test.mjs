import test from 'node:test';
import assert from 'node:assert/strict';
import { webCameraCapabilities, photoZoomCrop, applyWebCameraControls, fitCameraPreview } from '../lib/webCameraControls.js';

test('detecta zoom e flash por câmera e respeita o intervalo do hardware', () => {
  const controls = webCameraCapabilities({
    getCapabilities: () => ({ zoom: { min: 1, max: 8, step: 0.25 }, torch: [false, true] }),
    getSettings: () => ({ zoom: 2 }), applyConstraints() {},
  });
  assert.equal(controls.hardwareZoom, true);
  assert.equal(controls.torch, true);
  assert.equal(controls.value, 2);
  assert.deepEqual(controls.zoom, { min: 1, max: 8, step: 0.25 });
  assert.equal(webCameraCapabilities({ getCapabilities: () => ({ torch: true }), applyConstraints() {} }).torch, true);
});

test('usa zoom digital para foto quando capacidades faltam e não anuncia flash indisponível', () => {
  for (const track of [null, {}, { getCapabilities() { throw new Error('unsupported'); } }, {
    getCapabilities: () => ({ torch: [false], zoom: { min: 1, max: 1 } }),
  }]) {
    const controls = webCameraCapabilities(track);
    assert.equal(controls.hardwareZoom, false);
    assert.equal(controls.torch, false);
    assert.deepEqual(controls.zoom, { min: 1, max: 4, step: 0.1 });
  }
  assert.equal(webCameraCapabilities(null, 'video').zoom.max, 1);
});

test('zoom digital recorta a foto no centro, sem mudar a proporção', () => {
  assert.deepEqual(photoZoomCrop(1280, 720, 2), { x: 320, y: 180, width: 640, height: 360 });
  assert.deepEqual(photoZoomCrop(720, 1280, 4), { x: 270, y: 480, width: 180, height: 320 });
  assert.deepEqual(photoZoomCrop(1280, 720, NaN), { x: 0, y: 0, width: 1280, height: 720 });
});

test('aplica zoom e flash juntos; a falha do hardware não vira sucesso', async () => {
  const calls = [];
  await applyWebCameraControls({ applyConstraints: async (value) => calls.push(value) }, { zoom: 3, torch: true });
  assert.deepEqual(calls, [{ advanced: [{ zoom: 3, torch: true }] }]);
  await assert.rejects(applyWebCameraControls({ applyConstraints: async () => { throw new Error('unsupported'); } }, { torch: true }), /unsupported/);
});

test('prévia cabe em celular e desktop 1440/1920, mantendo a proporção do recorte', () => {
  for (const width of [360, 1440, 1920]) {
    for (const [frameWidth, frameHeight] of [[1280, 720], [720, 1280]]) {
      const fitted = fitCameraPreview(width, 640, frameWidth, frameHeight);
      assert.ok(fitted.width <= width && fitted.height <= 640);
      assert.ok(Math.abs(fitted.width / fitted.height - frameWidth / frameHeight) < 0.0001);
    }
  }
});
