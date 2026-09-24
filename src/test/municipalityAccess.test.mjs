import test from 'node:test';
import assert from 'node:assert/strict';
import { hasMunicipalityPanelAccess } from '../lib/municipalityAccess.js';

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
