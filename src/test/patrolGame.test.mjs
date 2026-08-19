// Regras de jogo do modo patrulha.
//   node --test src/test/patrolGame.test.mjs
//
// Sequência e conquistas são derivadas, não gravadas — então dá para verificar
// todas as bordas (dia pulado, virada de mês, empate no alvo) sem banco.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calcularSequencia,
  avaliarConquistas,
  conquistasNovas,
  CONQUISTAS,
  PONTOS_POR_CONFIRMACAO,
} from '../lib/patrolGame.js';

const dia = (ano, mes, d, hora = 12) => new Date(ano, mes - 1, d, hora);

// ── Sequência ─────────────────────────────────────────────────────────────────

test('sem patrulhas, sequência é zero', () => {
  assert.equal(calcularSequencia([], dia(2026, 8, 18)), 0);
  assert.equal(calcularSequencia(null, dia(2026, 8, 18)), 0);
});

test('patrulhou hoje: sequência de 1', () => {
  assert.equal(calcularSequencia([dia(2026, 8, 18, 9)], dia(2026, 8, 18, 20)), 1);
});

test('três dias seguidos terminando hoje', () => {
  const datas = [dia(2026, 8, 16), dia(2026, 8, 17), dia(2026, 8, 18)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18, 21)), 3);
});

test('ordem das datas não importa', () => {
  const datas = [dia(2026, 8, 18), dia(2026, 8, 16), dia(2026, 8, 17)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18)), 3);
});

test('duas patrulhas no mesmo dia contam como um', () => {
  const datas = [dia(2026, 8, 18, 8), dia(2026, 8, 18, 19), dia(2026, 8, 17)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18, 22)), 2);
});

test('ainda não patrulhou hoje, mas patrulhou ontem: sequência viva', () => {
  // Cortar à meia-noite puniria quem saiu às 23h de ontem e ainda não saiu hoje.
  const datas = [dia(2026, 8, 16), dia(2026, 8, 17)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18, 10)), 2);
});

test('um dia inteiro em branco quebra a sequência', () => {
  const datas = [dia(2026, 8, 14), dia(2026, 8, 15)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18)), 0);
});

test('dia pulado no meio conta só o trecho recente', () => {
  const datas = [dia(2026, 8, 10), dia(2026, 8, 11), dia(2026, 8, 17), dia(2026, 8, 18)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18)), 2);
});

test('a sequência atravessa a virada de mês', () => {
  const datas = [dia(2026, 7, 30), dia(2026, 7, 31), dia(2026, 8, 1)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 1, 20)), 3);
});

test('a sequência atravessa a virada de ano', () => {
  const datas = [dia(2025, 12, 31), dia(2026, 1, 1)];
  assert.equal(calcularSequencia(datas, dia(2026, 1, 1, 18)), 2);
});

test('datas inválidas são ignoradas sem quebrar', () => {
  const datas = ['não é data', dia(2026, 8, 18)];
  assert.equal(calcularSequencia(datas, dia(2026, 8, 18)), 1);
});

// ── Conquistas ────────────────────────────────────────────────────────────────

const stats = (extra = {}) => ({
  patrols_count: 0,
  total_passed: 0,
  total_confirmed: 0,
  total_distance_meters: 0,
  sequencia: 0,
  ...extra,
});

const porId = (lista, id) => lista.find((c) => c.id === id);

test('quem nunca patrulhou não tem conquista desbloqueada', () => {
  const r = avaliarConquistas(stats());
  assert.equal(r.filter((c) => c.desbloqueada).length, 0);
  assert.equal(r.length, CONQUISTAS.length);
});

test('stats ausente não quebra a avaliação', () => {
  assert.equal(avaliarConquistas(null).filter((c) => c.desbloqueada).length, 0);
  assert.equal(avaliarConquistas(undefined).length, CONQUISTAS.length);
});

test('a primeira patrulha desbloqueia a primeira medalha', () => {
  const r = avaliarConquistas(stats({ patrols_count: 1 }));
  assert.equal(porId(r, 'primeira_patrulha').desbloqueada, true);
});

test('atingir exatamente o alvo desbloqueia', () => {
  const r = avaliarConquistas(stats({ total_confirmed: 10 }));
  assert.equal(porId(r, 'confirmacoes_10').desbloqueada, true);
  assert.equal(porId(r, 'confirmacoes_50').desbloqueada, false);
});

test('um a menos que o alvo não desbloqueia', () => {
  const r = avaliarConquistas(stats({ total_confirmed: 9 }));
  assert.equal(porId(r, 'confirmacoes_10').desbloqueada, false);
});

test('progresso é fração de 0 a 1 e não passa de 1', () => {
  const meio = porId(avaliarConquistas(stats({ total_confirmed: 5 })), 'confirmacoes_10');
  assert.equal(meio.progresso, 0.5);
  const estourado = porId(avaliarConquistas(stats({ total_confirmed: 999 })), 'confirmacoes_10');
  assert.equal(estourado.progresso, 1);
});

test('distância aparece em km no rótulo', () => {
  const r = porId(avaliarConquistas(stats({ total_distance_meters: 2500 })), 'distancia_5km');
  assert.equal(r.rotulo, '2,5 km / 5,0 km');
  assert.equal(r.desbloqueada, false);
});

test('a sequência alimenta as conquistas de dias seguidos', () => {
  const r = avaliarConquistas(stats({ sequencia: 3 }));
  assert.equal(porId(r, 'sequencia_3').desbloqueada, true);
  assert.equal(porId(r, 'sequencia_7').desbloqueada, false);
});

test('valores negativos ou inválidos não viram progresso', () => {
  const r = porId(avaliarConquistas(stats({ total_confirmed: -5 })), 'confirmacoes_10');
  assert.equal(r.atual, 0);
  assert.equal(r.progresso, 0);
});

// ── Novidades ─────────────────────────────────────────────────────────────────

test('só comemora o que acabou de desbloquear', () => {
  const antes = stats({ total_confirmed: 9, patrols_count: 4 });
  const depois = stats({ total_confirmed: 12, patrols_count: 5 });
  const novas = conquistasNovas(antes, depois);
  assert.deepEqual(novas.map((c) => c.id), ['confirmacoes_10']);
});

test('medalha antiga não reaparece como novidade', () => {
  // A primeira patrulha já estava desbloqueada; a quinta não pode comemorá-la
  // de novo.
  const antes = stats({ patrols_count: 4 });
  const depois = stats({ patrols_count: 5 });
  assert.deepEqual(conquistasNovas(antes, depois), []);
});

test('uma patrulha pode desbloquear várias de uma vez', () => {
  const antes = stats();
  const depois = stats({ patrols_count: 1, total_confirmed: 10, sequencia: 3 });
  const ids = conquistasNovas(antes, depois).map((c) => c.id).sort();
  assert.deepEqual(ids, ['confirmacoes_10', 'primeira_patrulha', 'sequencia_3']);
});

// ── Pontos ────────────────────────────────────────────────────────────────────

test('a confirmação vale o mesmo que report_updates na migração 169', () => {
  // Divergir faria o "+X" da tela não bater com o nível mostrado depois.
  assert.equal(PONTOS_POR_CONFIRMACAO, 5);
});

test('todo id de conquista é único', () => {
  const ids = CONQUISTAS.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
});
