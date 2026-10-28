import test from 'node:test';
import assert from 'node:assert/strict';
import { municipalCapabilities, municipalHome, municipalRouteAllowed, municipalAccessUnavailableReason, assertMunicipalWorkspaceIdentity, municipalWorkspaceChannel, municipalTreeAdoptionAccess } from '../lib/municipalAccess.js';
import { TREE_ADOPTION_MANAGEMENT_PATH } from '../lib/treeAdoption.js';
const row = (atendimento = 'nenhum', canal_id = 'a', extra = {}) => ({ atendimento, canal_id, especialidades_execucao: [], inventario_iluminacao: false, ...extra });

test('navegação do administrador não transporta secretaria para as páginas gerais', () => {
  for (const path of ['/prefeitura/broncas', '/prefeitura/mapa', '/prefeitura/visao-geral', '/prefeitura/demandas', '/prefeitura/equipe']) {
    assert.equal(municipalWorkspaceChannel(path, true, 'lighting'), '');
    assert.equal(municipalWorkspaceChannel(path, false, 'lighting'), 'lighting');
  }
  for (const path of ['/prefeitura/iluminacao', '/prefeitura/eletricista', '/prefeitura/executor/arborizacao', '/prefeitura/gestao-territorial/arborizacao?cidade=64']) {
    assert.equal(municipalWorkspaceChannel(path, true, 'agriculture'), 'agriculture');
  }
});

test('workspace rejeita sessão anônima ou de outra conta antes de interpretar os vínculos', () => {
  for (const actor_user_id of [null, 'previous-account']) assert.throws(() => assertMunicipalWorkspaceIdentity({ access_contract: 2, actor_user_id, memberships: [] }, 'worker'), /sessão consultada/);
  assert.throws(() => assertMunicipalWorkspaceIdentity({ access_contract: 2 }, 'worker'), /migração 376/);
  assert.doesNotThrow(() => assertMunicipalWorkspaceIdentity({ access_contract: 2, actor_user_id: 'worker' }, 'worker'));
});

test('executor exclusivo entra no painel do eletricista sem precisar de atendimento', () => {
  const access = municipalCapabilities([row('nenhum', 'a', { especialidades_execucao: ['eletricista'] })]);
  assert.equal(access.canReadAttendance, false);
  assert.equal(municipalHome(access), '/prefeitura/eletricista');
  assert.equal(municipalRouteAllowed('/prefeitura/eletricista', access), true);
  assert.equal(municipalRouteAllowed('/prefeitura/demandas', access), false);
});

test('indisponibilidade distingue vínculo municipal ausente de execução não habilitada', () => {
  assert.match(municipalAccessUnavailableReason({}), /vínculo municipal ativo/);
  const workspace = { municipality: { id: 'p' }, accesses: [row('nenhum', 'a', { cargos: ['executor'] })] };
  assert.match(municipalAccessUnavailableReason(workspace), /não há atividade de execução habilitada/);
  assert.match(municipalAccessUnavailableReason({ ...workspace, activeChannelId: 'b' }), /Nenhum cargo configurado/);
});
test('inventário exclusivo não concede atendimento nem execução', () => {
  const access = municipalCapabilities([row('nenhum', 'a', { inventario_iluminacao: true })]);
  assert.equal(access.canReadAttendance, false);
  assert.equal(access.canExecute, false);
  assert.equal(municipalHome(access), '/prefeitura/iluminacao');
  assert.equal(municipalRouteAllowed('/prefeitura/demandas', access), false);
  assert.equal(municipalRouteAllowed('/prefeitura/iluminacao', access), true);
});
test('atendimento e execução acumulam, mantendo o escopo da secretaria', () => {
  const rows = [row('gestor', 'a'), row('nenhum', 'b', { especialidades_execucao: ['eletricista'] })];
  assert.equal(municipalCapabilities(rows).canExecute, true);
  assert.equal(municipalCapabilities(rows).canDispatch, true);
  assert.equal(municipalCapabilities(rows, false, 'a').canExecute, false);
  assert.equal(municipalCapabilities(rows, false, 'b').canDispatch, false);
  assert.equal(municipalCapabilities(rows, false, 'b').canReadAttendance, false);
});
test('atendente não recebe despacho; administrador não recebe concessão técnica', () => {
  assert.equal(municipalCapabilities([row('atendente')]).canDispatch, false);
  const admin = { ...municipalCapabilities([], true), isAdministrator: true };
  assert.equal(admin.canEditLighting, false);
  assert.equal(admin.canExecute, false);
  assert.equal(municipalHome(admin), '/prefeitura/visao-geral');
  assert.equal(municipalRouteAllowed('/prefeitura/equipe', admin), true);
});

test('atendimento de árvores é exclusivo da equipe responsável, com cidade e secretaria preservadas', () => {
  const scope = {
    cityId: 64,
    accesses: [{ city_id: 64, canal_id: 'trees', atendimento: 'atendente' }, { city_id: 64, canal_id: 'lighting', atendimento: 'gestor' }],
    categoryChannels: [{ city_id: 64, canal_id: 'trees', category_id: 'poda' }],
  };
  assert.equal(municipalTreeAdoptionAccess(scope), true);
  assert.equal(municipalTreeAdoptionAccess({ ...scope, activeChannelId: 'trees' }), true);
  assert.equal(municipalTreeAdoptionAccess({ ...scope, activeChannelId: 'lighting' }), false);
  assert.equal(municipalTreeAdoptionAccess({ ...scope, cityId: 65 }), false);
  assert.equal(municipalTreeAdoptionAccess({ ...scope, accesses: [{ city_id: 64, canal_id: 'trees', atendimento: 'leitura' }] }), false);
  assert.equal(municipalTreeAdoptionAccess({ cityId: 64, isAdministrator: true }), true);
  assert.equal(municipalTreeAdoptionAccess({ isAdministrator: true }), false);
  assert.equal(municipalTreeAdoptionAccess({ cityId: 64, inventories: [{ city_id: 64, canal_id: 'trees', module: 'arborization' }] }), true);
  assert.equal(municipalTreeAdoptionAccess({ cityId: 64, inventories: [{ city_id: 65, canal_id: 'trees', module: 'arborization' }] }), false);
  assert.equal(municipalRouteAllowed(TREE_ADOPTION_MANAGEMENT_PATH, { canReadAttendance: true }), false);
  assert.equal(municipalRouteAllowed(TREE_ADOPTION_MANAGEMENT_PATH, { canAttendTreeAdoption: true }), true);
  assert.equal(municipalWorkspaceChannel(TREE_ADOPTION_MANAGEMENT_PATH, true, 'lighting'), '');
  assert.equal(municipalWorkspaceChannel(TREE_ADOPTION_MANAGEMENT_PATH, false, 'trees'), 'trees');
});
