import test from 'node:test';
import assert from 'node:assert/strict';
import { activeMunicipalMembershipId, municipalRequesterContact, municipalRequesterErrors, saveMunicipalRequesterContact } from '../lib/municipalReportCreation.js';

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

test('nome e telefone são opcionais e independentes', () => {
  for (const form of [{}, { requester_name: '   ', requester_phone: '  ' }, { requester_name: 'Maria' }, { requester_phone: '(87) 99999-1234' }]) assert.deepEqual(municipalRequesterErrors(form), {});
  assert.deepEqual(municipalRequesterContact({ requester_name: '  Maria da Silva  ', requester_phone: ' (87) 99999-1234 ' }), { name: 'Maria da Silva', phone: '(87) 99999-1234' });
  assert.ok(municipalRequesterErrors({ requester_name: 'a'.repeat(161) }).requester_name);
  for (const phone of ['abc1234567890', '9999', '+'.repeat(33), '1234567890123456']) assert.ok(municipalRequesterErrors({ requester_phone: phone }).requester_phone);
  assert.deepEqual(municipalRequesterErrors({ requester_phone: '+55 (87) 99999-1234' }), {});
});

test('contato em branco não exige gravação e preenchimento é salvo na tabela privada', async () => {
  const writes = [], signal = new AbortController().signal;
  const client = { from(table) { return { insert(payload) { writes.push({ table, payload }); return { abortSignal(value) { assert.equal(value, signal); return Promise.resolve({}); } }; } }; } };
  await saveMunicipalRequesterContact(client, 'report', {});
  assert.equal(writes.length, 0);
  await saveMunicipalRequesterContact(client, 'report', { requester_name: ' Maria ' }, signal);
  assert.deepEqual(writes, [{ table: 'municipal_report_contacts', payload: { report_id: 'report', name: 'Maria', phone: null } }]);
});

test('erro ao salvar contato é propagado sem confirmar o cadastro', async () => {
  const error = new Error('Falha no banco');
  const client = { from() { return { insert() { return Promise.resolve({ error }); } }; } };
  await assert.rejects(saveMunicipalRequesterContact(client, 'report', { requester_phone: '87999991234' }), failure => failure === error);
});
