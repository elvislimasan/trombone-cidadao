import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { poleNeighborhood, uniqueLinkedPoleNeighborhood } from '../lib/poleNeighborhood.js';
import { parseOptions, resolvePoleNeighborhood, savePoleNeighborhood } from '../../scripts/backfill-pole-neighborhoods.mjs';

const neighborhoods = [{ name: 'Centro' }, { name: 'Três Marias' }, { name: 'São Francisco de Assis (DNER)' }, { name: 'Santa Rosa' }];
const pole = { id: 12, city_id: 64, latitude: -8.6, longitude: -38.5, updated_at: '2026-10-01T00:00:00Z', address: 'Rua A - Três Marias - Floresta', raw_properties: { kmz: { source_address: 'Rua B-CENTRO', lamp_count: 2 } } };

test('bairro do endereço corrigido prevalece sobre endereço de setor do KMZ', () => {
  assert.equal(poleNeighborhood(pole, neighborhoods), 'Três Marias');
  assert.equal(poleNeighborhood({ ...pole, address: 'Rua A' }, neighborhoods), null);
  assert.equal(poleNeighborhood({ ...pole, raw_properties: { Bairro: 'Centro', municipal: { neighborhood: 'Santa Rosa' } } }, neighborhoods), 'Santa Rosa');
});

test('vínculo usa id do poste e mesma cidade; conflito exige revisão', () => {
  const reports = [{ pole_id: 12, city_id: 64, neighborhood: 'tres marias', status: 'pending', moderation_status: 'approved' }];
  assert.equal(uniqueLinkedPoleNeighborhood(pole, reports, neighborhoods), 'Três Marias');
  assert.equal(uniqueLinkedPoleNeighborhood(pole, [...reports, { pole_id: 12, city_id: 99, neighborhood: 'Centro' }], neighborhoods), 'Três Marias');
  assert.equal(uniqueLinkedPoleNeighborhood(pole, [...reports, { pole_id: 12, city_id: 64, neighborhood: 'Centro' }], neighborhoods), null);
});

test('backfill simula por padrão e preserva bairro já corrigido', async () => {
  assert.deepEqual(parseOptions(['--city-id', '64']), { cityId: 64, limit: null, geocode: false, apply: false });
  assert.throws(() => parseOptions(['--apply']), /--city-id/);
  assert.deepEqual(await resolvePoleNeighborhood(null, pole, neighborhoods), { neighborhood: 'Três Marias', source: 'address' });
  assert.deepEqual(await resolvePoleNeighborhood(null, { ...pole, raw_properties: { Bairro: 'Centro' } }, neighborhoods), { neighborhood: null, reason: 'already_defined' });
});

test('geo só associa bairro cadastrado após confirmar a cidade do poste', async () => {
  const missing = { ...pole, address: 'Rua A' };
  const lookup = async () => ({ city: 'Floresta', state_uf: 'PE', suburb: 'DNER' });
  const db = { rpc: async () => ({ data: 64 }) };
  assert.deepEqual(await resolvePoleNeighborhood(db, missing, neighborhoods, [], { geocode: true, lookup }), { neighborhood: 'São Francisco de Assis (DNER)', source: 'coordinates' });
  assert.deepEqual(await resolvePoleNeighborhood({ rpc: async () => ({ data: 99 }) }, missing, neighborhoods, [], { geocode: true, lookup }), { neighborhood: null, reason: 'city_mismatch' });
  assert.deepEqual(await resolvePoleNeighborhood(db, missing, neighborhoods, [], { geocode: true, lookup: async () => ({ city: 'Floresta', state_uf: 'PE', suburb: 'Né Maniçoba - AABB' }) }), { neighborhood: null, reason: 'neighborhood_unavailable', candidate: 'Né Maniçoba - AABB' });
});

test('grava somente metadados do bairro e protege alterações concorrentes no poste', async () => {
  const calls = [];
  const db = createClient('https://example.supabase.co', 'test-key', { auth: { persistSession: false }, global: { fetch: async (input, init) => {
    calls.push({ url: new URL(input), body: JSON.parse(init.body) });
    return Response.json({ ...pole });
  } } });
  const result = await savePoleNeighborhood(db, pole, { neighborhood: 'Três Marias', source: 'address' });
  assert.equal(result.saved.id, pole.id);
  assert.deepEqual(calls[0].body.raw_properties, { ...pole.raw_properties, neighborhood: 'Três Marias', neighborhood_source: 'address' });
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['raw_properties', 'updated_at']);
  assert.equal(calls[0].url.searchParams.get('latitude'), 'eq.-8.6');
  assert.equal(calls[0].url.searchParams.get('updated_at'), `eq.${pole.updated_at}`);
  assert.equal(calls[0].url.searchParams.get('raw_properties'), `eq.${JSON.stringify(pole.raw_properties)}`);
});
