import test from 'node:test';
import assert from 'node:assert/strict';
import { pipaVoiceDistanceMessage, pipaVoiceMilestone } from '../lib/pipaRouteVoice.js';

test('aproximação anuncia 1 km, 500 m e 100 m uma vez por destino', () => {
  let previous = Infinity;
  const messages = [];
  for (const distance of [1500, 1001, 1000, 990, 1010, 980, 501, 500, 510, 490, 101, 100, 110, 90]) {
    const milestone = pipaVoiceMilestone(distance, previous);
    if (milestone) { messages.push(milestone); previous = milestone; }
  }
  assert.deepEqual(messages, [1000, 500, 100]);
});

test('GPS iniciado perto ou salto de posição usa somente o marco mais próximo', () => {
  assert.equal(pipaVoiceMilestone(80), 100);
  assert.equal(pipaVoiceMilestone(400, 1000), 500);
  assert.equal(pipaVoiceMilestone(70, 1000), 100);
  assert.equal(pipaVoiceMilestone(400, 100), null);
  assert.equal(pipaVoiceMilestone(0), 100);
});

test('leituras inválidas não disparam aviso de proximidade', () => {
  for (const distance of [null, undefined, NaN, Infinity, -1, '100']) {
    assert.equal(pipaVoiceMilestone(distance), null);
  }
});

test('voz identifica a caixa e deixa claro que a distância é em linha reta', () => {
  assert.equal(pipaVoiceDistanceMessage(1000, 'Caixa Central'), 'Caixa Central a 1 quilômetro, em linha reta.');
  assert.match(pipaVoiceDistanceMessage(500, 'Caixa Central'), /Caixa Central a 500 metros, em linha reta/);
  assert.match(pipaVoiceDistanceMessage(100, 'Caixa Central'), /100 metros.*aproximando do destino/);
});
