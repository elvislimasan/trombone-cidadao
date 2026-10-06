import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePoleKmzDetails } from '../../scripts/lib/poleKmzDetails.mjs';
import { kmzUpdate, matchKmzPole } from '../../scripts/backfill-pole-kmz-details.mjs';

const metadata = '<div><div><b>Código:</b></div>132135463<hr></div>'
  + '<div><div><b>Endereço:</b></div>3 MARIA-URBANO<hr></div>'
  + '<div><div><b>Alimentador:</b></div>AL_FLORE<hr></div>'
  + '<div><div><b>Tipo de Rede:</b></div>AEREA MULTIPLEX<hr></div>';
const row = (label, watts, quantity) => `<tr class="pr"><td>${label}</td><td>${watts} W</td>`
  + `<td>${quantity}</td><td>24.92</td><td>Não</td></tr>`;

test('extrai luminária e informações sem importar URLs de fotos', () => {
  const result = parsePoleKmzDetails(metadata
    + row('VAPOR DE SODIO 70W - LUMINARIA ABERTA', 70, '2.00')
    + '<a href="https://example.test/photo?secret=do-not-store">foto</a>');
  assert.equal(result.lamp_type, 'VAPOR DE SODIO');
  assert.equal(result.lamp_power_w, 70);
  assert.equal(result.metadata.lamp_count, 2);
  assert.equal(result.metadata.source_address, '3 MARIA-URBANO');
  assert.equal(result.metadata.network_type, 'AEREA MULTIPLEX');
  assert.doesNotMatch(JSON.stringify(result), /do-not-store/);
});

test('não inventa potência única quando o poste tem luminárias diferentes', () => {
  const result = parsePoleKmzDetails(metadata
    + row('VAPOR DE SODIO 70W - LUMINARIA ABERTA', 70, '1.00')
    + row('VAPOR METALICO 150W - LUMINARIA ABERTA', 150, '1.00'));
  assert.equal(result.lamp_type, null);
  assert.equal(result.lamp_power_w, null);
  assert.equal(result.metadata.lamp_count, 2);
  assert.equal(result.metadata.luminaires.length, 2);
});

test('enriquece o cadastro sem alterar endereço ou lâmpada já editados', () => {
  const details = parsePoleKmzDetails(metadata + row('LAMPADA DE LED 60W - PÉTALA', 60, '1.00'));
  const source = { identifier: '1 - X1', lat: -8.6, lng: -38.5,
    lamp_type: details.lamp_type, lamp_power_w: details.lamp_power_w,
    raw_properties: { kmz: details.metadata } };
  const byIdentifier = new Map([['1 - X1', [source]]]);
  const pole = { identifier: '1 - X1', latitude: -8.6, longitude: -38.5,
    address: 'Rua conferida', lamp_type: 'LED novo', lamp_power_w: 100,
    raw_properties: { original: 'preservar' } };
  assert.equal(matchKmzPole(pole, byIdentifier), source);
  assert.equal(matchKmzPole({ ...pole, latitude: -8.7 }, byIdentifier), null);
  const update = kmzUpdate(pole, source);
  assert.deepEqual(Object.keys(update), ['raw_properties']);
  assert.equal(update.raw_properties.original, 'preservar');
  assert.equal(update.raw_properties.kmz.source_address, '3 MARIA-URBANO');
  assert.equal(kmzUpdate({ ...pole, raw_properties: update.raw_properties }, source), null);
  const reorderedKmz = Object.fromEntries(Object.entries(update.raw_properties.kmz).reverse());
  assert.equal(kmzUpdate({ ...pole, raw_properties: {
    kmz: reorderedKmz, original: 'preservar',
  } }, source), null);
});
