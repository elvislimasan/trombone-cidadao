// Os relatórios de pavimentação.
//
// POR QUE ESTES TESTES PAGAM MAIS QUE A MÉDIA
//
// Um relatório que vai para a prefeitura tem autoridade de documento: ninguém
// confere "312 ruas sem pavimentação" somando na mão. Se a conta estiver
// errada, ela vira número oficial — e o erro só aparece quando alguém tenta
// orçar a obra com ele.
//
// Por isso o que se testa aqui é a CONTA e o RECORTE, não a aparência: quantas
// entram, quantas ficam de fora, e se cada tipo responde exatamente a pergunta
// que o nome dele promete.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  TIPOS_DE_RELATORIO,
  cepsDaRua,
  contarPorStatus,
  montarRelatorio,
  relatorioParaCsv,
  rotuloDoPavimento,
  rotuloDoStatus,
  tipoDeRelatorio,
} from '../lib/pavementReport.js';

const rua = (over = {}) => ({
  name: 'Rua Teste',
  status: 'unpaved',
  is_unnamed: false,
  pavement_type: null,
  cep: null,
  ceps: null,
  bairro: { name: 'Centro' },
  ...over,
});

const BASE = [
  rua({ name: 'Rua A', status: 'paved', pavement_type: 'asphalt', cep: '56400-000' }),
  rua({ name: 'Rua B', status: 'paved', pavement_type: 'paving_stone', cep: '56400-001' }),
  rua({ name: 'Rua C', status: 'partially_paved', bairro: { name: 'Alto' } }),
  rua({ name: 'Rua D', status: 'unpaved', bairro: { name: 'Alto' } }),
  rua({ name: 'Rua E', status: 'unpaved', is_unnamed: true }),
];

/* --- CEP --- */

test('uma rua pode ter varios CEPs, e a lista nova vence a coluna antiga', () => {
  const varios = rua({
    cep: '56400-000',
    ceps: [
      { cep: '56400-111', bairro_id: 'a' },
      { cep: '56400-222', bairro_id: 'b' },
    ],
  });

  assert.deepEqual(cepsDaRua(varios), [
    { cep: '56400-111', bairroId: 'a' },
    { cep: '56400-222', bairroId: 'b' },
  ]);
});

// A migracao nao acontece num instante: enquanto a coluna nova nao existir, o
// valor antigo precisa continuar aparecendo. Sem isto a tela ficaria sem CEP
// nenhum no meio do caminho.
test('sem a lista nova, o CEP antigo responde', () => {
  assert.deepEqual(cepsDaRua(rua({ cep: '56400-000', bairro_id: 'x' })), [
    { cep: '56400-000', bairroId: 'x' },
  ]);
  assert.deepEqual(cepsDaRua(rua({ cep: '   ' })), []);
  assert.deepEqual(cepsDaRua(rua()), []);
  assert.deepEqual(cepsDaRua(null), []);
});

test('CEP vazio dentro da lista nao conta como cadastrado', () => {
  assert.deepEqual(cepsDaRua(rua({ ceps: [{ cep: '  ' }, { cep: '56400-333' }] })), [
    { cep: '56400-333', bairroId: null },
  ]);
});

/* --- Contagem --- */

test('a contagem por status bate com o que existe', () => {
  const c = contarPorStatus(BASE);
  assert.equal(c.total, 5);
  assert.equal(c.paved, 2);
  assert.equal(c.partially_paved, 1);
  assert.equal(c.unpaved, 2);
  assert.equal(c.semNome, 1);
  assert.equal(c.semCep, 3);
});

test('status desconhecido nao e contado como nenhum dos tres', () => {
  const c = contarPorStatus([rua({ status: 'inventado' }), rua({ status: 'paved' })]);
  assert.equal(c.total, 2);
  assert.equal(c.paved, 1);
  assert.equal(c.unpaved, 0);
  assert.equal(c.partially_paved, 0);
});

/* --- Tipos --- */

test('cada tipo responde a pergunta do proprio nome', () => {
  const semPav = montarRelatorio('unpaved', BASE);
  assert.equal(semPav.secoes.length, 1);
  assert.equal(semPav.secoes[0].linhas.length, 2);
  assert.ok(semPav.secoes[0].titulo.includes('(2)'));

  const semNome = montarRelatorio('unnamed', BASE);
  assert.equal(semNome.secoes[0].linhas.length, 1);
  assert.equal(semNome.secoes[0].linhas[0][0], 'Rua E');

  const semCep = montarRelatorio('sem-cep', BASE);
  assert.equal(semCep.secoes[0].linhas.length, 3);

  const parcial = montarRelatorio('partially_paved', BASE);
  assert.equal(parcial.secoes[0].linhas.length, 1);
});

test('o resumo por bairro fecha com o total', () => {
  const r = montarRelatorio('bairros', BASE);
  const linhas = r.secoes[0].linhas;
  assert.equal(linhas.length, 2);

  const soma = linhas.reduce((total, l) => total + l[5], 0);
  assert.equal(soma, BASE.length, 'a soma dos bairros precisa dar o total de ruas');

  // Ordem alfabetica: "Alto" antes de "Centro".
  assert.equal(linhas[0][0], 'Alto');
});

// Rua sem pavimento nao tem tipo de pavimento — inclui-la inventaria um
// "Nao informado" que nao descreve nada.
test('o relatorio por pavimento ignora as ruas sem pavimentacao', () => {
  const r = montarRelatorio('pavimento', BASE);
  const soma = r.secoes[0].linhas.reduce((total, l) => total + l[1], 0);
  assert.equal(soma, 3, 'so as pavimentadas e parcialmente entram');
  assert.ok(r.secoes[0].linhas.some((l) => l[0] === 'Asfalto'));
});

test('a lista completa traz o CEP e o panorama nao traz secao nenhuma', () => {
  const completa = montarRelatorio('completo', BASE);
  assert.equal(completa.secoes[0].colunas.at(-1), 'CEP');
  assert.equal(completa.secoes[0].linhas.length, 5);

  const panorama = montarRelatorio('panorama', BASE);
  assert.deepEqual(panorama.secoes, []);
  assert.ok(panorama.resumo.length > 0, 'o panorama vive do resumo');
});

// O resumo acompanha TODOS os tipos: "312 sem pavimentacao" significa uma coisa
// numa cidade de 400 ruas e outra numa de 4.000.
test('todo tipo carrega o resumo junto', () => {
  for (const tipo of TIPOS_DE_RELATORIO) {
    const r = montarRelatorio(tipo.id, BASE);
    assert.equal(r.resumo[0].rotulo, 'Total de ruas');
    assert.equal(r.resumo[0].valor, 5, `${tipo.id} perdeu o total`);
    assert.equal(r.subtitulo, tipo.label);
  }
});

test('lista vazia nao gera secao fantasma', () => {
  for (const tipo of TIPOS_DE_RELATORIO) {
    const r = montarRelatorio(tipo.id, []);
    assert.deepEqual(r.secoes, [], `${tipo.id} inventou secao sem dados`);
    assert.equal(r.contagem.total, 0);
  }
});

test('tipo desconhecido cai no panorama em vez de quebrar', () => {
  assert.equal(tipoDeRelatorio('inventado').id, 'panorama');
  assert.equal(montarRelatorio(undefined, BASE).tipo, 'panorama');
});

/* --- Recorte por bairro --- */

test('o recorte por bairro muda a conta, e nao so a lista', () => {
  const r = montarRelatorio('completo', BASE, { bairros: ['Alto'] });
  assert.equal(r.contagem.total, 2);
  assert.equal(r.secoes[0].linhas.length, 2);
  assert.equal(r.recorte, 'Alto');

  // Sem recorte, nada e filtrado.
  assert.equal(montarRelatorio('completo', BASE, { bairros: [] }).contagem.total, 5);
});

/* --- CSV --- */

test('o CSV sai pronto para o Excel em portugues', () => {
  const csv = relatorioParaCsv(montarRelatorio('unpaved', BASE, { cidade: 'Floresta' }));

  assert.ok(csv.startsWith('﻿'), 'sem BOM o Excel erra o acento');
  assert.ok(csv.includes(';'), 'o separador do Excel pt-BR e ponto e virgula');
  assert.ok(csv.includes('Relatório de Pavimentação — Floresta'));
  assert.ok(csv.includes('Rua D'));
  assert.ok(!csv.includes('Rua A'), 'pavimentada nao entra no relatorio de sem pavimentacao');
});

test('campo com ponto e virgula ou aspas nao quebra a coluna', () => {
  const csv = relatorioParaCsv(
    montarRelatorio('completo', [rua({ name: 'Rua A; "do meio"', status: 'paved' })])
  );
  assert.ok(csv.includes('"Rua A; ""do meio"""'));
});

/* --- Rótulos --- */

test('os rotulos nunca saem em branco', () => {
  assert.equal(rotuloDoStatus('paved'), 'Pavimentada');
  assert.equal(rotuloDoStatus('inventado'), 'Sem informação');
  assert.equal(rotuloDoPavimento('asphalt'), 'Asfalto');
  assert.equal(rotuloDoPavimento(null), 'Não informado');
});
