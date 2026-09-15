import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('ranking fica depois do painel de mapa para não reduzir o canvas', async () => {
  const page = await read('src/pages/PavementMapPage.jsx');
  const mapPanelEnd = page.indexOf('</motion.div>');
  const ranking = page.indexOf('<CouncilorRankingCard');

  assert.ok(mapPanelEnd > 0, 'painel principal do mapa não encontrado');
  assert.ok(ranking > mapPanelEnd, 'ranking deve ser renderizado fora e depois do painel com altura de viewport');
  assert.match(page.slice(mapPanelEnd, ranking), /max-w-\[112rem\]/);
});
