import test from 'node:test';
import assert from 'node:assert/strict';
import { isProfileIncomplete, shouldCompleteProfile, profileCompletionDestination } from '@/lib/profileOnboarding';

const complete = {
  id: 'citizen', name: 'Maria Silva', phone: '87999641234',
  state_id: 1, city_id: 2, terms_accepted_at: '2026-10-05T12:00:00Z',
};

test('Google identity alone requires completion on the OAuth landing page, feed and direct links', () => {
  const user = { id: 'google-user', name: 'Maria Silva', user_metadata: { name: 'Maria Silva' } };
  for (const pathname of ['/', '/feed', '/mapa', '/bronca/123', '/perfil', '/admin/usuarios']) {
    assert.equal(shouldCompleteProfile({ user, loading: false, pathname }), true, pathname);
  }
});

test('each missing required field triggers onboarding, including invalid or blank contact data', () => {
  for (const field of ['name', 'phone', 'state_id', 'city_id', 'terms_accepted_at']) {
    assert.equal(isProfileIncomplete({ ...complete, [field]: null }), true, field);
  }
  assert.equal(isProfileIncomplete({ ...complete, name: '  ' }), true);
  assert.equal(isProfileIncomplete({ ...complete, phone: '  ' }), true);
  assert.equal(isProfileIncomplete({ ...complete, phone: '123' }), true);
  assert.equal(isProfileIncomplete({ ...complete, phone: '(87) 99964-1234' }), false);
});

test('visitors, completed profiles and loading sessions are not redirected', () => {
  assert.equal(shouldCompleteProfile({ user: null, pathname: '/feed' }), false);
  assert.equal(shouldCompleteProfile({ user: complete, pathname: '/feed' }), false);
  assert.equal(shouldCompleteProfile({ user: { id: 'loading' }, loading: true, pathname: '/' }), false);
});

test('account, terms and municipal invitation flows remain accessible during onboarding', () => {
  for (const pathname of [
    '/login', '/cadastro', '/seja-embaixador', '/completar-cadastro', '/termos-de-uso',
    '/recuperar-senha', '/alterar-senha', '/excluir-conta',
    '/prefeitura/convite/token', '/prefeitura/convite/token/cadastro',
  ]) {
    assert.equal(shouldCompleteProfile({ user: { id: 'incomplete' }, pathname }), false, pathname);
  }
  assert.equal(shouldCompleteProfile({ user: { id: 'incomplete' }, pathname: '/prefeitura/convite' }), true);
});

test('municipal staff retain their existing access without the citizen onboarding', () => {
  for (const user of [{ tipo_conta: 'prefeitura' }, { has_municipality_access: true }]) {
    assert.equal(shouldCompleteProfile({ user, pathname: '/prefeitura/eletricista' }), false);
  }
});

test('completion preserves the intended page, report creation query and anchor', () => {
  const from = { pathname: '/mapa', search: '?criar_bronca=1&rua=123', hash: '#poste' };
  assert.deepEqual(profileCompletionDestination(from), from);
  assert.deepEqual(profileCompletionDestination({ pathname: '/perfil' }), { pathname: '/perfil', search: '', hash: '' });
});

test('completion without a valid destination returns to the feed without login loops', () => {
  for (const from of [undefined, {}, { pathname: '/completar-cadastro' }, { pathname: '/login' },
    { pathname: '/cadastro' }, { pathname: '//example.com' }, { pathname: 'https://example.com' }]) {
    assert.equal(profileCompletionDestination(from), '/feed');
  }
});
