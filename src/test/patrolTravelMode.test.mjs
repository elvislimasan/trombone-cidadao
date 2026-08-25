import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_PATROL_TRAVEL_MODE,
  PATROL_TRAVEL_MODE_STORAGE_KEY,
  buildPatrolPickPath,
  buildPatrolRunPath,
  getPatrolTravelMode,
  isPatrolTravelMode,
  normalizePatrolTravelMode,
  parsePatrolTravelMode,
  patrolTravelModeFromSearch,
  readStoredPatrolTravelMode,
  resolvePatrolTravelMode,
  storePatrolTravelMode,
} from '../lib/patrolTravelMode.js';

test('aceita apenas os dois modos internos da patrulha', () => {
  assert.equal(isPatrolTravelMode('walking'), true);
  assert.equal(isPatrolTravelMode('driving'), true);
  assert.equal(isPatrolTravelMode('bike'), false);
  assert.equal(isPatrolTravelMode('<script>'), false);
});

test('normaliza aliases em portugues e usa carro como compatibilidade', () => {
  assert.equal(normalizePatrolTravelMode('caminhada'), 'walking');
  assert.equal(normalizePatrolTravelMode(' A-PE '), 'walking');
  assert.equal(normalizePatrolTravelMode('carro'), 'driving');
  assert.equal(normalizePatrolTravelMode('desconhecido'), DEFAULT_PATROL_TRAVEL_MODE);
  assert.equal(normalizePatrolTravelMode(null), DEFAULT_PATROL_TRAVEL_MODE);
});

test('o parser estrito distingue ausencia de uma escolha valida', () => {
  assert.equal(parsePatrolTravelMode('walking'), 'walking');
  assert.equal(parsePatrolTravelMode('carro'), 'driving');
  assert.equal(parsePatrolTravelMode('bike'), null);
  assert.equal(parsePatrolTravelMode(null), null);
});

test('a configuracao devolve textos coerentes com cada modo', () => {
  assert.equal(getPatrolTravelMode('walking').label, 'A pé');
  assert.equal(getPatrolTravelMode('driving').label, 'De carro');
});

test('salva e recupera a ultima escolha do aparelho', () => {
  const dados = new Map();
  const storage = {
    getItem: (chave) => dados.get(chave) ?? null,
    setItem: (chave, valor) => dados.set(chave, valor),
  };

  assert.equal(storePatrolTravelMode(storage, 'walking'), 'walking');
  assert.equal(dados.get(PATROL_TRAVEL_MODE_STORAGE_KEY), 'walking');
  assert.equal(readStoredPatrolTravelMode(storage), 'walking');
});

test('storage indisponivel nao impede abrir a patrulha', () => {
  const storage = {
    getItem: () => { throw new Error('bloqueado'); },
    setItem: () => { throw new Error('bloqueado'); },
  };

  assert.equal(readStoredPatrolTravelMode(storage), DEFAULT_PATROL_TRAVEL_MODE);
  assert.doesNotThrow(() => storePatrolTravelMode(storage, 'walking'));
});

test('o modo da URL vence a preferencia salva e sobrevive a recarga', () => {
  const storage = { getItem: () => 'driving' };
  assert.equal(resolvePatrolTravelMode('?modo=walking', storage), 'walking');
  assert.equal(resolvePatrolTravelMode('?foo=1&modo=driving', storage), 'driving');
});

test('sem modo na URL, um atalho direto usa a ultima escolha', () => {
  const storage = { getItem: () => 'walking' };
  assert.equal(resolvePatrolTravelMode('', storage), 'walking');
  assert.equal(resolvePatrolTravelMode('?foo=1', storage), 'walking');
});

test('modo adulterado na URL cai no padrao e nunca entra no marcador', () => {
  const storage = { getItem: () => 'walking' };
  assert.equal(resolvePatrolTravelMode('?modo=%3Csvg%20onload%3Dalert(1)%3E', storage), 'driving');
});

test('a tela ativa exige modo explicito na URL', () => {
  assert.equal(patrolTravelModeFromSearch('?modo=walking'), 'walking');
  assert.equal(patrolTravelModeFromSearch('?modo=carro'), 'driving');
  assert.equal(patrolTravelModeFromSearch(''), null);
  assert.equal(patrolTravelModeFromSearch('?modo=bike'), null);
});

test('a rota da patrulha leva categoria e modo escolhido', () => {
  assert.equal(
    buildPatrolRunPath('vazamento-de-agua', 'walking'),
    '/patrulhar/vazamento-de-agua?modo=walking'
  );
});

test('atalho de missao leva a categoria para o pre-voo', () => {
  assert.equal(
    buildPatrolPickPath('buracos'),
    '/patrulhar?categoria=buracos'
  );
});
