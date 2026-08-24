// Telefone do transporte -> link do WhatsApp, e tipos de veículo.
//   node --test src/test/transportContact.test.mjs
//
// O botão do WhatsApp abre uma conversa com um número. Errar a normalização
// não dá erro em lugar nenhum: dá uma conversa com um estranho, iniciada por
// alguém que só queria pedir carona. Por isso a regra é conservadora — na
// dúvida devolve null e o botão nem aparece.

import test from 'node:test';
import assert from 'node:assert/strict';

import { whatsappNumber } from '../lib/utils.js';
import {
  TIPOS_TRANSPORTE,
  tipoTransportePorId,
  nomeDoTipoTransporte,
  iconeDoTipoTransporte,
} from '../lib/transportTypes.js';

// ── Normalização do telefone ──────────────────────────────────────────────────

test('celular com DDD ganha o DDI 55', () => {
  assert.equal(whatsappNumber('87999488360'), '5587999488360');
});

test('a formatação que o cadastro guarda é ignorada', () => {
  assert.equal(whatsappNumber('(87) 99948-8360'), '5587999488360');
  assert.equal(whatsappNumber('87 99948 8360'), '5587999488360');
});

test('fixo de 10 dígitos também vale — muita lotação atende em fixo', () => {
  assert.equal(whatsappNumber('8738771234'), '558738771234');
});

test('número que já veio com DDI não ganha outro', () => {
  assert.equal(whatsappNumber('+55 87 99948-8360'), '5587999488360');
  assert.equal(whatsappNumber('5587999488360'), '5587999488360');
});

test('telefone curto demais não vira link', () => {
  // Sem DDD não dá para saber a cidade, e chutar o DDD do app abriria conversa
  // com o número de outra pessoa.
  assert.equal(whatsappNumber('999488360'), null);
  assert.equal(whatsappNumber('190'), null);
});

test('vazio, nulo e texto não viram link', () => {
  assert.equal(whatsappNumber(''), null);
  assert.equal(whatsappNumber(null), null);
  assert.equal(whatsappNumber(undefined), null);
  assert.equal(whatsappNumber('não temos telefone'), null);
});

test('número internacional que não sabemos completar fica de fora', () => {
  assert.equal(whatsappNumber('+351 912 345 678'), null);
});

// ── Tipos de veículo ──────────────────────────────────────────────────────────

test('todo tipo tem id, nome e ícone únicos', () => {
  const ids = TIPOS_TRANSPORTE.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const tipo of TIPOS_TRANSPORTE) {
    assert.ok(tipo.id && tipo.name && tipo.icon, `tipo incompleto: ${JSON.stringify(tipo)}`);
  }
});

test('tipo desconhecido não quebra a tela', () => {
  assert.equal(tipoTransportePorId('helicoptero'), null);
  // Sem nome o rótulo some; o ícone SEMPRE existe porque ocupa o lugar da foto.
  assert.equal(nomeDoTipoTransporte('helicoptero'), null);
  assert.equal(iconeDoTipoTransporte('helicoptero'), 'Bus');
});

test('sem tipo preenchido (o caso dos cadastros antigos) o ícone é o genérico', () => {
  assert.equal(nomeDoTipoTransporte(null), null);
  assert.equal(iconeDoTipoTransporte(null), 'Bus');
});

test('tipo conhecido devolve o nome e o ícone dele', () => {
  assert.equal(nomeDoTipoTransporte('moto'), 'Moto / Mototáxi');
  assert.equal(iconeDoTipoTransporte('moto'), 'Bike');
});
