import test from 'node:test';
import assert from 'node:assert/strict';

import { statusDaConsulta, statusInicialDoMapa } from '../lib/mapReportFilters.js';

test('acesso comum ao mapa continua começando nas broncas ativas', () => {
  assert.equal(statusInicialDoMapa(''), 'active');
  assert.equal(statusInicialDoMapa('?cidade=12'), 'active');
});

test('atalho da página de uma rua começa com o status Todas', () => {
  assert.equal(statusInicialDoMapa('?rua=abc-123'), 'all');
  assert.equal(statusInicialDoMapa('?cidade=12&rua=abc-123'), 'all');
});

test('Todas consulta broncas abertas e resolvidas', () => {
  assert.deepEqual(statusDaConsulta('all'), ['active', 'resolved']);
  assert.deepEqual(statusDaConsulta('pending'), ['pending']);
});
