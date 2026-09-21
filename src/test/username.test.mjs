import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeUsername,
  validateUsername,
  isReservedUsername,
  getPublicProfilePath,
  formatUsername,
  RESERVED_USERNAMES,
} from '../lib/username.js';

test('normalizeUsername converte para minúsculas e remove espaços e @ inicial', () => {
  assert.equal(normalizeUsername('  @MarianaSouza  '), 'marianasouza');
  assert.equal(normalizeUsername('Lairton.dev'), 'lairton.dev');
  assert.equal(normalizeUsername(''), '');
  assert.equal(normalizeUsername(null), '');
});

test('validação aceita usernames válidos comuns', () => {
  const result1 = validateUsername('marianasouza');
  assert.equal(result1.valid, true);
  assert.equal(result1.normalized, 'marianasouza');

  const result2 = validateUsername('joao.silva');
  assert.equal(result2.valid, true);

  const result3 = validateUsername('carlos_123');
  assert.equal(result3.valid, true);

  const result4 = validateUsername('ana.carolina_recife');
  assert.equal(result4.valid, true);
});

test('validação rejeita usernames com menos de 3 ou mais de 30 caracteres', () => {
  const curto = validateUsername('ab');
  assert.equal(curto.valid, false);
  assert.match(curto.error, /mínimo 3 caracteres/i);

  const longo = validateUsername('a'.repeat(31));
  assert.equal(longo.valid, false);
  assert.match(longo.error, /máximo 30 caracteres/i);
});

test('validação rejeita pontos no início ou no fim', () => {
  const pontoInicio = validateUsername('.marianasouza');
  assert.equal(pontoInicio.valid, false);
  assert.match(pontoInicio.error, /começar nem terminar com ponto/i);

  const pontoFim = validateUsername('marianasouza.');
  assert.equal(pontoFim.valid, false);
  assert.match(pontoFim.error, /começar nem terminar com ponto/i);
});

test('validação rejeita pontos consecutivos', () => {
  const pontosDuplos = validateUsername('mariana..souza');
  assert.equal(pontosDuplos.valid, false);
  assert.match(pontosDuplos.error, /dois pontos consecutivos/i);
});

test('validação rejeita caracteres especiais e acentuação', () => {
  assert.equal(validateUsername('joão').valid, false);
  assert.equal(validateUsername('carlos-silva').valid, false);
  assert.equal(validateUsername('pedro@silva').valid, false);
  assert.equal(validateUsername('ana sousa').valid, false);
});

test('validação rejeita nomes de rotas e termos reservados', () => {
  for (const reserved of ['admin', 'suporte', 'trombone', 'prefeitura', 'vereador', 'feed', 'mapa', 'obras', 'login', 'guiadacidade']) {
    assert.equal(isReservedUsername(reserved), true, `Deveria ser reservado: ${reserved}`);
    const check = validateUsername(reserved);
    assert.equal(check.valid, false, `Validação deveria falhar para ${reserved}`);
    assert.match(check.error, /reservado/i);
  }
});

test('getPublicProfilePath devolve rota canônica curta /:username', () => {
  assert.equal(getPublicProfilePath('mariana'), '/mariana');
  assert.equal(getPublicProfilePath('@mariana'), '/mariana');
  assert.equal(getPublicProfilePath(''), '/perfil');
});

test('formatUsername prefixa arroba corretamente', () => {
  assert.equal(formatUsername('mariana'), '@mariana');
  assert.equal(formatUsername('@mariana'), '@mariana');
  assert.equal(formatUsername(''), '');
});

