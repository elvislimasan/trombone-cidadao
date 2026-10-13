import test from 'node:test';
import assert from 'node:assert/strict';
import { correspondeABuscaDeRua } from '../lib/pavementStreetSearch.js';

const rua = {
  name: 'Rua São José',
  bairro: { name: 'São Francisco' },
  informal_names: ['Rua da Feira'],
  ceps: [{ cep: '56404-103' }, { cep: '56408-193' }],
};

test('encontra qualquer CEP da rua com ou sem máscara', () => {
  for (const busca of ['56404-103', '56404103', '56408-193', '56408193', ' 56408 - 193 ']) {
    assert.equal(correspondeABuscaDeRua(rua, busca), true, busca);
  }
  assert.equal(correspondeABuscaDeRua(rua, '56408-194'), false);
});

test('filtra também enquanto o CEP está sendo digitado', () => {
  for (const busca of ['564', '56408', '56408-', '56408-1']) {
    assert.equal(correspondeABuscaDeRua(rua, busca), true, busca);
  }
});

test('aceita o campo antigo e ruas sem CEP', () => {
  for (const ceps of [undefined, null, []]) {
    assert.equal(correspondeABuscaDeRua({ cep: '56404-103', ceps }, '56404103'), true);
  }
  for (const semCep of [null, {}, { ceps: [{ cep: '' }] }]) {
    assert.equal(correspondeABuscaDeRua(semCep, '56404103'), false);
  }
});

test('preserva busca por nome, bairro e apelido ignorando acentos e caixa', () => {
  for (const busca of ['sao jose', 'SÃO FRANCISCO', 'rua da feira']) {
    assert.equal(correspondeABuscaDeRua(rua, busca), true, busca);
  }
  assert.equal(correspondeABuscaDeRua(rua, 'outra rua'), false);
  assert.equal(correspondeABuscaDeRua({ name: 'Rua Projetada 20' }, 'Rua Projetada 20'), true);
});

test('não confunde números em nomes ou termos sem dígitos com CEP', () => {
  for (const busca of ['Rua 56404', 'CEP 56404', '-', '---']) {
    assert.equal(correspondeABuscaDeRua(rua, busca), false, busca);
  }
});

test('busca vazia mantém todas as ruas no recorte', () => {
  assert.equal(correspondeABuscaDeRua(rua, ''), true);
  assert.equal(correspondeABuscaDeRua({}, '  '), true);
});
