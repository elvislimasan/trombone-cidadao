import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

test('qualquer conta pode criar um perfil social sem virar uma identidade institucional', async () => {
  const [editor, publicPage, usernameMigration] = await Promise.all([
    read('src/components/EditProfileModal.jsx'),
    read('src/pages/PublicProfilePage.jsx'),
    read('supabase/migrations/250_username_is_public_profile.sql'),
  ]);

  assert.match(editor, /Perfil público/);
  assert.match(editor, /Escolha um @username para compartilhar/);
  assert.match(editor, /public_profile_enabled: Boolean\(username\)/);
  assert.match(editor, /trombonecidadao\.com\.br\/u\/\{username\}/);
  assert.match(publicPage, /profile\.verification_status === 'verified' && profile\.public_profile_type !== 'citizen'/);
  assert.match(usernameMigration, /set public_profile_enabled = true/);
  assert.match(usernameMigration, /profiles_sync_public_profile_trigger/);
});

test('seguir perfis impede auto vínculo e alimenta acompanhamento e notificações', async () => {
  const [migration, profilePage, followingPage, app, people] = await Promise.all([
    read('supabase/migrations/249_public_profile_follows.sql'),
    read('src/pages/PublicProfilePage.jsx'),
    read('src/pages/FollowingActivityPage.jsx'),
    read('src/App.jsx'),
    read('src/components/FollowingPeople.jsx'),
  ]);

  assert.match(migration, /constraint profile_follows_no_self check \(follower_id <> followed_id\)/);
  assert.match(migration, /set_public_profile_follow/);
  assert.match(migration, /get_following_activity/);
  assert.match(migration, /notify_profile_followers_new_report/);
  assert.match(profilePage, /followState\.is_following \? 'Seguindo' : 'Seguir'/);
  assert.match(people, /Publicações recentes/);
  assert.match(followingPage, /!user \?/);
  assert.match(followingPage, /<FollowingPeople/);
  assert.match(app, /path="\/seguindo" element=\{<FollowingActivityPage/);
});

test('página legislativa continua separada do perfil social', async () => {
  const [publicPage, profilePage] = await Promise.all([
    read('src/pages/PublicProfilePage.jsx'),
    read('src/pages/ProfilePage.jsx'),
  ]);

  assert.match(publicPage, /Atuação pública verificada/);
  assert.match(profilePage, /Gerenciar página legislativa/);
  assert.match(profilePage, /Criar meu perfil público/);
});

test('Apache encaminha o perfil compartilhado para a prévia com foto', async () => {
  const [htaccess, shareFunction] = await Promise.all([
    read('public/.htaccess'),
    read('supabase/functions/share-public-profile/index.ts'),
  ]);

  assert.ok(htaccess.includes('RewriteRule ^share/perfil/([^/?]+)$'));
  assert.match(htaccess, /functions\/v1\/share-public-profile\?username=\$1/);
  assert.ok(htaccess.includes('RewriteRule ^u/([^/?]+)$'));
  assert.match(shareFunction, /profile\.avatar_url \|\| cityImage/);
  assert.match(shareFunction, /og:image/);
});

test('perfil autenticado reúne identidade social e gestão das contribuições', async () => {
  const [profilePage, dashboard, settings, app, header] = await Promise.all([
    read('src/pages/ProfilePage.jsx'),
    read('src/pages/UserDashboardPage.jsx'),
    read('src/pages/ProfileSettingsPage.jsx'),
    read('src/App.jsx'),
    read('src/components/Header.jsx'),
  ]);

  assert.match(profilePage, /<UserDashboardPage embedded profileMode/);
  assert.match(profilePage, /const hasPublicProfile = Boolean\(user\?\.username\)/);
  assert.match(profilePage, /Ver como público/);
  assert.match(profilePage, /to="\/configuracoes"/);
  assert.match(dashboard, /profileMode/);
  assert.match(settings, /Preferências, segurança e conta/);
  assert.match(app, /path="\/painel-usuario"[\s\S]+?<LegacyUserDashboardRedirect/);
  assert.doesNotMatch(header, /<span>Meu Painel<\/span>/);
});
