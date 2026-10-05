import test from 'node:test';
import assert from 'node:assert/strict';
import { createReportPole, mergeNearbyReportPoles } from '../lib/reportPole.js';

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
