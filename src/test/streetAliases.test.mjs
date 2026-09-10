import test from 'node:test';
import assert from 'node:assert/strict';

import {
  apelidosDaRua,
  apelidosParaFormulario,
  normalizarApelidosDaRua,
} from '../lib/streetAliases.js';

test('aceita um apelido por linha, virgula ou ponto e virgula', () => {
  assert.deepEqual(
    normalizarApelidosDaRua('Rua da Feira\nRua Velha; Beco do Mercado'),
    ['Rua da Feira', 'Rua Velha', 'Beco do Mercado'],
  );
});

test('remove repeticoes e o proprio nome oficial ignorando acentos e caixa', () => {
  assert.deepEqual(
    normalizarApelidosDaRua(
      ['Rua São João', 'rua sao joao', 'RUA DO CAMPO', 'Rua do Campo'],
      'Rua São João',
    ),
    ['RUA DO CAMPO'],
  );
});

test('converte a lista salva para o campo de varias linhas', () => {
  const street = { name: 'Rua Oficial', informal_names: ['Rua Antiga', 'Rua da Caixa'] };
  assert.deepEqual(apelidosDaRua(street), ['Rua Antiga', 'Rua da Caixa']);
  assert.equal(apelidosParaFormulario(street), 'Rua Antiga\nRua da Caixa');
});

