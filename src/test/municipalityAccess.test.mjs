import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMunicipalityPanelAccess, shouldRedirectMunicipalityUser } from '../lib/municipalityAccess.js';

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
