// O canal de e-mail da secretaria.
//   node --test src/test/canalDoOrgao.test.mjs
//
// O risco que estes testes guardam não é de formatação: é o app afirmar
// encaminhamento que não aconteceu. Duas coisas garantem isso, e as duas são
// silenciosas quando quebram — a frase de cobrança contar envio que voltou, e o
// mês do relatório escorregar um dia por causa de fuso, mandando à prefeitura
// um "relatório de julho" cheio de bronca de agosto.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ESTADOS_DO_ENVIO,
  estadoDoEnvio,
  emailPlausivel,
  listaDeEmails,
  problemasDoCanal,
  categoriasOcupadas,
  periodoPorExtenso,
  fraseDeCobranca,
} from '../lib/canalDoOrgao.js';

// ── A invariante: só entrega vira etapa ──────────────────────────────────────

test('um único estado grava etapa, e é a entrega', () => {
  const gravam = ESTADOS_DO_ENVIO.filter((e) => e.gravaEtapa).map((e) => e.id);
  assert.deepEqual(gravam, ['entregue']);
});

test('"enviado" avisa em texto que nada foi encaminhado ainda', () => {
  const e = estadoDoEnvio('enviado');
  assert.equal(e.gravaEtapa, false);
  assert.match(e.detalhe, /não há confirmação de entrega/i);
});

test('estado desconhecido não vira prova de encaminhamento', () => {
  assert.equal(estadoDoEnvio('qualquer-coisa').gravaEtapa, false);
  assert.equal(estadoDoEnvio('qualquer-coisa').rotulo, 'Desconhecido');
  assert.equal(estadoDoEnvio(undefined).gravaEtapa, false);
});

// ── Endereços ────────────────────────────────────────────────────────────────

test('aceita endereço de prefeitura e recusa digitação sem arroba', () => {
  assert.ok(emailPlausivel('obras@florestape.gov.br'));
  assert.ok(emailPlausivel('ouvidoria.geral@prefeitura.pe.gov.br'));
  assert.ok(!emailPlausivel('obras.florestape.gov.br'));
  assert.ok(!emailPlausivel('obras@prefeitura'));
  assert.ok(!emailPlausivel('  '));
  assert.ok(!emailPlausivel(null));
});

test('a lista de cópia aceita vírgula, ponto-e-vírgula e quebra de linha', () => {
  assert.deepEqual(
    listaDeEmails('a@x.com, b@x.com;\nc@x.com\n\n'),
    ['a@x.com', 'b@x.com', 'c@x.com']
  );
  assert.deepEqual(listaDeEmails(''), []);
});

// ── O que impede salvar ──────────────────────────────────────────────────────

const canalValido = {
  nome: 'Secretaria de Obras',
  email: 'obras@florestape.gov.br',
  replyTo: 'embaixador@exemplo.com',
  copias: [],
  categorias: ['buracos'],
};

test('canal completo não tem problema nenhum', () => {
  assert.deepEqual(problemasDoCanal(canalValido), []);
});

test('canal sem categoria não pode ser salvo — não haveria o que enviar', () => {
  const erros = problemasDoCanal({ ...canalValido, categorias: [] });
  assert.equal(erros.length, 1);
  assert.match(erros[0], /categoria/i);
});

test('reply-to é obrigatório: a resposta da secretaria precisa cair em alguém', () => {
  const erros = problemasDoCanal({ ...canalValido, replyTo: '' });
  assert.match(erros.join(' '), /resposta/i);
});

test('cada campo ruim vira uma frase própria', () => {
  const erros = problemasDoCanal({
    nome: 'Ob',
    email: 'errado',
    replyTo: '',
    copias: ['ok@x.com', 'ruim'],
    categorias: [],
  });
  assert.equal(erros.length, 5);
  assert.match(erros.join(' '), /"ruim"/);
});

// ── Um responsável por categoria ─────────────────────────────────────────────

const canais = [
  { id: 'a', nome: 'Secretaria de Obras', categorias: ['buracos', 'iluminacao'] },
  { id: 'b', nome: 'Secretaria de Limpeza', categorias: ['limpeza'] },
];

test('categoria de outro canal aparece como ocupada, com o nome de quem a tem', () => {
  const ocupadas = categoriasOcupadas(canais, 'b');
  assert.equal(ocupadas.get('buracos'), 'Secretaria de Obras');
  assert.equal(ocupadas.get('iluminacao'), 'Secretaria de Obras');
});

test('o próprio canal não bloqueia as categorias que já são dele', () => {
  const ocupadas = categoriasOcupadas(canais, 'a');
  assert.equal(ocupadas.has('buracos'), false);
  assert.equal(ocupadas.get('limpeza'), 'Secretaria de Limpeza');
});

// ── O período. Aqui mora o bug de fuso ───────────────────────────────────────

test('o mês do relatório não escorrega por causa de fuso', () => {
  // `new Date('2026-08-01')` é meia-noite UTC = 31/07 21:00 em Recife. Uma
  // implementação ingênua diria "julho de 2026" num relatório de agosto.
  assert.equal(periodoPorExtenso('mensal', '2026-08-01'), 'agosto de 2026');
  assert.equal(periodoPorExtenso('mensal', '2026-01-01'), 'janeiro de 2026');
  assert.equal(periodoPorExtenso('mensal', '2026-12-01'), 'dezembro de 2026');
});

test('a semana vai da segunda ao domingo, atravessando mês e ano', () => {
  assert.equal(periodoPorExtenso('semanal', '2026-08-24'), '24/08 a 30/08/2026');
  assert.equal(periodoPorExtenso('semanal', '2026-08-31'), '31/08 a 06/09/2026');
  assert.equal(periodoPorExtenso('semanal', '2026-12-28'), '28/12 a 03/01/2027');
});

test('referência ausente não vira "NaN de undefined" no assunto do e-mail', () => {
  assert.equal(periodoPorExtenso('mensal', null), '');
  assert.equal(periodoPorExtenso('semanal', 'qualquer coisa'), '');
});

// ── A cobrança dentro da bronca ──────────────────────────────────────────────

test('sem envio entregue, a tela some inteira em vez de dizer "cobrada 0 vezes"', () => {
  assert.equal(fraseDeCobranca(null), null);
  assert.equal(fraseDeCobranca({ total: 0 }), null);
});

test('a frase conta os envios e diz desde quando', () => {
  const f = fraseDeCobranca({
    orgao: 'Secretaria de Obras',
    total: 4,
    primeira: '2026-09-03T11:02:00Z',
    confirmadas: 0,
  });
  assert.match(f.titulo, /Secretaria de Obras 4 vezes desde 03\/09\/2026/);
  assert.match(f.detalhe, /ainda não confirmou/i);
});

test('uma vez é "uma vez", não "1 vezes"', () => {
  const f = fraseDeCobranca({ orgao: 'Sec. de Obras', total: 1, confirmadas: 1 });
  assert.match(f.titulo, /uma vez/);
  assert.match(f.detalhe, /Todos os envios foram confirmados/);
});

test('confirmação parcial é dita como parcial', () => {
  const f = fraseDeCobranca({ orgao: 'Sec. de Obras', total: 3, confirmadas: 1 });
  assert.match(f.detalhe, /1 de 3/);
});

test('sem nome de órgão a frase continua uma frase', () => {
  const f = fraseDeCobranca({ total: 2 });
  assert.match(f.titulo, /o órgão responsável 2 vezes/);
  assert.doesNotMatch(f.titulo, /undefined|null|NaN/);
});
