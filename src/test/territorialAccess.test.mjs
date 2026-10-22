import test from 'node:test';
import assert from 'node:assert/strict';
import { canWriteModule } from '../lib/modulePermissions.js';
import { territorialModules, territorialHome, territorialEntryRedirect, TERRITORIAL_BASE } from '../lib/territorialAccess.js';
import { shouldRedirectMunicipalityUser } from '../lib/municipalityAccess.js';

const user = { id: 'employee', user_type: 'public_official', has_municipality_access: true };
const rules = [
  { scope: 'role', role_name: 'urban_planner', module: 'urban_planning', allowed: true },
  { scope: 'role', role_name: 'tree_manager', module: 'arborization', allowed: true },
];
const access = (streets = [], trees = [], extra = {}) => ({ planningCityIds: streets, treeAssignments: trees.map(city_id => ({ city_id })),
  municipalities: [], isMaster: false, canWrite: module => canWriteModule(user, rules, module, streets, trees), ...extra });

test('abas dependem do módulo e da cidade, sem herança entre ruas e árvores', () => {
  assert.deepEqual(territorialModules(access([64]), 64), ['ruas']);
  assert.deepEqual(territorialModules(access([], [64]), 64), ['arborizacao']);
  assert.deepEqual(territorialModules(access([64], [64]), '64'), ['ruas', 'arborizacao']);
  assert.deepEqual(territorialModules(access([64], [65]), 64), ['ruas']);
  assert.deepEqual(territorialModules(access([64], [65]), 65), ['arborizacao']);
  assert.deepEqual(territorialModules(access([64], [65]), null), []);
});

test('admin, master e administrador municipal mantêm entrada geral mesmo com cargo', () => {
  for (const flags of [{ is_admin: true }, { is_master: true }]) assert.equal(territorialHome({ ...user, ...flags }, access([64], [64])), null);
  assert.equal(territorialHome(user, access([64], [64], { municipalities: [{ papel: 'administrador', city_id: 64 }] })), null);
  assert.equal(territorialHome(user, access([], [64])), TERRITORIAL_BASE);
  assert.equal(territorialHome(user, access()), null);
});

test('entrada e legado levam à área correta preservando caminhos explícitos de outros trabalhos', () => {
  const grant = access([64], [64]);
  assert.equal(territorialEntryRedirect(user, grant, '/feed'), TERRITORIAL_BASE);
  assert.equal(territorialEntryRedirect(user, grant, '/admin/arborizacao'), `${TERRITORIAL_BASE}/arborizacao`);
  assert.equal(territorialEntryRedirect(user, grant, '/pavimentacao/gerenciar'), `${TERRITORIAL_BASE}/ruas`);
  for (const path of ['/prefeitura/demandas', '/prefeitura/iluminacao', '/prefeitura/eletricista', `${TERRITORIAL_BASE}/ruas`]) {
    assert.equal(territorialEntryRedirect(user, grant, path), null);
    assert.equal(shouldRedirectMunicipalityUser(user, path), false);
  }
  for (const path of ['/arborizacao/arvore/id', '/mapa-pavimentacao/rua/id', '/share/rua/id']) assert.equal(shouldRedirectMunicipalityUser(user, path), false);
  assert.equal(shouldRedirectMunicipalityUser(user, '/admin/usuarios'), true);
});

test('arborização exige tipo, cargo válido e regra explícita inclusive para admin', () => {
  for (const flags of [{}, { is_admin: true }]) {
    assert.equal(canWriteModule({ ...user, ...flags }, rules, 'arborization', [64], []), false);
    assert.equal(canWriteModule({ ...user, ...flags }, [], 'arborization', [], [64]), false);
    assert.equal(canWriteModule({ ...user, ...flags }, rules, 'arborization', [], [64]), true);
    assert.equal(canWriteModule({ ...user, ...flags, user_type: 'citizen' }, rules, 'arborization', [], [64]), false);
    assert.equal(canWriteModule({ ...user, ...flags }, [...rules, { scope: 'user', user_id: user.id, module: 'arborization', allowed: false }], 'arborization', [], [64]), false);
  }
  assert.equal(canWriteModule({ ...user, is_master: true }, [], 'arborization'), true);
});


test('concessão municipal dispensa regra global sem ignorar bloqueio individual nem tipo de conta', () => {
  const grant = { arborization: true };
  const deny = [{ scope: 'user', user_id: user.id, module: 'arborization', allowed: false }];
  assert.equal(canWriteModule(user, [], 'arborization', [], [64], grant), true);
  assert.equal(canWriteModule(user, deny, 'arborization', [], [64], grant), false);
  assert.equal(canWriteModule(user, [], 'urban_planning', [64], [], grant), false);
  assert.equal(canWriteModule({ ...user, user_type: 'citizen' }, [], 'arborization', [], [64], grant), false);
});
