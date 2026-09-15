import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('página do vereador oferece compartilhamento social com card 9:16 e contadores', async () => {
  const [page, modal, card, storyAssets, cardAssets, shareFunction, htaccess] = await Promise.all([
    read('src/pages/CouncilorProfilePage.jsx'),
    read('src/components/councilor/CouncilorStoryModal.jsx'),
    read('src/components/councilor/CouncilorStoryCard.jsx'),
    read('src/lib/storyAssets.js'),
    read('src/lib/cardInstagramAssets.js'),
    read('supabase/functions/share-councilor/handler.tsx'),
    read('public/.htaccess'),
  ]);

  assert.match(page, /CouncilorStoryModal/);
  assert.match(modal, /STORY_WIDTH \* 0\.24/);
  assert.match(modal, /Publicar card/);
  assert.match(modal, /Copiar link/);
  assert.match(modal, /w-12 shrink-0/);
  assert.match(modal, /md:max-w-\[30rem\]/);
  assert.match(modal, /aria-modal="true"/);
  assert.match(modal, /streetNames/);
  assert.match(modal, /toDataUri\(URL_FUNDO_VEREADOR\)/);
  assert.match(card, /broncas publicadas no Trombone/);
  assert.match(card, /Algumas ruas nomeadas por/);
  assert.match(card, /color: GOLD, fontSize: 20/);
  assert.match(card, /color: GOLD, background: 'rgba\(239,43,54,.12\)'/);
  assert.match(card, /marginTop: 9, color: GOLD, fontSize: 27/);
  assert.doesNotMatch(card, /#ffd7da|#ffabb1/);
  assert.match(card, /councilorFirstName/);
  assert.match(card, /nameFontSize/);
  assert.match(card, /maxWidth: 740/);
  assert.match(card, /textWrap: 'balance'/);
  assert.match(card, /Confira todas na plataforma/);
  assert.doesNotMatch(card, /Conhecido como/);
  assert.match(card, /profileUrl/);
  assert.match(card, /rgba\(255,193,7,.82\)/);
  assert.match(card, /backgroundUrl/);
  assert.doesNotMatch(card, /ACESSE O PERFIL/);
  assert.match(storyAssets, /ARQUIVO_FUNDO_VEREADOR = 'bg-vereador\.png'/);
  assert.match(storyAssets, /mrejgpcxaevooofyenzq\.supabase\.co\/storage\/v1\/object\/public\/card-instagram/);
  assert.match(cardAssets, /String\(path \|\| ''\)\.trim\(\)/);
  assert.match(card, /STORY_WIDTH/);
  assert.match(card, /STORY_HEIGHT/);
  assert.match(shareFunction, /new ImageResponse/);
  assert.match(shareFunction, /streetCount/);
  assert.match(shareFunction, /reportCount > 0/);
  assert.match(htaccess, /functions\/v1\/share-councilor/);
});

test('situação do mandato pode ser administrada e aparece no perfil', async () => {
  const [migration, admin, page] = await Promise.all([
    read('supabase/migrations/260_short_profiles_councilor_status.sql'),
    read('src/pages/admin/ManageCouncilorsPage.jsx'),
    read('src/pages/CouncilorProfilePage.jsx'),
  ]);

  assert.match(migration, /add column if not exists is_in_office boolean/);
  assert.match(admin, /Situação do mandato/);
  assert.match(page, /Em exercício/);
  assert.match(page, /Fora do exercício/);
});
