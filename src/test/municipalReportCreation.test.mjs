import test from 'node:test';
import assert from 'node:assert/strict';
import { activeMunicipalMembershipId } from '../lib/municipalReportCreation.js';

test('cadastro municipal usa a prefeitura ativa no painel quando há mais de uma na cidade', () => {
  const memberships = [
    { prefeitura: { id: 'outra', city_id: 1, status: 'ativa' } },
    { prefeitura: { id: 'selecionada', city_id: 1, status: 'ativa' } },
  ];
  assert.equal(activeMunicipalMembershipId(memberships, 1, 'selecionada'), 'selecionada');
  assert.equal(activeMunicipalMembershipId(memberships, 1, 'ausente'), null);
});

test('cadastro não associa solicitação a prefeitura inativa ou de outra cidade', () => {
  const memberships = [
    { prefeitura: { id: 'inativa', city_id: 1, status: 'inativa' } },
    { prefeitura: { id: 'outra-cidade', city_id: 2, status: 'ativa' } },
  ];
  assert.equal(activeMunicipalMembershipId(memberships, 1, 'inativa'), null);
  assert.equal(activeMunicipalMembershipId(memberships, 1, 'outra-cidade'), null);
});
