import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizarContadoresDeMissao } from '../lib/missionCounters.js';

test('traduz os mapas por categoria sem perder os campos brutos', () => {
  const confirmadas = { buracos: 3 };
  const registradas = { iluminacao: 2 };
  const c = normalizarContadoresDeMissao({
    confirmed_by_category: confirmadas,
    reported_by_category: registradas,
    campo_futuro: 42,
  });

  assert.deepEqual(c.confirmadasPorCategoria, confirmadas);
  assert.deepEqual(c.registradasPorCategoria, registradas);
  assert.equal(c.campo_futuro, 42);
});

test('preserva os bônus diários usados pelo placar', () => {
  const c = normalizarContadoresDeMissao({
    dailies_completed: 3,
    perfect_days: 1,
  });

  assert.equal(c.dailies_completed, 3);
  assert.equal(c.perfect_days, 1);
});

test('linha ausente produz contadores seguros', () => {
  const c = normalizarContadoresDeMissao(null);
  assert.equal(c.reports_count, 0);
  assert.equal(c.dailies_completed, 0);
  assert.deepEqual(c.patrol_days, []);
  assert.deepEqual(c.confirmadasPorCategoria, {});
});
