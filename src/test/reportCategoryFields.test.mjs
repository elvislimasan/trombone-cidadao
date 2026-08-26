// Campos obrigatórios por categoria.
//   node --test src/test/reportCategoryFields.test.mjs
//
// A regra decide se uma bronca é aproveitável por quem conserta. Uma de
// iluminação sem plaqueta obriga a concessionária a mandar alguém procurar o
// poste — e, vinda de missão, ainda consome o chamado: ninguém mais vai lá.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  camposDaCategoria,
  validarCamposDaCategoria,
  categoriaCompleta,
  camposParaColunas,
  normalizarPlaqueta,
  TIPOS_DE_PROBLEMA_ILUMINACAO,
} from '../lib/reportCategoryFields.js';

// ── Quais campos existem ──────────────────────────────────────────────────────

test('iluminação pede tipo do problema e plaqueta', () => {
  const ids = camposDaCategoria('iluminacao').map((c) => c.id);
  assert.deepEqual(ids, ['issue_type', 'pole_number']);
});

test('buraco pergunta sobre obra de água, sem obrigar', () => {
  const campos = camposDaCategoria('buracos');
  assert.deepEqual(campos.map((c) => c.id), ['is_from_water_utility']);
  assert.equal(campos[0].obrigatorio, false);
});

test('categoria sem campo extra devolve lista vazia', () => {
  assert.deepEqual(camposDaCategoria('limpeza'), []);
  assert.deepEqual(camposDaCategoria(undefined), []);
});

// ── O que falta ───────────────────────────────────────────────────────────────

test('iluminação sem nada preenchido acusa os dois campos', () => {
  const erros = validarCamposDaCategoria('iluminacao', {});
  assert.deepEqual(Object.keys(erros).sort(), ['issue_type', 'pole_number']);
});

test('iluminação com tipo mas sem plaqueta ainda está incompleta', () => {
  // É o caso que motivou tudo: dava para enviar, e a bronca nascia sem o
  // número que permite achar o poste.
  const erros = validarCamposDaCategoria('iluminacao', { issue_type: 'lamp_off' });
  assert.deepEqual(Object.keys(erros), ['pole_number']);
  assert.equal(categoriaCompleta('iluminacao', { issue_type: 'lamp_off' }), false);
});

test('espaço em branco não conta como preenchido', () => {
  const erros = validarCamposDaCategoria('iluminacao', {
    issue_type: 'lamp_off',
    pole_number: '   ',
  });
  assert.deepEqual(Object.keys(erros), ['pole_number']);
});

test('iluminação completa passa', () => {
  assert.equal(
    categoriaCompleta('iluminacao', { issue_type: 'lamp_off', pole_number: '12345' }),
    true
  );
});

test('buraco passa sem marcar nada — o campo é informativo', () => {
  assert.equal(categoriaCompleta('buracos', {}), true);
});

test('categoria sem campo extra nunca bloqueia', () => {
  assert.equal(categoriaCompleta('limpeza', {}), true);
});

// ── Plaqueta ──────────────────────────────────────────────────────────────────

test('a plaqueta perde o prefixo da sugestão de poste', () => {
  // A lista de postes próximos chega como "12 - 34567"; gravar assim faria o
  // número não bater com o da plaqueta física.
  assert.equal(normalizarPlaqueta('12 - 34567'), '34567');
  assert.equal(normalizarPlaqueta('7 – 890'), '890');
  assert.equal(normalizarPlaqueta('  34567  '), '34567');
  assert.equal(normalizarPlaqueta(null), '');
});

test('número que já vem limpo continua igual', () => {
  assert.equal(normalizarPlaqueta('34567'), '34567');
});

// ── Virar colunas ─────────────────────────────────────────────────────────────

test('iluminação grava a mesma plaqueta nas três colunas', () => {
  // O formulário comum preenche assim; divergir faria a mesma bronca aparecer
  // identificada numa tela e sem identificação em outra.
  const colunas = camposParaColunas('iluminacao', {
    issue_type: 'pole_broken',
    pole_number: '12 - 34567',
    pole_id: 42,
    reported_pole_distance_m: 18,
  });
  assert.equal(colunas.issue_type, 'pole_broken');
  assert.equal(colunas.pole_number, '34567');
  assert.equal(colunas.reported_post_identifier, '34567');
  assert.equal(colunas.reported_plate, '34567');
  assert.equal(colunas.pole_id, 42);
  assert.equal(colunas.reported_pole_distance_m, 18);
  assert.equal(colunas.is_from_water_utility, null);
});

test('colunas de outra categoria vêm nulas, nunca ausentes', () => {
  // Omitir a chave deixaria o valor anterior intacto num update, e uma bronca
  // que trocou de categoria carregaria a plaqueta da categoria antiga.
  const colunas = camposParaColunas('limpeza', { pole_number: '999', issue_type: 'x' });
  assert.deepEqual(Object.keys(colunas).sort(), [
    'is_from_water_utility',
    'issue_type',
    'pole_id',
    'pole_number',
    'reported_plate',
    'reported_pole_distance_m',
    'reported_post_identifier',
  ]);
  assert.equal(colunas.pole_number, null);
  assert.equal(colunas.issue_type, null);
  assert.equal(colunas.is_from_water_utility, null);
});

test('buraco grava booleano, e false não vira null', () => {
  assert.equal(camposParaColunas('buracos', {}).is_from_water_utility, false);
  assert.equal(
    camposParaColunas('buracos', { is_from_water_utility: true }).is_from_water_utility,
    true
  );
});

test('todo tipo de iluminação tem valor único', () => {
  const valores = TIPOS_DE_PROBLEMA_ILUMINACAO.map((t) => t.value);
  assert.equal(new Set(valores).size, valores.length);
});
