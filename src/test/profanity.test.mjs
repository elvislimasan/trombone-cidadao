// Máscara de baixo calão em comentários.
//   node --test src/test/profanity.test.mjs
//
// O que estes testes guardam não é a lista de palavrões — é o outro lado dela.
// Um filtro desses falha de duas maneiras, e a segunda é a cara: deixar passar
// um palavrão é um comentário feio no feed; mascarar "escuro" e "reputação" é
// o app corrigindo a fala de quem não xingou ninguém. Por isso metade dos
// casos aqui é de palavra INOCENTE que precisa sair intacta.

import test from 'node:test';
import assert from 'node:assert/strict';

import { mascarar, ehPalavrao, normalizar } from '../lib/profanity.js';

test('mascara mantendo a primeira letra e o tamanho', () => {
  assert.equal(mascarar('que merda de rua').texto, 'que m**** de rua');
  assert.equal(mascarar('caralho').texto, 'c******');
});

test('marca que mascarou', () => {
  assert.equal(mascarar('que merda').mascarou, true);
  assert.equal(mascarar('que rua ruim').mascarou, false);
});

test('texto limpo passa sem alteração', () => {
  const limpo = 'A rua está sem iluminação há 3 dias. Já avisei a prefeitura!';
  assert.equal(mascarar(limpo).texto, limpo);
  assert.equal(mascarar(limpo).mascarou, false);
});

test('pega leetspeak', () => {
  assert.equal(mascarar('c4ralho').texto, 'c******');
  assert.equal(mascarar('p0rra').texto, 'p****');
});

test('pega letra repetida', () => {
  assert.equal(mascarar('caraaaalho').texto, 'c*********');
  assert.equal(mascarar('mermão que merdaaa').mascarou, true);
});

test('pega com acento e caixa alta', () => {
  assert.equal(mascarar('OTÁRIO').texto, 'O*****');
});

// O coração do arquivo. Cada uma destas contém um palavrão como substring e
// NENHUMA pode ser tocada.
test('não mascara palavra inocente que contém palavrão dentro', () => {
  const inocentes = [
    'curso',
    'cuidado',
    'escuro',
    'obscuro',
    'reputação',
    'disputa',
    'computador',
    'circuito',
    'cutucar',
    'açúcar',
    'executivo',
    'assalto',
    'classe',
    'passar',
  ];
  for (const palavra of inocentes) {
    assert.equal(mascarar(palavra).texto, palavra, `mascarou "${palavra}"`);
    assert.equal(ehPalavrao(palavra), false, `"${palavra}" entrou na lista`);
  }
});

// Ambíguas de propósito fora da lista: só ofendem no contexto, e o contexto
// este arquivo não tem.
test('não mascara palavra ambígua deixada fora da lista', () => {
  for (const palavra of ['pau', 'rola', 'pica', 'saco', 'macaco', 'veado', 'cacete']) {
    assert.equal(mascarar(palavra).mascarou, false, `mascarou "${palavra}"`);
  }
});

test('pega inglês', () => {
  assert.equal(mascarar('what the fuck').texto, 'what the f***');
  assert.equal(mascarar('bullshit').texto, 'b*******');
});

test('preserva pontuação e o resto da frase', () => {
  assert.equal(
    mascarar('Isso é uma merda, viu? Merda mesmo!').texto,
    'Isso é uma m****, viu? M**** mesmo!'
  );
});

test('aguenta vazio e nulo', () => {
  assert.equal(mascarar('').texto, '');
  assert.equal(mascarar(null).texto, '');
  assert.equal(mascarar(undefined).mascarou, false);
});

test('normalizar reduz à forma da lista', () => {
  assert.equal(normalizar('PÔRRA'), 'pora');
  assert.equal(normalizar('c4r4lho'), 'caralho');
});
