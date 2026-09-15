import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const ler = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('o app nativo nunca compartilha a origem localhost do WebView', async () => {
  const source = await ler('src/lib/shareUtils.js');
  const nativeGuard = source.indexOf('Capacitor.isNativePlatform()');
  const browserOrigin = source.indexOf('window.location.origin');
  assert.ok(nativeGuard >= 0 && nativeGuard < browserOrigin);
  assert.match(source, /\/share\/radar\/\$\{id\}/);
});

test('o Radar possui preview social grande com a foto do acontecimento', async () => {
  const source = await ler('supabase/functions/share-city-event/index.ts');
  assert.match(source, /event\.image_url/);
  assert.match(source, /w=1200&h=630&fit=cover/);
  assert.match(source, /property="og:image"/);
  assert.match(source, /name="twitter:card" content="summary_large_image"/);
});

test('hospedagens e SPA reconhecem a rota compartilhada do Radar', async () => {
  const [vercel, apache, app] = await Promise.all([
    ler('vercel.json'),
    ler('public/.htaccess'),
    ler('src/App.jsx'),
  ]);
  assert.match(vercel, /\/share\/radar\/:id/);
  assert.match(apache, /share\/radar/);
  assert.match(app, /path="\/share\/radar\/:eventId"/);
});
