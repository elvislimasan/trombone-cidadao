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

test('transportes e pontos turísticos são migrados para categorias do Guia', async () => {
  const [migration, publicPage, managePage] = await Promise.all([
    read('supabase/migrations/264_unify_city_guide_categories.sql'),
    read('src/pages/ServicesPage.jsx'),
    read('src/pages/admin/ManageServicesPage.jsx'),
  ]);

  assert.match(migration, /'Transportes'/);
  assert.match(migration, /'Pontos turísticos'/);
  assert.match(migration, /from public\.transport t/);
  assert.match(migration, /from public\.tourist_spots s/);
  assert.match(migration, /guide_metadata/);
  assert.match(publicPage, /useState\(null\)/);
  assert.doesNotMatch(publicPage, /Todos os locais/);
  assert.doesNotMatch(publicPage, /from\('transport'\)|from\('tourist_spots'\)/);
  assert.doesNotMatch(managePage, /TabsTrigger value="transport"|TabsTrigger value="tourist_spots"/);
});

test('explorador de documentos permite arrastar e usar menu de contexto', async () => {
  const organizer = await read('src/components/project/obra/WorkDocumentOrganizer.jsx');

  assert.match(organizer, /draggable=\{!busy && canEdit\}/);
  assert.match(organizer, /onDrop=\{\(event\) => dropItem\(event, folder\.id\)\}/);
  assert.match(organizer, /document_folder_id: targetId/);
  assert.match(organizer, /onContextMenu=\{\(event\) => openContextMenu/);
  assert.match(organizer, /Mover para\.\.\./);
  assert.match(organizer, /onMoveFolder\?\./);
});

test('modal Gerenciar reutiliza o explorador e persiste suas pastas', async () => {
  const manager = await read('src/components/admin/WorkGalleryManager.jsx');

  assert.match(manager, /from\("public_work_document_folders"\)/);
  assert.match(manager, /<WorkDocumentOrganizer/);
  assert.match(manager, /onMoveFolder=\{handleMoveDocumentFolder\}/);
  assert.match(manager, /document_folder_id: folderId \|\| null/);
});
