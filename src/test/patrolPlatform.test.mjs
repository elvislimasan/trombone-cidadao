import test from 'node:test';
import assert from 'node:assert/strict';
import { isPatrolBlockedOnDesktop } from '@/lib/patrolPlatform';

test('a patrulha é bloqueada somente na web desktop', () => {
  assert.equal(isPatrolBlockedOnDesktop({ isNative: false, isDesktop: true }), true);
  assert.equal(isPatrolBlockedOnDesktop({ isNative: false, isDesktop: false }), false);
});

test('o app nativo mantém a patrulha mesmo em uma tela larga', () => {
  assert.equal(isPatrolBlockedOnDesktop({ isNative: true, isDesktop: true }), false);
});
