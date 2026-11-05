import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportPole, removeReportPole, mergeNearbyReportPoles, resolveReportSubmissionLocation } from '../lib/reportPole.js';

const location = { lat: -8.5991, lng: -38.5892 };
const pole = { pole_id: 2266, identifier: 'Z242199', latitude: location.lat, longitude: location.lng, validation_status: 'approved' };

test('cadastro envia a cidade e normaliza coordenadas do poste para o mapa', async () => {
  const calls = [];
  const client = { rpc: async (...args) => { calls.push(args); return { data: [{ ...pole, latitude: String(pole.latitude), longitude: String(pole.longitude) }] }; } };
  const result = await createReportPole({ client, cityId: '64', location, identifier: pole.identifier, address: 'Rua A' });
  assert.equal(calls[0][0], 'create_pending_pole');
  assert.equal(calls[0][1].p_city_id, 64);
  assert.equal(result.latitude, location.lat);
  assert.equal(result.longitude, location.lng);
  assert.equal(result.distance_m, 0);
});

test('cidade nao resolvida impede criar poste invisivel no inventario municipal', async () => {
  let calls = 0;
  const client = { rpc: async () => { calls++; } };
  await assert.rejects(createReportPole({ client, cityId: null, location, identifier: pole.identifier }), /cidade/);
  assert.equal(calls, 0);
});

function removalClient(result) {
  const calls = [];
  const query = {
    update(value) { calls.push(['update', value]); return this; },
    eq(field, value) { calls.push(['eq', field, value]); return this; },
    select() { return this; },
    async maybeSingle() { return result; },
  };
  return { calls, from(table) { calls.push(['from', table]); return query; } };
}

test('remoção preserva cadastro e vínculos e exige confirmação do servidor', async () => {
  const client = removalClient({ data: { id: 2266, lighting_status: 'removido' } });
  const result = await removeReportPole({ client, poleId: 2266, userId: 'member' });
  assert.deepEqual(client.calls, [['from', 'poles'], ['update', { lighting_status: 'removido' }], ['eq', 'id', 2266], ['eq', 'created_by', 'member']]);
  assert.equal(result.id, 2266);
});

test('remoção sem permissão ou sem confirmação nunca produz sucesso', async () => {
  for (const result of [{ data: null }, { data: { id: 2266, lighting_status: 'aceso' } }, { data: { id: 42, lighting_status: 'removido' } }]) {
    await assert.rejects(removeReportPole({ client: removalClient(result), poleId: 2266, userId: 'member' }), /não foi confirmada/);
  }
  await assert.rejects(removeReportPole({ client: removalClient({ error: new Error('Sem permissão') }), poleId: 2266, userId: 'member' }), /Sem permissão/);
});

test('remoção sem poste válido não envia alteração ao servidor', async () => {
  const client = { from: () => assert.fail('Sem alteração para ID inválido') };
  for (const poleId of [null, undefined, 0, -1, 1.5, '', 'inválido']) {
    await assert.rejects(removeReportPole({ client, poleId }), /Selecione o poste/);
  }
  await assert.rejects(removeReportPole({ client, poleId: 2266 }), /Entre na sua conta/);
});

test('banco antigo retornando pending nao produz confirmacao falsa de cadastro visivel', async () => {
  const client = { rpc: async () => ({ data: { ...pole, validation_status: 'pending' } }) };
  await assert.rejects(createReportPole({ client, cityId: 64, location, identifier: pole.identifier }), /atualizado no banco/);
});

test('poste novo aparece antes da consulta e persiste em resposta remota atrasada ou vazia', () => {
  const remote = { ...pole, pole_id: 100, latitude: location.lat + 0.0003 };
  assert.deepEqual(mergeNearbyReportPoles([], [pole], location).map((p) => p.pole_id), [2266]);
  assert.deepEqual(mergeNearbyReportPoles([remote, { ...pole, pole_id: '2266' }], [pole], location).map((p) => p.pole_id), [2266, 100]);
});

test('mover o pino exclui postes locais distantes e recalcula distancia dos proximos', () => {
  assert.deepEqual(mergeNearbyReportPoles([], [pole], { lat: location.lat + 0.01, lng: location.lng }), []);
  const [nearby] = mergeNearbyReportPoles([], [pole], { lat: location.lat + 0.0003, lng: location.lng });
  assert.ok(nearby.distance_m >= 30 && nearby.distance_m <= 35);
});

function submissionClient(storedPole, { poleError = null, neighborhoodError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return { select() { return this; }, eq(field, value) {
        calls.push({ table, field, value });
        return table === 'poles' ? this : Promise.resolve({ data: [{ name: 'Centro' }], error: neighborhoodError });
      }, async maybeSingle() { return { data: storedPole, error: poleError }; } };
    },
  };
}

const selectedPoleForm = { category: 'iluminacao', pole_id: 1216, city_id: 99, location: { lat: 0, lng: 0 }, address: 'Rua informada' };
const noGeocode = () => assert.fail('Cidade cadastrada não depende do geocodificador');

test('S231465 sem endereço usa cidade e coordenadas cadastradas mesmo se geocodificação estiver indisponível', async () => {
  const stored = { identifier: '3 - S231465', city_id: '64', latitude: '-8.601985', longitude: '-38.572948', address: null };
  const client = submissionClient(stored);
  const result = await resolveReportSubmissionLocation({ client, formData: selectedPoleForm,
    resolveCityIdFromLocation: noGeocode, getResolvedNeighborhood: () => assert.fail('Não deve reaproveitar bairro de outro pin') });
  assert.deepEqual(result, { location: { lat: -8.601985, lng: -38.572948 }, city_id: 64, neighborhood: null });
  assert.deepEqual(client.calls[0], { table: 'poles', field: 'id', value: 1216 });
});

test('bairro vem do cadastro atual do poste; falha da consulta de bairros não bloqueia a cidade', async () => {
  for (const neighborhoodError of [null, new Error('Indisponível')]) {
    const client = submissionClient({ ...pole, city_id: 64, raw_properties: { municipal: { bairro: 'Centro' } } }, { neighborhoodError });
    const result = await resolveReportSubmissionLocation({ client, formData: selectedPoleForm, resolveCityIdFromLocation: noGeocode });
    assert.equal(result.city_id, 64);
    assert.equal(result.neighborhood, neighborhoodError ? null : 'Centro');
  }
});

test('poste legado sem cidade resolve pelas coordenadas do cadastro, sem confiar no formulário', async () => {
  for (const city_id of [null, '', 0, 'inválido', -1, 1.5]) {
    const client = submissionClient({ ...pole, city_id });
    const result = await resolveReportSubmissionLocation({ client, formData: selectedPoleForm,
      resolveCityIdFromLocation: async point => { assert.deepEqual(point, location); return 64; }, getResolvedNeighborhood: () => 'Centro' });
    assert.deepEqual(result, { location, city_id: 64, neighborhood: 'Centro' });
  }
});

test('marcador sem poste e outras categorias continuam resolvendo a cidade pelo pin', async () => {
  for (const formData of [{ ...selectedPoleForm, pole_id: null }, { ...selectedPoleForm, category: 'buracos' }]) {
    const result = await resolveReportSubmissionLocation({ client: { from: () => assert.fail('Sem consulta a poste') }, formData,
      resolveCityIdFromLocation: async point => { assert.deepEqual(point, formData.location); return 23; }, getResolvedNeighborhood: () => null });
    assert.deepEqual(result, { location: formData.location, city_id: 23, neighborhood: null });
  }
});

test('poste removido, inacessível ou com coordenadas inválidas não usa localização antiga do formulário', async () => {
  for (const stored of [null, { ...pole, latitude: null }, { ...pole, longitude: 181 }]) {
    await assert.rejects(resolveReportSubmissionLocation({ client: submissionClient(stored), formData: selectedPoleForm,
      resolveCityIdFromLocation: noGeocode }), /confirmar a localização/);
  }
  await assert.rejects(resolveReportSubmissionLocation({ client: submissionClient(pole, { poleError: new Error('Sem acesso') }),
    formData: selectedPoleForm, resolveCityIdFromLocation: noGeocode }), /Sem acesso/);
});

test('geocodificação sem cidade mantém resultado nulo para o bloqueio de envio existente', async () => {
  const result = await resolveReportSubmissionLocation({ client: submissionClient({ ...pole, city_id: null }), formData: selectedPoleForm,
    resolveCityIdFromLocation: async () => null, getResolvedNeighborhood: () => assert.fail('Sem bairro de outra resolução') });
  assert.equal(result.city_id, null);
  assert.equal(result.neighborhood, null);
});
