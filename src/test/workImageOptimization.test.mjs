import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('galeria oferece redimensionamento no botão direito e no menu móvel', async () => {
  const gallery = await read('src/components/project/obra/ObraGallery.jsx');

  assert.match(gallery, /onContextMenu=\{\(e\) => \{/);
  assert.match(gallery, /setMediaContextMenu\(\{ item, x: e\.clientX, y: e\.clientY \}\)/);
  assert.match(gallery, /Redimensionar imagem/);
  assert.match(gallery, /1600 px — qualidade alta/);
  assert.match(gallery, /1200 px — equilibrado/);
  assert.match(gallery, /800 px — arquivo menor/);
});

test('substituição da foto antiga é segura e força a redução das dimensões', async () => {
  const [optimizer, imageOptimizer] = await Promise.all([
    read('src/lib/optimizeStoredWorkImage.js'),
    read('src/lib/optimizeImage.js'),
  ]);

  assert.match(optimizer, /forceResize: true/);
  assert.match(imageOptimizer, /!dimensionsChanged && !forceResize/);
  assert.match(optimizer, /\.eq\('url', item\.url\)\s*\.select\('id'\)/);
  assert.match(optimizer, /if \(updateError \|\| !updated\?\.length\)/);
  assert.match(optimizer, /removeOriginalIfUnreferenced\(item\.url, path\)/);
  assert.match(optimizer, /optimizeStoredWorkThumbnail/);
});

test('redimensionamento funciona na obra e no modal Gerenciar', async () => {
  const [page, manager] = await Promise.all([
    read('src/pages/WorkDetailsPageProject.jsx'),
    read('src/components/admin/WorkGalleryManager.jsx'),
  ]);

  assert.match(page, /onOptimizeMediaItem=\{handleOptimizeMediaItem\}/);
  assert.match(manager, /onOptimizeMediaItem=\{handleOptimizeMediaItem\}/);
  assert.match(page, /optimizeStoredWorkImage\(item, options\)/);
  assert.match(manager, /optimizeStoredWorkImage\(item, options\)/);
});
