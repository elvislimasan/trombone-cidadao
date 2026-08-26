// O parser da listagem dos Correios.
//
// POR QUE UM PARSER DE TEXTO MERECE TESTE
//
// Ele lê 408 linhas de uma vez e o resultado vai direto para o banco. Um erro
// de recorte não aparece na tela: aparece como uma rua com o CEP do vizinho, ou
// com o bairro no lugar do nome — dados plausíveis, que ninguém confere.
//
// O caso perigoso é a coluna sem delimitador: "Floresta Rua X 56404-003 Centro"
// é uma linha só, e o que separa as colunas é o CEP. Nome de rua com número,
// com hífen ou com a palavra "Floresta" dentro são as armadilhas.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  cepsDaListagem,
  indexarListagem,
  lerListagemCorreios,
} from '../lib/correiosListagem.js';

const TEXTO = [
  'Localidade Logradouro CEP Bairro',
  'Floresta Avenida Dom Augusto Silva 56404-003 Alto da Ermida',
  'Floresta Praça José Araújo Ferraz - Zito 56404-012 Alto da Ermida',
  'Floresta Rua Projetada 3 56404-027 Alto da Ermida',
  'Floresta Rua Doutor Gilberto Ferraz 56408-474 Bela Floresta',
  'Floresta Avenida Inês Barros 56406-200 Três Marias',
  'Floresta Avenida Inês Barros 56408-193 Morada Nobre',
  'Aualização Logradouros - DNE - Nacional - Floresta - PE',
].join('\n');

test('cada linha vira cidade, logradouro, CEP e bairro', () => {
  const { entradas } = lerListagemCorreios(TEXTO, { cidade: 'Floresta' });

  assert.equal(entradas.length, 6);
  assert.deepEqual(entradas[0], {
    logradouro: 'Avenida Dom Augusto Silva',
    cep: '56404-003',
    bairro: 'Alto da Ermida',
  });
});

// O que separa as colunas e o CEP, e nao o espaco: nome com hifen, com numero
// ou com varias palavras precisa sobreviver inteiro.
test('nome com hifen e com numero nao e cortado no lugar errado', () => {
  const { entradas } = lerListagemCorreios(TEXTO, { cidade: 'Floresta' });

  const zito = entradas.find((e) => e.cep === '56404-012');
  assert.equal(zito.logradouro, 'Praça José Araújo Ferraz - Zito');
  assert.equal(zito.bairro, 'Alto da Ermida');

  const projetada = entradas.find((e) => e.cep === '56404-027');
  assert.equal(projetada.logradouro, 'Rua Projetada 3');
});

// Cabecalho e rodape do relatorio nao sao ruas. Guardar em vez de descartar em
// silencio e o que permite conferir que SO isso ficou de fora — uma linha de
// rua ignorada passaria despercebida no meio de 400.
test('o que nao e rua fica separado, e nao sumido', () => {
  const { entradas, ignoradas } = lerListagemCorreios(TEXTO, { cidade: 'Floresta' });

  assert.equal(ignoradas.length, 2);
  assert.ok(ignoradas[0].startsWith('Localidade'));
  assert.equal(entradas.length + ignoradas.length, 8, 'nenhuma linha pode sumir');
});

// "Floresta" e o nome da cidade E pode estar no nome do bairro ("Bela
// Floresta"). Tirar o prefixo por busca cega apagaria a palavra errada.
test('a cidade sai do comeco sem tocar no resto da linha', () => {
  const { entradas } = lerListagemCorreios(
    'Floresta Rua Bela Floresta 56408-999 Bela Floresta',
    { cidade: 'Floresta' }
  );

  assert.equal(entradas[0].logradouro, 'Rua Bela Floresta');
  assert.equal(entradas[0].bairro, 'Bela Floresta');
});

test('sem o nome da cidade, o logradouro vem com ela junto', () => {
  const { entradas } = lerListagemCorreios('Floresta Rua X 56404-003 Centro');
  assert.equal(entradas[0].logradouro, 'Floresta Rua X');
});

/* --- Índice --- */

// A rua comprida aparece uma vez por bairro. O indice tem de guardar TODAS:
// e exatamente o caso que o campo de CEP unico nao dava conta.
test('a mesma rua em bairros diferentes guarda os dois CEPs', () => {
  const { entradas } = lerListagemCorreios(TEXTO, { cidade: 'Floresta' });
  const indice = indexarListagem(entradas);

  const ines = cepsDaListagem(indice, 'Avenida Inês Barros');
  assert.equal(ines.length, 2);
  assert.deepEqual(ines.map((e) => e.cep).sort(), ['56406-200', '56408-193']);
});

// O nucleo abre abreviacoes: e isso que faz o cadastro abreviado encontrar a
// listagem por extenso.
test('a rua abreviada no cadastro encontra a por extenso na listagem', () => {
  const { entradas } = lerListagemCorreios(TEXTO, { cidade: 'Floresta' });
  const indice = indexarListagem(entradas);

  const achou = cepsDaListagem(indice, 'Rua Dr. Gilberto Ferraz');
  assert.equal(achou.length, 1);
  assert.equal(achou[0].cep, '56408-474');
});

test('rua que nao esta na listagem devolve lista vazia', () => {
  const { entradas } = lerListagemCorreios(TEXTO, { cidade: 'Floresta' });
  const indice = indexarListagem(entradas);

  assert.deepEqual(cepsDaListagem(indice, 'Rua Que Nao Existe'), []);
  assert.deepEqual(cepsDaListagem(indice, ''), []);
  assert.deepEqual(cepsDaListagem(indice, null), []);
});

test('texto vazio ou invalido nao quebra', () => {
  for (const entrada of ['', null, undefined, '   \n  \n']) {
    const r = lerListagemCorreios(entrada, { cidade: 'Floresta' });
    assert.deepEqual(r.entradas, []);
  }
});
