// A busca de CEP pelo pino.
//
// O QUE PRECISA DE TESTE AQUI É O QUE VOLTA ERRADO SEM AVISAR
//
// A rede não é o risco: se o ViaCEP cair, a tela mostra recado e o cadastro
// continua à mão. O risco é a resposta chegar e ser interpretada mal — CEP
// genérico do município oferecido como se fosse o da rua, duplicado aparecendo
// como opção diferente, ou o CEP do bairro certo enterrado no meio da lista.
//
// Nesses casos ninguém percebe: o campo fica preenchido, e campo preenchido
// errado é pior do que campo vazio, porque vazio se vê.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buscarCepsPorLogradouro,
  candidatosDaResposta,
  cepGenerico,
  cepValido,
  normalizarCep,
  nucleoDoLogradouro,
  ordenarCandidatos,
} from '../lib/cepLookup.js';

/* --- Normalização --- */

test('o CEP sai sempre no mesmo formato, venha como vier', () => {
  assert.equal(normalizarCep('56400000'), '56400-000');
  assert.equal(normalizarCep('56400-000'), '56400-000');
  assert.equal(normalizarCep(' 56.400-000 '), '56400-000');
  assert.equal(normalizarCep(56400000), '56400-000');
});

test('o que nao e CEP nao vira CEP', () => {
  for (const ruim of ['', '5640', '564000000', 'abcdefgh', null, undefined, {}]) {
    assert.equal(normalizarCep(ruim), null, `${JSON.stringify(ruim)} nao deveria virar CEP`);
    assert.equal(cepValido(ruim), false);
  }
});

// O `-000` vale para a cidade inteira. Preencher o cadastro com ele daria uma
// base cheia de campos preenchidos e nenhum CEP util.
test('o CEP generico do municipio e reconhecido como generico', () => {
  assert.equal(cepGenerico('56400-000'), true);
  assert.equal(cepGenerico('56406-200'), false);
  assert.equal(cepGenerico('nao e cep'), false);
});

/* --- Nome da via --- */

test('o tipo da via nao atrapalha a comparacao', () => {
  assert.equal(nucleoDoLogradouro('Avenida Inês Barros'), 'ines barros');
  assert.equal(nucleoDoLogradouro('Av. Inês Barros'), 'ines barros');
  assert.equal(nucleoDoLogradouro('Rua Dom Bosco'), 'dom bosco');
  assert.equal(nucleoDoLogradouro('Travessa Manoel Polmata'), 'manoel polmata');
  // Sem tipo na frente, o nome inteiro e o nucleo.
  assert.equal(nucleoDoLogradouro('Beco das Almas'), 'das almas');
});

/* --- Resposta do ViaCEP --- */

const RESPOSTA = [
  { cep: '56406-200', logradouro: 'Avenida Inês Barros', bairro: 'Três Marias', localidade: 'Floresta', uf: 'PE' },
  { cep: '56408-015', logradouro: 'Avenida Inês Barros', bairro: 'Né Maniçoba - AABB', localidade: 'Floresta', uf: 'pe' },
  { cep: '56408-193', logradouro: 'Avenida Inês Barros', bairro: 'Morada Nobre', localidade: 'Floresta', uf: 'PE' },
];

test('a resposta vira a lista que a tela usa', () => {
  const lista = candidatosDaResposta(RESPOSTA);
  assert.equal(lista.length, 3);
  assert.equal(lista[0].cep, '56406-200');
  assert.equal(lista[0].bairro, 'Três Marias');
  assert.equal(lista[1].uf, 'PE', 'a UF sai sempre maiuscula');
  assert.equal(lista[0].generico, false);
});

// A mesma via pode voltar em duas grafias, com o mesmo CEP. Repetido na tela,
// parece opcao diferente — e a pessoa escolhe uma delas achando que decidiu.
test('CEP repetido aparece uma vez so', () => {
  const lista = candidatosDaResposta([
    ...RESPOSTA,
    { cep: '56406200', logradouro: 'Av Ines Barros', bairro: 'Três Marias', localidade: 'Floresta', uf: 'PE' },
  ]);
  assert.equal(lista.length, 3);
});

test('resposta fora do formato nao quebra a tela', () => {
  for (const lixo of [null, undefined, {}, { erro: true }, 'texto']) {
    assert.deepEqual(candidatosDaResposta(lixo), []);
  }
  // Item sem CEP e descartado, os demais sobrevivem.
  assert.equal(candidatosDaResposta([{ logradouro: 'Sem cep' }, RESPOSTA[0]]).length, 1);
});

/* --- Ordenação --- */

test('o CEP do bairro ja escolhido vem primeiro', () => {
  const lista = ordenarCandidatos(candidatosDaResposta(RESPOSTA), {
    logradouro: 'Avenida Inês Barros',
    bairro: 'Morada Nobre',
  });
  assert.equal(lista[0].bairro, 'Morada Nobre');
  assert.equal(lista[0].cep, '56408-193');
});

test('o generico do municipio cai para o fim', () => {
  const lista = ordenarCandidatos(
    candidatosDaResposta([
      { cep: '56400-000', logradouro: 'Floresta', bairro: '', localidade: 'Floresta', uf: 'PE' },
      ...RESPOSTA,
    ]),
    { logradouro: 'Avenida Inês Barros', bairro: '' }
  );
  assert.equal(lista.at(-1).cep, '56400-000');
});

test('sem bairro escolhido, quem casa o nome da via vence', () => {
  const lista = ordenarCandidatos(
    candidatosDaResposta([
      { cep: '56404-103', logradouro: 'Avenida Bela Vista', bairro: 'São Francisco', localidade: 'Floresta', uf: 'PE' },
      RESPOSTA[0],
    ]),
    { logradouro: 'Av. Inês Barros' }
  );
  assert.equal(lista[0].logradouro, 'Avenida Inês Barros');
});

/* --- Busca --- */

const respostaFalsa = (corpo, ok = true) => async () => ({
  ok,
  json: async () => corpo,
});

test('a busca devolve os candidatos ordenaveis', async () => {
  const r = await buscarCepsPorLogradouro(
    { uf: 'PE', cidade: 'Floresta', logradouro: 'Inês Barros' },
    { fetchImpl: respostaFalsa(RESPOSTA) }
  );
  assert.equal(r.ok, true);
  assert.equal(r.motivo, 'ok');
  assert.equal(r.candidatos.length, 3);
});

// O ViaCEP exige UF, municipio e tres letras da via. Mandar assim mesmo
// devolveria 400, e tratar 400 como "nao achei" esconderia de quem cadastra
// que a busca nem aconteceu.
test('dados insuficientes nem chegam a bater na rede', async () => {
  let chamou = false;
  const espiao = async () => { chamou = true; return { ok: true, json: async () => [] }; };

  for (const entrada of [
    { uf: '', cidade: 'Floresta', logradouro: 'Inês Barros' },
    { uf: 'PE', cidade: '', logradouro: 'Inês Barros' },
    { uf: 'PE', cidade: 'Floresta', logradouro: 'In' },
    {},
  ]) {
    const r = await buscarCepsPorLogradouro(entrada, { fetchImpl: espiao });
    assert.equal(r.ok, false);
    assert.equal(r.motivo, 'dados-insuficientes');
  }

  assert.equal(chamou, false, 'nao deveria ter chamado a rede');
});

test('"nao encontrei" e resposta, nao falha', async () => {
  const r = await buscarCepsPorLogradouro(
    { uf: 'PE', cidade: 'Floresta', logradouro: 'Rua Que Nao Existe' },
    { fetchImpl: respostaFalsa({ erro: true }) }
  );
  assert.equal(r.ok, true);
  assert.equal(r.motivo, 'sem-resultado');
  assert.deepEqual(r.candidatos, []);
});

test('servico fora do ar nao trava o cadastro', async () => {
  const caiu = await buscarCepsPorLogradouro(
    { uf: 'PE', cidade: 'Floresta', logradouro: 'Inês Barros' },
    { fetchImpl: async () => { throw new Error('offline'); } }
  );
  assert.equal(caiu.ok, false);
  assert.equal(caiu.motivo, 'servico-indisponivel');

  const erro500 = await buscarCepsPorLogradouro(
    { uf: 'PE', cidade: 'Floresta', logradouro: 'Inês Barros' },
    { fetchImpl: respostaFalsa([], false) }
  );
  assert.equal(erro500.motivo, 'servico-indisponivel');
});

// AS ABREVIACOES SAO O CASO QUE MAIS CUSTOU
//
// O ViaCEP responde HTTP 400 com ponto no logradouro, e guarda a forma por
// extenso. Sem abrir "Cel." em "Coronel", a rua nem era consultada — e quando
// era, o resultado certo vinha e era DESCARTADO pelo casamento estrito, como se
// fosse de outra rua. Falha dupla, as duas caladas.
test('a forma abreviada e a por extenso viram o mesmo nucleo', () => {
  const pares = [
    ['Rua Cel. Manoel Neto', 'Rua Coronel Manoel Neto'],
    ['Rua Dr. Gilberto Ferraz', 'Rua Doutor Gilberto Ferraz'],
    ['Av. Prof. Ana Lima', 'Avenida Professor Ana Lima'],
    ['Rua Pe. Cicero', 'Rua Padre Cicero'],
    ['Rua Sta. Rosa', 'Rua Santa Rosa'],
  ];

  for (const [abreviado, extenso] of pares) {
    assert.equal(
      nucleoDoLogradouro(abreviado),
      nucleoDoLogradouro(extenso),
      `${abreviado} deveria casar com ${extenso}`
    );
  }
});

test('ponto solto no meio do nome nao sobrevive ao nucleo', () => {
  // "C. Leitão" e inicial de nome: o ponto quebraria a consulta e nao ajuda a
  // comparar.
  assert.equal(nucleoDoLogradouro('Rua Ângelo Tadeu de C. Leitão'), 'angelo tadeu de c leitao');
  assert.ok(!nucleoDoLogradouro('Rua Dr. Fulano').includes('.'));
});
