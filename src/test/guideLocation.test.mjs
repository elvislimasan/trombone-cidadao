import test from 'node:test';
import assert from 'node:assert/strict';
import { guideLocation } from '../lib/guideLocation.js';

test('local marcado no Guia aparece com coordenadas GeoJSON ou POINT', () => {
  const expected = { lat: -8.602, lng: -38.568 };
  assert.deepEqual(guideLocation({ coordinates: [-38.568, -8.602] }), expected);
  assert.deepEqual(guideLocation('POINT(-38.568 -8.602)'), expected);
  assert.deepEqual(guideLocation({ lat: -8.602, lng: -38.568 }), expected);
  assert.equal(guideLocation(null), null);
  assert.equal(guideLocation('POINT(invalid)'), null);
});

test('extrai coordenadas de links do Google Maps usados como endereço', () => {
  const expected = { lat: -8.7871427, lng: -38.5478198 };
  const placeUrl = 'https://www.google.com/maps/place/Ecoilhas+Alto+Bonito/@-8.7871427,-38.5478198,17z/data=!4m6!3m5!1s0x0!8m2!3d-8.7871427!4d-38.5478198';
  const dataUrl = 'https://www.google.com/maps/place/Ermida/data=!3d-8.7871427!4d-38.5478198';

  assert.deepEqual(guideLocation(placeUrl), expected);
  assert.deepEqual(guideLocation(dataUrl), expected);
});

test('prioriza o ponto do local, e nao o centro da viewport do Google Maps', () => {
  const url = 'https://www.google.com/maps/place/Local/@-8.6000,-38.5000,12z/data=!3d-8.7871427!4d-38.5478198';
  assert.deepEqual(guideLocation(url), { lat: -8.7871427, lng: -38.5478198 });
});

test('le Point em EWKB hexadecimal retornado pelo PostGIS', () => {
  const ewkb = '0101000020E6100000F68C8EF51E4643C0FE91335E049321C0';
  assert.deepEqual(guideLocation(ewkb), { lat: -8.7871427, lng: -38.5478198 });
  assert.deepEqual(guideLocation(`\\x${ewkb}`), { lat: -8.7871427, lng: -38.5478198 });
});
