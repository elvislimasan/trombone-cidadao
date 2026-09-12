import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('o admin vincula uma conta e controla a verificação da página legislativa', async () => {
  const [migration, adminPage] = await Promise.all([
    read('supabase/migrations/246_councilor_account_link.sql'),
    read('src/pages/admin/ManageCouncilorsPage.jsx'),
  ]);

  assert.match(migration, /claim_status in \('unclaimed', 'linked', 'verified', 'suspended'\)/);
  assert.match(migration, /set_councilor_account_link/);
  assert.match(migration, /protect_councilor_identity_fields/);
  assert.match(adminPage, /\.from\('profiles'\)/);
  assert.match(adminPage, /\.rpc\('set_councilor_account_link'/);
  assert.match(adminPage, /Identidade confirmada/);
});

test('o titular edita somente a apresentação e os canais públicos em uma tela privada', async () => {
  const [migration, managePage, app] = await Promise.all([
    read('supabase/migrations/246_councilor_account_link.sql'),
    read('src/pages/ManageMyCouncilorPage.jsx'),
    read('src/App.jsx'),
  ]);

  assert.match(migration, /update_my_councilor_page/);
  assert.doesNotMatch(
    migration.match(/create or replace function public\.update_my_councilor_page[\s\S]+?\$fn\$;/)?.[0] || '',
    /party\s*=/
  );
  assert.match(managePage, /\.rpc\('update_my_councilor_page'/);
  assert.match(managePage, /Nome, cidade, partido e vínculo são protegidos/);
  assert.doesNotMatch(managePage, /p_party/);
  assert.match(app, /path="\/perfil\/pagina-legislativa\/:councilorId"[\s\S]+?<PrivateRoute>/);
});

test('perfil pessoal não pode conceder a si mesmo identidade ou verificação', async () => {
  const migration = await read('supabase/migrations/246_councilor_account_link.sql');

  assert.match(migration, /protect_profile_identity_fields/);
  assert.match(migration, /new\.public_profile_type is distinct from old\.public_profile_type/);
  assert.match(migration, /new\.verification_status is distinct from old\.verification_status/);
});

test('conta e página legislativa possuem navegação nos dois sentidos', async () => {
  const [myProfile, publicProfile, councilorPage] = await Promise.all([
    read('src/pages/ProfilePage.jsx'),
    read('src/pages/PublicProfilePage.jsx'),
    read('src/pages/CouncilorProfilePage.jsx'),
  ]);

  assert.match(myProfile, /Ver página legislativa/);
  assert.match(myProfile, /rotaDoVereador\(page\.city_id, page\.slug\)/);
  assert.match(publicProfile, /Atuação pública verificada/);
  assert.match(councilorPage, /accountIdentity\?\.profile\?\.username && <Link to=\{`\/u\//);
});

test('gestão sai da página pública e respeita admin sem vínculo ou o próprio titular', async () => {
  const councilorPage = await read('src/pages/CouncilorProfilePage.jsx');

  assert.match(councilorPage, /const canEditAsAdmin = isAdmin && !hasLinkedOwner/);
  assert.match(councilorPage, /const canEditPage = hasLinkedOwner \? isOwner : canEditAsAdmin/);
  assert.match(councilorPage, /\/perfil\/pagina-legislativa\/\$\{councilor\?\.id\}/);
  assert.match(councilorPage, /\/admin\/vereadores\?editar=\$\{councilor\.id\}/);
  assert.match(councilorPage, /Gerenciar página/);
  assert.doesNotMatch(councilorPage, /Editar página legislativa/);
});

test('ações públicas são úteis para visitantes e não tratam o titular como visitante', async () => {
  const councilorPage = await read('src/pages/CouncilorProfilePage.jsx');

  assert.match(councilorPage, /const hasActiveLink = Boolean/);
  assert.match(councilorPage, /const showParticipation = hasActiveLink && !isOwner/);
  assert.match(councilorPage, /contactHref && !isOwner/);
  assert.match(councilorPage, /\{hasPublicContacts && <section/);
  assert.doesNotMatch(councilorPage, /<nav className=.*Seções da página/);
});

test('voltar não reserva uma faixa própria no layout móvel', async () => {
  const councilorPage = await read('src/pages/CouncilorProfilePage.jsx');

  assert.match(councilorPage, /mb-3 hidden sm:block[^>]*><BackButton/);
  assert.match(councilorPage, /px-3 py-2 sm:px-5 sm:py-6/);
});

test('unificação de duplicados fica na gestão administrativa', async () => {
  const adminPage = await read('src/pages/admin/ManageCouncilorsPage.jsx');

  assert.match(adminPage, /Cadastro duplicado/);
  assert.match(adminPage, /\.rpc\('merge_councilor_profiles'/);
  assert.match(adminPage, /Unificar cadastros/);
});

test('foto do vereador é enviada como arquivo em vez de exigir URL', async () => {
  const [ownerPage, adminPage, uploader] = await Promise.all([
    read('src/pages/ManageMyCouncilorPage.jsx'),
    read('src/pages/admin/ManageCouncilorsPage.jsx'),
    read('src/components/CouncilorPhotoUploader.jsx'),
  ]);

  assert.match(ownerPage, /<CouncilorPhotoUploader/);
  assert.match(adminPage, /<CouncilorPhotoUploader/);
  assert.doesNotMatch(ownerPage, /URL da foto/);
  assert.doesNotMatch(adminPage, /URL da foto/);
  assert.doesNotMatch(ownerPage, /<img/);
  assert.match(uploader, /type="file"/);
  assert.match(uploader, /\.from\('profile-avatars'\)\.upload|\.from\('profile-avatars'\)\s*\.upload/);
});
