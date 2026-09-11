import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('o painel possui cadastro central de vereadores', async () => {
  const [app, admin, page] = await Promise.all([
    read('src/App.jsx'),
    read('src/pages/AdminPage.jsx'),
    read('src/pages/admin/ManageCouncilorsPage.jsx'),
  ]);

  assert.match(app, /path="\/admin\/vereadores"/);
  assert.match(admin, /handleManageContent\('\/admin\/vereadores'\)/);
  assert.match(page, /\.from\('councilors'\)\.insert/);
});

test('vereadores cadastrados antes da primeira rua aparecem no seletor de autores', async () => {
  const editor = await read('src/components/pavement/PavementEditModal.jsx');

  assert.match(editor, /\.from\('councilors'\)/);
  assert.match(editor, /registeredCouncilorAuthors/);
});

test('a migration importa autores antigos e sincroniza as próximas edições', async () => {
  const migration = await read('supabase/migrations/243_councilor_profiles.sql');

  assert.match(migration, /insert into public\.councilors[\s\S]+from public\.pavement_streets/);
  assert.match(migration, /councilor_authors/);
  assert.match(migration, /councilor_author/);
  assert.match(migration, /create trigger pavement_street_councilors_sync/);
});
