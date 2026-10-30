import test from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_ADOPTION, adoptionPayload, adoptionNextStatuses, validateAdoption, availableAdoptionSpecies, availableAdoptionProviders, adoptionProviderLabel } from '../lib/treeAdoption.js';

const species = [{ id: 'ipe', city_id: 64 }, { id: 'oiti', city_id: 65 }];
const availability = [{ species_id: 'ipe', provider: 'viveiro_municipal', status: 'disponivel' }];
const validate = (form, cityId, catalog, step = null) => validateAdoption(form, cityId, catalog, step, availability);
const valid = { ...EMPTY_ADOPTION, requester_name: 'Maria da Silva', requester_phone: '(87) 99999-9999', requester_email: 'maria@example.test', request_type: 'plantio', zone: 'urbana', planting_place: 'calcada', purpose: 'sombra', overhead_wiring: 'sim', species_id: 'ipe', provider: 'viveiro_municipal', latitude: -8.6, longitude: -38.57, address: 'Rua da Praça, 10', commitment: true };

test('viveiro cadastrado oferece espécies e mantém o nome no pedido sem depender de fornecedores fixos', () => {
  const nursery = { id: 'n1', provider: 'novo-viveiro', name: 'Viveiro da comunidade' };
  const stock = [{ species_id: 'ipe', nursery_id: nursery.id, provider: nursery.provider, status: 'disponivel', nursery }];
  assert.deepEqual(availableAdoptionSpecies(species, stock), [species[0]]);
  assert.deepEqual(availableAdoptionProviders(stock, 'ipe'), stock);
  assert.equal(validateAdoption({ ...valid, provider: nursery.provider }, 64, species, null, stock), '');
  assert.equal(adoptionProviderLabel(nursery.provider, { nurseries: [nursery] }), nursery.name);
  assert.equal(adoptionProviderLabel(nursery.provider, { availability: stock }), nursery.name);
  assert.equal(adoptionProviderLabel('viveiro_municipal'), 'Viveiro municipal');
  assert.equal(adoptionProviderLabel(null), '');
  assert.equal(validateAdoption({ ...valid, provider: nursery.provider }, 64, species, 2, []), 'A espécie não tem disponibilidade confirmada neste fornecedor. Atualize o catálogo e escolha uma opção disponível.');
  assert.deepEqual(availableAdoptionSpecies(species, [{ ...stock[0], nursery: { ...nursery, provider: 'outro' } }]), []);
});
test('pedido exige local, fiação explícita, espécie da cidade e compromisso', () => {
  assert.equal(validate(valid, 64, species), '');
  for (const patch of [{ overhead_wiring: '' }, { species_id: 'oiti' }, { commitment: false }, { latitude: '' }, { longitude: Infinity }, { address: '  ' }, { zone: 'inventada' }]) {
    assert.ok(validate({ ...valid, ...patch }, 64, species), JSON.stringify(patch));
  }
  assert.equal(validate({ ...valid, overhead_wiring: 'nao_sei' }, 64, species), '');
});
test('quatro etapas validam pedido, local, espécie e revisão separadamente', () => {
  assert.equal(validate({ ...valid, species_id: '', request_type: 'muda', purpose: 'sombra' }, 64, species, 0), '');
  assert.equal(validate({ ...valid, species_id: '', provider: '', commitment: false }, 64, species, 1), '');
  assert.ok(validate({ ...valid, latitude: '' }, 64, species, 1));
  assert.ok(validate({ ...valid, species_id: 'oiti' }, 64, species, 2));
  assert.ok(validate({ ...valid, commitment: false }, 64, species));
});
test('sugestões exigem disponibilidade explícita por espécie e fornecedor', () => {
  const rows = [...availability, { species_id: 'ipe', provider: 'instituto_florestar', status: 'indisponivel' }, { species_id: 'oiti', provider: 'viveiro_municipal', status: 'sob_consulta' }];
  assert.deepEqual(availableAdoptionSpecies(species, []), []);
  assert.deepEqual(availableAdoptionSpecies(species, rows), [species[0]]);
  assert.deepEqual(availableAdoptionProviders(rows, 'ipe'), availability);
  assert.deepEqual(availableAdoptionProviders(rows, 'oiti'), []);
  assert.deepEqual(availableAdoptionSpecies(species, [{ species_id: 'ipe', provider: 'inventado', status: 'disponivel' }]), []);
  assert.ok(validateAdoption(valid, 64, species, 2));
  assert.ok(validateAdoption({ ...valid, provider: 'instituto_florestar' }, 64, species, 2, rows));
  for (const status of ['sob_consulta', 'indisponivel']) {
    const revoked = [{ ...availability[0], status }];
    assert.deepEqual(availableAdoptionSpecies(species, revoked), []);
    assert.ok(validateAdoption(valid, 64, species, null, revoked));
  }
  assert.equal(validateAdoption(valid, 64, species, null, rows), '');
});
test('retirada e plantio seguem caminhos diferentes e encerramento não reabre pedido', () => {
  assert.ok(adoptionNextStatuses({ status: 'aprovada', request_type: 'muda' }).includes('pronta_retirada'));
  assert.ok(!adoptionNextStatuses({ status: 'aprovada', request_type: 'muda' }).includes('agendada'));
  assert.ok(adoptionNextStatuses({ status: 'aprovada', request_type: 'plantio' }).includes('agendada'));
  assert.ok(adoptionNextStatuses({ status: 'solicitada', request_type: 'plantio' }).includes('concluida'));
  for (const status of ['concluida', 'recusada', 'cancelada']) assert.deepEqual(adoptionNextStatuses({ status }), []);
});
test('todos os status aplicáveis ficam disponíveis desde o envio, sem etapas intermediárias', () => {
  const common = ['solicitada', 'em_analise', 'aguardando_informacao', 'aguardando_disponibilidade', 'aprovada', 'concluida', 'recusada', 'cancelada'];
  for (const request_type of ['muda', 'plantio']) {
    const statuses = [...common, request_type === 'muda' ? 'pronta_retirada' : 'agendada'];
    for (const status of statuses.filter(status => !['concluida', 'recusada', 'cancelada'].includes(status))) {
      assert.deepEqual(new Set(adoptionNextStatuses({ status, request_type })), new Set(statuses.filter(item => item !== status)));
    }
  }
});
test('múltiplas espécies preservam quantidades e fornecedores e validam cada linha', () => {
  const catalog = [...species, { id: 'aroeira', city_id: 64 }];
  const stock = [...availability, { species_id: 'aroeira', provider: 'instituto_florestar', status: 'disponivel' }];
  const items = [{ species_id: 'ipe', provider: 'viveiro_municipal', quantity: 3 }, { species_id: 'aroeira', provider: 'instituto_florestar', quantity: 2 }];
  const form = { ...valid, items };
  assert.equal(validateAdoption(form, 64, catalog, null, stock), '');
  assert.deepEqual(adoptionPayload(form, 64, 'pedido').items, items);
  for (const quantity of [0, -1, 1.5, 'abc', 1001, '']) assert.ok(validateAdoption({ ...form, items: [{ ...items[0], quantity }] }, 64, catalog, 2, stock));
  assert.ok(validateAdoption({ ...form, items: [items[0], items[0]] }, 64, catalog, 2, stock));
  assert.ok(validateAdoption(form, 64, catalog, 2, availability));
  assert.ok(validateAdoption({ ...form, items: items.map(item => ({ ...item, quantity: 600 })) }, 64, catalog, 2, stock));
});
test('contato obrigatório e e-mail opcional são validados antes do envio', () => {
  for (const patch of [{ requester_name: '' }, { requester_phone: '' }, { requester_phone: '123' }, { requester_email: 'invalido' }]) assert.ok(validate({ ...valid, ...patch }, 64, species));
  assert.equal(validate({ ...valid, requester_email: '' }, 64, species), '');
});
test('payload mantém chave idempotente e não aceita campos administrativos injetados', () => {
  const payload = adoptionPayload({ ...valid, status: 'concluida', author_id: 'outro', tree_id: 'falsa', address: ' Rua Nova ' }, 64, 'chave');
  assert.equal(payload.id, 'chave'); assert.equal(payload.address, 'Rua Nova'); assert.equal(payload.commitment, true);
  assert.equal(payload.status, undefined); assert.equal(payload.author_id, undefined); assert.equal(payload.tree_id, undefined);
});
