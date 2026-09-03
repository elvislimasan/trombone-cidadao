import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveHomeEntry, resolvePostAuthFallback } from '@/lib/homeEntry';

test('a raiz do aplicativo nativo abre o feed sem esperar pela sessao', () => {
  assert.deepEqual(
    resolveHomeEntry({ isNative: true, loading: true, user: null }),
    { type: 'feed' }
  );
  assert.deepEqual(
    resolveHomeEntry({ isNative: true, loading: false, user: { is_admin: true } }),
    { type: 'feed' }
  );
});

test('a raiz da web mostra a Home ao visitante e o feed a quem entrou', () => {
  assert.deepEqual(
    resolveHomeEntry({ isNative: false, loading: false, user: null }),
    { type: 'home' }
  );
  assert.deepEqual(
    resolveHomeEntry({ isNative: false, loading: false, user: { id: '1' } }),
    { type: 'redirect', to: '/feed' }
  );
  assert.deepEqual(
    resolveHomeEntry({ isNative: false, loading: true, user: null }),
    { type: 'loading' }
  );
});

test('o retorno padrao pos-login abre o feed em qualquer plataforma', () => {
  assert.equal(resolvePostAuthFallback({ isNative: false }), '/feed');
  assert.equal(resolvePostAuthFallback({ isNative: true }), '/feed');
});
