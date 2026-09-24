import test from 'node:test';
import assert from 'node:assert/strict';

import { guideJourneys, guideJourneyTitle, guidePhones, guideWeekdayTitle, metadataWithJourneys, toggleGuideJourneyWeekday } from '../lib/guideDetails.js';

test('nomes dos percursos são preservados e cadastros antigos têm fallback', () => {
  const metadata = metadataWithJourneys({}, [
    { title: 'Percurso de segunda a sexta' },
    { title: 'Percurso aos sábados' },
  ]);
  assert.deepEqual(guideJourneys(metadata).map(guideJourneyTitle), ['Percurso de segunda a sexta', 'Percurso aos sábados']);
  assert.equal(guideJourneyTitle({ title: '   ' }, 0), 'Percurso 1');
  assert.equal(guideJourneyTitle({ title: '   ' }, 1), 'Percurso 2');
});

test('dias cadastrados geram o título público do percurso', () => {
  assert.equal(guideWeekdayTitle(['monday', 'tuesday', 'wednesday', 'thursday', 'friday']), 'Percurso de segunda a sexta');
  assert.equal(guideWeekdayTitle(['monday', 'wednesday', 'friday']), 'Percurso: segunda, quarta e sexta');
  assert.equal(guideWeekdayTitle(['saturday']), 'Percurso: sábado');
  assert.equal(guideJourneyTitle({ weekdays: ['saturday'], title: 'Título antigo' }), 'Percurso: sábado');
});

test('lista todos os telefones do guia sem repetir o telefone legado', () => {
  assert.deepEqual(guidePhones({
    phone: '(87) 99999-1111',
    guide_metadata: { phones: ['87 99999-1111', '(87) 3333-2222'] },
  }), ['(87) 99999-1111', '(87) 3333-2222']);
});

test('transportes antigos continuam aparecendo como um percurso', () => {
  assert.deepEqual(guideJourneys({
    origin: 'Floresta',
    destination: 'Serra Talhada',
    departure_time: '07:00',
    schedule: 'Segunda a sexta',
  })[0], {
    origin_city_id: '',
    origin: 'Floresta',
    destination_city_id: '',
    destination: 'Serra Talhada',
    departure_time: '07:00',
    arrival_time: '',
    schedule: 'Segunda a sexta',
    boarding_location: '',
    dropoff_location: '',
  });
});

test('vários percursos preservam embarque, desembarque e o formato legado', () => {
  const metadata = metadataWithJourneys({}, [
    { origin: 'Floresta', destination: 'Recife', schedule: 'Segunda a sexta', boarding_location: 'Praça', dropoff_location: 'TIP' },
    { origin: 'Floresta', destination: 'Recife', schedule: 'Sábado', departure_time: '06:00' },
  ]);
  assert.equal(guideJourneys(metadata).length, 2);
  assert.equal(metadata.schedule, 'Segunda a sexta');
  assert.equal(metadata.boarding_location, 'Praça');
});

test('adicionar dia ao segundo percurso preserva os dois percursos', () => {
  const metadata = metadataWithJourneys({}, [
    { origin: 'Floresta', destination: 'Serra Talhada', weekdays: ['monday'] },
    { origin: 'Floresta', destination: 'Serra Talhada' },
  ]);
  const updated = toggleGuideJourneyWeekday(metadata, 1, 'saturday');
  assert.deepEqual(guideJourneys(updated).map((journey) => journey.weekdays), [['monday'], ['saturday']]);
  assert.equal(guideJourneyTitle(guideJourneys(updated)[1], 1), 'Percurso: sábado');
});

test('metadados de percurso inválidos não derrubam a edição', () => {
  assert.deepEqual(guideJourneys(null), []);
  assert.deepEqual(guideJourneys({ journeys: [null] })[0], {
    origin_city_id: '', origin: '', destination_city_id: '', destination: '',
    departure_time: '', arrival_time: '', schedule: '', boarding_location: '',
    dropoff_location: '',
  });
});
