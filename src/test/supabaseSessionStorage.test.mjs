import test from 'node:test';
import assert from 'node:assert/strict';
import {
  prepareSupabaseAuthStorage,
  sessionProjectRef,
  supabaseProjectRef,
} from '../lib/supabaseSessionStorage.js';

const jwt = (payload) => {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none' })}.${encode(payload)}.signature`;
};

const memoryStorage = (initial = {}) => {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    dump: () => Object.fromEntries(values),
  };
};

test('extrai o projeto da URL e do emissor do JWT', () => {
  assert.equal(supabaseProjectRef('https://projeto-prod.supabase.co'), 'projeto-prod');
  assert.equal(sessionProjectRef(jwt({
    iss: 'https://projeto-prod.supabase.co/auth/v1',
  })), 'projeto-prod');
});

test('migra uma sessao legada somente para o mesmo projeto', () => {
  const legacySession = JSON.stringify({
    access_token: jwt({ iss: 'https://projeto-prod.supabase.co/auth/v1' }),
    refresh_token: 'refresh',
  });
  const storage = memoryStorage({ 'supabase-trombone-auth': legacySession });

  const storageKey = prepareSupabaseAuthStorage({
    storage,
    supabaseUrl: 'https://projeto-prod.supabase.co',
  });

  assert.equal(storageKey, 'supabase-trombone-auth-projeto-prod');
  assert.equal(storage.getItem(storageKey), legacySession);
  assert.equal(storage.getItem('supabase-trombone-auth'), null);
});

test('descarta a sessao legada pertencente a outro projeto', () => {
  const storage = memoryStorage({
    'supabase-trombone-auth': JSON.stringify({
      access_token: jwt({ ref: 'projeto-dev' }),
    }),
    'supabase-trombone-auth-code-verifier': 'verifier-antigo',
  });

  const storageKey = prepareSupabaseAuthStorage({
    storage,
    supabaseUrl: 'https://projeto-prod.supabase.co',
  });

  assert.equal(storage.getItem(storageKey), null);
  assert.deepEqual(storage.dump(), {});
});

