import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import * as pickup from '../lib/treeAdoptionPickup.js';

const request = { id: 'request', city_id: 64, status: 'pronta_retirada', request_type: 'muda', species_id: 'ipe', provider: 'requested', confirmed_provider: 'confirmed', latitude: -8.6, longitude: -38.5, address: 'Endereço de plantio, 10' };
const city = { id: 64, name: 'Floresta', state: { uf: 'PE' } };
const nursery = { city_id: 64, provider: 'confirmed', name: 'Viveiro confirmado', pickup_details: { address: 'Rua do Viveiro, 50', latitude: -8.7, longitude: -38.6 } };
const catalog = { nurseries: [nursery, { ...nursery, provider: 'requested', name: 'Viveiro solicitado', pickup_details: { latitude: -9, longitude: -39 } }], availability: [] };

test('rota usa o viveiro confirmado e não as coordenadas do plantio ou do fornecedor solicitado', () => {
  const [location] = pickup.adoptionPickupLocations(request, catalog, city);
  assert.equal(location.label, nursery.name);
  const url = new URL(location.href);
  assert.equal(url.origin, 'https://www.google.com'); assert.equal(url.pathname, '/maps/dir/');
  assert.equal(url.searchParams.get('api'), '1'); assert.equal(url.searchParams.get('destination'), '-8.7,-38.6');
  assert.equal(url.searchParams.has('origin'), false);
});

test('endereço de retirada sem pin abre rota com contexto da cidade e codificação segura', () => {
  const href = pickup.pickupDirectionsUrl({ address: 'Rua São José & Praça, 50' }, city);
  assert.equal(new URL(href).searchParams.get('destination'), 'Rua São José & Praça, 50, Floresta, PE');
  assert.equal(pickup.pickupDirectionsUrl({ latitude: null, longitude: null }), null);
  assert.equal(pickup.pickupDirectionsUrl({ latitude: '', longitude: false }), null);
  assert.equal(pickup.pickupDirectionsUrl({ latitude: 95, longitude: -38 }), null);
  assert.equal(new URL(pickup.pickupDirectionsUrl({ latitude: 0, longitude: 0 })).searchParams.get('destination'), '0,0');
});

test('local removido, fornecedor não encontrado ou dados de outra cidade não geram destino inventado', () => {
  const stale = { species_id: 'ipe', provider: 'confirmed', pickup_details: nursery.pickup_details };
  assert.equal(pickup.adoptionPickupLocations(request, { nurseries: [{ ...nursery, pickup_details: null }], availability: [stale] }, city)[0].href, null);
  assert.equal(pickup.adoptionPickupLocations(request, { nurseries: [{ ...nursery, city_id: 65 }] }, city)[0].href, null);
  assert.equal(pickup.adoptionPickupLocations(request, { nurseries: catalog.nurseries.filter(row => row.provider !== 'confirmed') }, city)[0].href, null);
});

test('vários viveiros têm rotas próprias e espécies do mesmo ponto compartilham uma opção', () => {
  const row = { ...request, items: [{ species_id: 'ipe', provider: 'confirmed' }, { species_id: 'oiti', provider: 'confirmed' }, { species_id: 'caju', provider: 'requested' }] };
  const locations = pickup.adoptionPickupLocations(row, catalog, city);
  assert.equal(locations.length, 2);
  assert.deepEqual(locations.map(location => new URL(location.href).searchParams.get('destination')), ['-8.7,-38.6', '-9,-39']);
});

test('pedido antigo recupera local da disponibilidade da espécie aprovada e mantém a cidade correta', () => {
  const rows = { availability: [{ species_id: 'approved', provider: 'confirmed', instructions: 'Endereço de retirada: Rua do Viveiro, 70\nDias e horários: Segunda a sexta' }] };
  const [location] = pickup.adoptionPickupLocations({ ...request, approved_species_id: 'approved' }, rows, city);
  assert.equal(new URL(location.href).searchParams.get('destination'), 'Rua do Viveiro, 70, Floresta, PE');
  assert.equal(new URL(pickup.adoptionPickupLocations({ ...request, approved_species_id: 'approved' }, rows, { ...city, id: 65, name: 'Recife' })[0].href).searchParams.get('destination'), 'Rua do Viveiro, 70');
});

test('retirada não é oferecida para plantio pela equipe, pedidos encerrados ou pedidos ainda em análise', () => {
  for (const status of ['solicitada', 'em_analise', 'aprovada', 'agendada', 'concluida', 'cancelada', 'recusada']) assert.deepEqual(pickup.adoptionPickupLocations({ ...request, status }, catalog, city), []);
  assert.deepEqual(pickup.adoptionPickupLocations({ ...request, request_type: 'plantio' }, catalog, city), []);
});

const require = createRequire(import.meta.url), React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
const source = readFileSync(new URL('../components/arborization/TreeAdoptionPickup.jsx', import.meta.url), 'utf8');
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
const module = { exports: {} };
new Function('require', 'module', 'exports', code)(name => name === '@/lib/treeAdoptionPickup' ? pickup : name.endsWith('.css') ? {} : require(name), module, module.exports);
test('botão acessível abre a rota em nova janela; ausência de endereço orienta sem link vazio', () => {
  const Component = module.exports.default;
  const html = renderToStaticMarkup(React.createElement(Component, { request, catalog, city }));
  assert.match(html, /Ver local de retirada/); assert.match(html, /maps\/dir/); assert.match(html, /target="_blank"/); assert.match(html, /rel="noopener noreferrer"/);
  const missing = renderToStaticMarkup(React.createElement(Component, { request, catalog: { nurseries: [] }, city }));
  assert.doesNotMatch(missing, /<a /); assert.match(missing, /confirmar com a equipe/);
  assert.equal(renderToStaticMarkup(React.createElement(Component, { request: { ...request, status: 'solicitada' }, catalog, city })), '');
});
