import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMunicipalityPanelAccess, resolveLoginDestination, shouldRedirectMunicipalityUser } from '../lib/municipalityAccess.js';
import { municipalCapabilities, municipalHome, municipalRouteAllowed } from '../lib/municipalAccess.js';

test('login do inventário entra pela resolução de responsabilidades e termina apenas na arborização', () => {
  const user = { has_municipality_access: true, user_type: 'public_official' };
  const access = municipalCapabilities([{ cargos: ['inventario'], atendimento: 'nenhum', especialidades_execucao: [], inventario_iluminacao: false }]);
  const entry = resolveLoginDestination(user, '/prefeitura/broncas');
  assert.equal(entry, '/prefeitura/visao-geral');
  assert.equal(municipalRouteAllowed(entry, access), false);
  assert.equal(municipalHome(access, '/prefeitura/gestao-territorial/arborizacao?cidade=64'), '/prefeitura/gestao-territorial/arborizacao?cidade=64');
  assert.equal(municipalRouteAllowed('/prefeitura/broncas', access), false);
  assert.equal(municipalRouteAllowed('/prefeitura/demandas', access), false);
});

test('login mantém convites, execução elétrica e retornos de contas sem vínculo municipal', () => {
  const worker = { has_municipality_access: true };
  for (const target of ['/prefeitura/convite/token', '/prefeitura/eletricista/ordem/123']) assert.equal(resolveLoginDestination(worker, target), target);
  assert.equal(resolveLoginDestination({ id: 'citizen' }, '/bronca/123'), '/bronca/123');
  assert.equal(resolveLoginDestination({ is_admin: true }, '/admin'), '/admin');
  assert.equal(resolveLoginDestination(null, null), '/feed');
});

test('reconhece a conta municipal pelo tipo ou pelo vinculo ativo', () => {
  assert.equal(hasMunicipalityPanelAccess({ tipo_conta: 'prefeitura' }), true);
  assert.equal(hasMunicipalityPanelAccess({ tipo_conta: 'cidadao', has_municipality_access: true }), true);
  assert.equal(hasMunicipalityPanelAccess({ tipo_conta: 'cidadao', has_municipality_access: false }), false);
  assert.equal(hasMunicipalityPanelAccess(null), false);
});

test('administradores da plataforma nao entram no painel operacional', () => {
  assert.equal(hasMunicipalityPanelAccess({ tipo_conta: 'prefeitura', is_admin: true }), false);
  assert.equal(hasMunicipalityPanelAccess({ has_municipality_access: true, is_master: true }), false);
});

test('a equipe municipal pode abrir a bronca publica com a mesma sessao do painel', () => {
  const reportPath = '/bronca/4d38d755-dba0-4cd7-8920-a7dde00392fc';
  for (const user of [
    { tipo_conta: 'prefeitura' },
    { tipo_conta: 'cidadao', has_municipality_access: true },
  ]) {
    assert.equal(shouldRedirectMunicipalityUser(user, reportPath), false);
    assert.equal(shouldRedirectMunicipalityUser(user, `${reportPath}/`), false);
    assert.equal(shouldRedirectMunicipalityUser(user, '/prefeitura/broncas'), false);
    assert.equal(shouldRedirectMunicipalityUser(user, '/prefeitura/demandas/nova'), false);
    assert.equal(shouldRedirectMunicipalityUser(user, '/alterar-senha'), false);
    assert.equal(shouldRedirectMunicipalityUser(user, '/termos-de-uso'), false);

    for (const path of ['/', '/feed', '/perfil', '/admin', '/bronca', '/bronca/', `${reportPath}/editar`]) {
      assert.equal(shouldRedirectMunicipalityUser(user, path), true, path);
    }
  }
});

test('o redirecionamento municipal nao restringe visitantes, cidadaos ou administradores', () => {
  for (const user of [null, { tipo_conta: 'cidadao' }, { tipo_conta: 'prefeitura', is_admin: true }, { has_municipality_access: true, is_master: true }]) {
    assert.equal(shouldRedirectMunicipalityUser(user, '/bronca/relato-publicado'), false);
    assert.equal(shouldRedirectMunicipalityUser(user, '/feed'), false);
  }
});
