import test from 'node:test';
import assert from 'node:assert/strict';
import { carregarRuasDoMapa } from '../lib/pavementMapData.js';

test('download lê todas as ruas da cidade, inclusive além do limite de mil registros, e mantém coordenadas', async () => {
  const rows = Array.from({ length: 1001 }, (_, id) => ({ id, name: `Rua ${id}`,
    location: { type: 'Point', coordinates: [-38.58, -8.6] },
    path: { type: 'MultiLineString', coordinates: [[[-38.58, -8.6], [-38.59, -8.61]]] } }));
  const cidades = [];
  const supabase = { from() { return { select() { return this; }, eq(column, value) {
    assert.equal(column, 'city_id'); cidades.push(value); return this;
  }, order() { return this; }, range(start, end) { return Promise.resolve({ data: rows.slice(start, end + 1) }); } }; } };
  const ruas = await carregarRuasDoMapa(supabase, 64);
  assert.equal(ruas.length, 1001);
  assert.equal(new Set(ruas.map(rua => rua.id)).size, 1001);
  assert.ok(cidades.every(cityId => cityId === 64));
  assert.deepEqual(ruas.at(-1).linhas, [[[-8.6, -38.58], [-8.61, -38.59]]]);
  assert.deepEqual(ruas.at(-1).location, { lat: -8.6, lng: -38.58 });
});

test('falha de leitura interrompe o download em vez de exportar cidade incompleta', async () => {
  const error = new Error('Leitura interrompida');
  const supabase = { from() { return { select() { return this; }, eq() { return this; }, order() { return this; },
    range(start) { return Promise.resolve(start ? { error } : { data: Array.from({ length: 500 }, (_, id) => ({ id })) }); } }; } };
  await assert.rejects(carregarRuasDoMapa(supabase, 64), error);
  await assert.rejects(carregarRuasDoMapa(supabase, null), /Selecione uma cidade/);
});

test('base de relatórios mantém campos dos filtros e não trunca lotes menores que 500', async () => {
  const rows = Array.from({ length: 237 }, (_, id) => ({ id, cep: '56400-123', ceps: [{ cep: '56400-456' }], is_unnamed: true, pavement_type: 'granite', historical_documents: [{ kind: 'lei', url: 'https://example.com/lei.pdf' }] }));
  const client = { from() { return { select(value) { assert.ok(value.includes('*')); return this; }, eq() { return this; }, order() { return this; },
    range(start, end) { return Promise.resolve({ data: rows.slice(start, Math.min(end + 1, start + 71)) }); } }; } };
  const result = await carregarRuasDoMapa(client, 64);
  assert.equal(result.length, 237);
  assert.equal(result.at(-1).id, 236);
  assert.deepEqual(result[0].ceps, rows[0].ceps);
  assert.deepEqual(result[0].historical_documents, rows[0].historical_documents);
});
