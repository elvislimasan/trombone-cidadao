import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('novas categorias do Guia são globais e reutilizáveis', async () => {
  const [page, migration] = await Promise.all([
    read('src/pages/admin/ManageServicesPage.jsx'),
    read('supabase/migrations/256_directory_categories_global_creation.sql'),
  ]);

  assert.match(page, /from\('directory_categories'\)\.insert\(\{[\s\S]*?city_id: null/);
  assert.doesNotMatch(page, /Cidade da categoria/);
  assert.match(migration, /city_id is null[\s\S]*?public\.can_write\(auth\.uid\(\), 'services'\)/);
  assert.match(migration, /from public\.ambassador_cities/);
});

test('categorias globais compartilhadas ficam protegidas contra edição local', async () => {
  const migration = await read('supabase/migrations/256_directory_categories_global_creation.sql');

  const updatePolicy = migration.match(/create policy directory_categories_managers_update[\s\S]+?;\n\n/)?.[0] || '';
  const deletePolicy = migration.match(/create policy directory_categories_managers_delete[\s\S]+?;\n\n/)?.[0] || '';
  assert.match(updatePolicy, /city_id is not null/);
  assert.match(deletePolicy, /city_id is not null/);
});
