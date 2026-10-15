import test from 'node:test';
import assert from 'node:assert/strict';
import { canWriteModule } from '../lib/modulePermissions.js';

const user = { id: 'planner', user_type: 'public_official' };
const role = allowed => ({ scope: 'role', role_name: 'urban_planner', module: 'urban_planning', allowed });
const individual = allowed => ({ scope: 'user', user_id: user.id, module: 'urban_planning', allowed });

test('mapa exige cargo e permissão, inclusive para administradores', () => {
  for (const flags of [{}, { is_admin: true }, { is_ambassador: true }, { has_municipality_access: true }]) {
    const account = { ...user, ...flags };
    assert.equal(canWriteModule(account, [role(true)], 'urban_planning', []), false);
    assert.equal(canWriteModule(account, [individual(true)], 'urban_planning', []), false);
    assert.equal(canWriteModule(account, [], 'urban_planning', [64]), false);
    assert.equal(canWriteModule(account, [role(false)], 'urban_planning', [64]), false);
    assert.equal(canWriteModule(account, [role(true)], 'urban_planning', [64]), true);
  }
});

test('bloqueio individual prevalece sobre o cargo e liberação individual exige cargo', () => {
  assert.equal(canWriteModule(user, [role(true), individual(false)], 'urban_planning', [64]), false);
  assert.equal(canWriteModule(user, [role(false), individual(true)], 'urban_planning', [64]), true);
  assert.equal(canWriteModule(user, [individual(true)], 'urban_planning', []), false);
});

test('Cidadão não gerencia mapa mesmo com cargo, permissão e privilégios de admin', () => {
  for (const flags of [{}, { is_admin: true }]) {
    assert.equal(canWriteModule({ ...user, ...flags, user_type: 'citizen' }, [role(true), individual(true)], 'urban_planning', [64]), false);
  }
  assert.equal(canWriteModule({ ...user, user_type: null }, [role(true)], 'urban_planning', [64]), false);
});

test('master acessa mapa e pavimentação sem tipo, cargo ou permissão e ignora bloqueios', () => {
  const master = { id: user.id, user_type: 'citizen', is_master: true };
  for (const module of ['urban_planning', 'pavement']) {
    assert.equal(canWriteModule(master, [], module, []), true);
    assert.equal(canWriteModule(master, [role(false), { ...individual(false), module }], module, []), true);
  }
});

test('regras de outra conta ou de outro módulo não liberam o mapa', () => {
  assert.equal(canWriteModule(user, [{ ...individual(true), user_id: 'other' }], 'urban_planning', [64]), false);
  assert.equal(canWriteModule(user, [{ ...individual(true), module: 'pavement' }], 'urban_planning', [64]), false);
  assert.equal(canWriteModule(null, [role(true)], 'urban_planning', [64]), false);
});

test('hierarquia dos demais módulos permanece master, usuário, cargo e padrão', () => {
  const blocked = { scope: 'user', user_id: user.id, module: 'works', allowed: false };
  assert.equal(canWriteModule({ ...user, is_master: true }, [blocked], 'works'), true);
  assert.equal(canWriteModule({ ...user, is_admin: true }, [blocked], 'works'), false);
  const ambassadorBlock = { scope: 'role', role_name: 'ambassador', module: 'works', allowed: false };
  assert.equal(canWriteModule({ ...user, is_ambassador: true }, [ambassadorBlock], 'works'), false);
  assert.equal(canWriteModule({ ...user, is_admin: true, is_ambassador: true }, [ambassadorBlock], 'works'), true);
});
